const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// ATOMIC TRANSACTION FUNCTIONS
exports.sendMoney = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { recipientIdentifier, amount, note, senderId } = data;
    
    // Validate input
    if (!recipientIdentifier || !amount || amount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid input');
    }
    
    if (senderId !== context.auth.uid) {
        throw new functions.https.HttpsError('permission-denied', 'Cannot send money as another user');
    }
    
    const db = admin.firestore();
    const batch = db.batch();
    
    try {
        // 1. Find recipient
        let recipientQuery = await db.collection('users')
            .where('email', '==', recipientIdentifier)
            .limit(1)
            .get();
        
        if (recipientQuery.empty) {
            recipientQuery = await db.collection('users')
                .where('username', '==', recipientIdentifier)
                .limit(1)
                .get();
        }
        
        if (recipientQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Recipient not found');
        }
        
        const recipientDoc = recipientQuery.docs[0];
        const recipientId = recipientDoc.id;
        
        if (recipientId === senderId) {
            throw new functions.https.HttpsError('invalid-argument', 'Cannot send money to yourself');
        }
        
        // 2. Get sender document
        const senderRef = db.collection('users').doc(senderId);
        const senderDoc = await senderRef.get();
        
        if (!senderDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Sender not found');
        }
        
        const senderData = senderDoc.data();
        const fee = amount * 0.02; // 2% fee
        const total = amount + fee;
        
        // 3. Validate sender balance
        if (senderData.balance < total) {
            throw new functions.https.HttpsError('failed-precondition', 'Insufficient balance');
        }
        
        // 4. Create transaction record
        const transactionRef = db.collection('transactions').doc();
        const transactionData = {
            id: transactionRef.id,
            senderId: senderId,
            senderName: senderData.username || senderData.email,
            recipientId: recipientId,
            recipientName: recipientDoc.data().username || recipientDoc.data().email,
            amount: amount,
            fee: fee,
            total: total,
            type: 'send',
            status: 'pending',
            note: note || '',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            participants: [senderId, recipientId]
        };
        
        // 5. Atomic batch write
        // Update sender balance
        batch.update(senderRef, {
            balance: admin.firestore.FieldValue.increment(-total),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Update recipient balance
        const recipientRef = db.collection('users').doc(recipientId);
        batch.update(recipientRef, {
            balance: admin.firestore.FieldValue.increment(amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Create transaction
        batch.set(transactionRef, transactionData);
        
        // 6. Execute batch (ATOMIC OPERATION)
        await batch.commit();
        
        // 7. Update transaction status to completed
        await transactionRef.update({
            status: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 8. Get updated sender balance
        const updatedSenderDoc = await senderRef.get();
        const newBalance = updatedSenderDoc.data().balance;
        
        return {
            success: true,
            transactionId: transactionRef.id,
            newBalance: newBalance
        };
        
    } catch (error) {
        console.error('Send money error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ATOMIC GAME PAYOUT FUNCTION
exports.processGamePayout = functions.firestore
    .document('games/{gameId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        
        // Only process when game status changes to completed
        if (before.status !== 'completed' && after.status === 'completed') {
            const db = admin.firestore();
            const batch = db.batch();
            const gameId = context.params.gameId;
            
            try {
                // Get all bets for this game
                const betsSnapshot = await db.collection('games').doc(gameId)
                    .collection('bets').get();
                
                // Process each bet atomically
                const promises = betsSnapshot.docs.map(async (betDoc) => {
                    const bet = betDoc.data();
                    const userId = bet.userId;
                    const winnings = bet.winnings || 0;
                    
                    if (winnings > 0) {
                        const userRef = db.collection('users').doc(userId);
                        
                        // Create transaction for winnings
                        const transactionRef = db.collection('transactions').doc();
                        const transactionData = {
                            id: transactionRef.id,
                            userId: userId,
                            amount: winnings,
                            type: 'game_win',
                            status: 'completed',
                            gameId: gameId,
                            description: `Game winnings from ${after.name}`,
                            timestamp: admin.firestore.FieldValue.serverTimestamp(),
                            participants: [userId]
                        };
                        
                        batch.set(transactionRef, transactionData);
                        batch.update(userRef, {
                            balance: admin.firestore.FieldValue.increment(winnings),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                });
                
                await Promise.all(promises);
                
                // Execute all updates atomically
                await batch.commit();
                
                console.log(`Processed payouts for game ${gameId}`);
                
            } catch (error) {
                console.error('Game payout error:', error);
                // IMPORTANT: If batch fails, transaction is rolled back automatically
            }
        }
        
        return null;
    });

// BALANCE UPDATE FUNCTION
exports.updateBalance = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { amount, type, description, userId } = data;
    
    if (userId !== context.auth.uid) {
        throw new functions.https.HttpsError('permission-denied', 'Cannot update another user\'s balance');
    }
    
    const db = admin.firestore();
    const batch = db.batch();
    
    try {
        const userRef = db.collection('users').doc(userId);
        const transactionRef = db.collection('transactions').doc();
        
        // Create transaction record
        batch.set(transactionRef, {
            id: transactionRef.id,
            userId: userId,
            amount: amount,
            type: type,
            status: 'completed',
            description: description,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            participants: [userId]
        });
        
        // Update user balance (atomic)
        batch.update(userRef, {
            balance: admin.firestore.FieldValue.increment(amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Execute atomically
        await batch.commit();
        
        // Get updated balance
        const userDoc = await userRef.get();
        const newBalance = userDoc.data().balance;
        
        return {
            success: true,
            newBalance: newBalance
        };
        
    } catch (error) {
        console.error('Balance update error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ADMIN STATS FUNCTION
exports.getAdminStats = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Verify admin role
    const userDoc = await admin.firestore().collection('users')
        .doc(context.auth.uid).get();
    
    const userData = userDoc.data();
    
    if (userData.role !== 'admin' && userData.role !== 'super_admin') {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const db = admin.firestore();
    
    try {
        // Get all stats in parallel
        const [
            totalUsersSnapshot,
            activeUsersSnapshot,
            transactionsSnapshot,
            withdrawalsSnapshot
        ] = await Promise.all([
            db.collection('users').count().get(),
            db.collection('users')
                .where('lastActive', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
                .count().get(),
            db.collection('transactions')
                .where('timestamp', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
                .get(),
            db.collection('transactions')
                .where('type', '==', 'withdrawal')
                .where('status', '==', 'pending')
                .count().get()
        ]);
        
        // Calculate total volume
        let totalVolume = 0;
        transactionsSnapshot.forEach(doc => {
            const transaction = doc.data();
            if (transaction.amount) {
                totalVolume += transaction.amount;
            }
        });
        
        return {
            success: true,
            stats: {
                totalUsers: totalUsersSnapshot.data().count,
                activeToday: activeUsersSnapshot.data().count,
                totalVolume: totalVolume,
                pendingWithdrawals: withdrawalsSnapshot.data().count
            }
        };
        
    } catch (error) {
        console.error('Admin stats error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
