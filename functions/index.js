const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// Import balance management functions
const balanceManagement = require('./src/admin/balance-management');

// ==================== AUTO-CREATE WALLETS ====================
exports.createUserWallet = functions.auth.user().onCreate(async (user) => {
  console.log(`[FUNCTION] Creating wallet for new user: ${user.uid}`);
  
  try {
    const walletData = {
      userId: user.uid,
      email: user.email,
      username: user.email ? user.email.split('@')[0] : 'user',
      balance: 100.0, // Give $100 starting bonus
      status: 'active',
      kycStatus: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      totalDeposited: 0.0,
      totalWithdrawn: 0.0,
      totalWon: 0.0,
      totalLost: 0.0,
      adminNotes: [],
      walletId: `WALLET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    await db.collection('wallets').doc(user.uid).set(walletData);
    
    // Create welcome bonus transaction
    const txRef = db.collection('transactions').doc();
    await txRef.set({
      id: txRef.id,
      userId: user.uid,
      type: 'bonus',
      amount: 100.0,
      description: 'Welcome Bonus!',
      status: 'completed',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userEmail: user.email,
      username: walletData.username,
      previousBalance: 0,
      newBalance: 100.0
    });
    
    console.log(`[SUCCESS] Wallet created for user: ${user.uid} with $100 bonus`);
    return { success: true, userId: user.uid };
    
  } catch (error) {
    console.error(`[ERROR] Failed to create wallet for ${user.uid}:`, error);
    throw error;
  }
});

// ==================== CREATE WALLETS FOR EXISTING USERS ====================
exports.createMissingWallets = functions.https.onRequest(async (req, res) => {
  try {
    // Simple security check
    if (req.query.secret !== 'YOUR_SECRET_KEY') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    console.log('[FUNCTION] Creating missing wallets for existing users...');
    
    // Get all auth users
    const authUsers = await admin.auth().listUsers();
    console.log(`[INFO] Found ${authUsers.users.length} users in Auth`);
    
    // Get existing wallets
    const walletsSnapshot = await db.collection('wallets').get();
    const existingUserIds = new Set();
    walletsSnapshot.forEach(doc => existingUserIds.add(doc.id));
    
    console.log(`[INFO] Found ${existingUserIds.size} existing wallets`);
    
    // Create missing wallets
    const batch = db.batch();
    let created = 0;
    let skipped = 0;
    
    for (const user of authUsers.users) {
      if (!existingUserIds.has(user.uid)) {
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletData = {
          userId: user.uid,
          email: user.email,
          username: user.email ? user.email.split('@')[0] : 'user',
          balance: 100.0,
          status: 'active',
          kycStatus: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastLogin: admin.firestore.FieldValue.serverTimestamp(),
          totalDeposited: 0.0,
          totalWithdrawn: 0.0,
          totalWon: 0.0,
          totalLost: 0.0,
          adminNotes: [],
          walletId: `WALLET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
        
        batch.set(walletRef, walletData);
        created++;
        
        // Create welcome transaction
        const txRef = db.collection('transactions').doc();
        batch.set(txRef, {
          id: txRef.id,
          userId: user.uid,
          type: 'bonus',
          amount: 100.0,
          description: 'Welcome Bonus!',
          status: 'completed',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          userEmail: user.email,
          username: walletData.username,
          previousBalance: 0,
          newBalance: 100.0
        });
        
        // Firestore batch limit (500)
        if (created % 200 === 0) {
          await batch.commit();
          console.log(`[PROGRESS] Created ${created} wallets so far...`);
        }
      } else {
        skipped++;
      }
    }
    
    // Commit remaining
    if (created % 200 !== 0) {
      await batch.commit();
    }
    
    console.log(`[COMPLETE] Created ${created} new wallets, skipped ${skipped} existing`);
    
    return res.json({
      success: true,
      created: created,
      skipped: skipped,
      totalUsers: authUsers.users.length,
      message: `Created ${created} wallets for existing users with $100 bonus each`
    });
    
  } catch (error) {
    console.error('[ERROR] createMissingWallets failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN BALANCE ADJUSTMENT ====================
exports.adminAdjustBalance = functions.https.onCall(async (data, context) => {
  // Verify admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Not authenticated');
  }
  
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || !adminDoc.data().active) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const { userId, amount, action, reason, notes } = data;
  
  if (!userId || !amount || !action) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      // Get wallet
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);
      
      if (!walletDoc.exists) {
        throw new Error('User wallet not found');
      }
      
      const walletData = walletDoc.data();
      let newBalance = walletData.balance;
      
      // Calculate new balance
      if (action === 'add') {
        newBalance = walletData.balance + amount;
      } else if (action === 'subtract') {
        if (walletData.balance < amount) {
          throw new Error('Insufficient balance');
        }
        newBalance = walletData.balance - amount;
      } else if (action === 'set') {
        newBalance = amount;
      } else {
        throw new Error('Invalid action');
      }
      
      // Update wallet
      transaction.update(walletRef, {
        balance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update statistics based on action
      if (action === 'add') {
        transaction.update(walletRef, {
          totalDeposited: admin.firestore.FieldValue.increment(amount)
        });
      } else if (action === 'subtract') {
        transaction.update(walletRef, {
          totalWithdrawn: admin.firestore.FieldValue.increment(amount)
        });
      }
      
      // Create transaction record
      const txRef = db.collection('transactions').doc();
      const txData = {
        transactionId: txRef.id,
        userId: userId,
        type: 'admin_adjustment',
        action: action,
        amount: amount,
        reason: reason || 'Admin adjustment',
        notes: notes || '',
        previousBalance: walletData.balance,
        newBalance: newBalance,
        adminId: context.auth.uid,
        adminEmail: adminDoc.data().email,
        status: 'completed',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      };
      
      transaction.set(txRef, txData);
      
      // Create admin log
      const logRef = db.collection('admin_logs').doc();
      transaction.set(logRef, {
        adminId: context.auth.uid,
        adminEmail: adminDoc.data().email,
        action: 'balance_adjustment',
        targetUserId: userId,
        amount: amount,
        actionType: action,
        reason: reason,
        previousBalance: walletData.balance,
        newBalance: newBalance,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        success: true,
        transactionId: txRef.id,
        userId: userId,
        previousBalance: walletData.balance,
        newBalance: newBalance,
        change: newBalance - walletData.balance
      };
    });
    
    console.log(`[ADMIN] Balance adjusted for ${userId} by ${context.auth.uid}`);
    return result;
    
  } catch (error) {
    console.error('[ERROR] Balance adjustment failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== GET ALL USERS FOR ADMIN ====================
exports.getAdminUsers = functions.https.onCall(async (data, context) => {
  // Verify admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Not authenticated');
  }
  
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || !adminDoc.data().active) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  try {
    const { page = 1, limit = 50, search = '' } = data;
    const offset = (page - 1) * limit;
    
    let query = db.collection('wallets');
    
    // Apply search filter
    if (search) {
      query = query.where('email', '>=', search)
                  .where('email', '<=', search + '\uf8ff');
    }
    
    // Get total count
    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;
    
    // Get paginated data
    const snapshot = await query
      .orderBy('createdAt', 'desc')
      .offset(offset)
      .limit(limit)
      .get();
    
    const users = [];
    snapshot.forEach(doc => {
      users.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return {
      success: true,
      users: users,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        pages: Math.ceil(total / limit)
      }
    };
    
  } catch (error) {
    console.error('[ERROR] getAdminUsers failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== BALANCE MANAGEMENT FUNCTIONS ====================
exports.adminTransferToUser = balanceManagement.adminTransferToUser;
exports.getTransactionHistory = balanceManagement.getTransactionHistory;
exports.getUserWalletStats = balanceManagement.getUserWalletStats;

// ==================== REAL-TIME BALANCE TRIGGER ====================
exports.onBalanceUpdate = functions.firestore
  .document('wallets/{userId}')
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const beforeData = change.before.data();
    const afterData = change.after.data();
    
    const beforeBalance = beforeData.balance || 0;
    const afterBalance = afterData.balance || 0;
    
    // Only log if balance actually changed
    if (beforeBalance !== afterBalance) {
      console.log(`[BALANCE UPDATE] User ${userId}: $${beforeBalance} -> $${afterBalance} (Change: $${afterBalance - beforeBalance})`);
      
      // You could add notification logic here
      // For example, send push notification to user
      
      return null;
    }
    
    return null;
  });

// ==================== GAME TRANSACTION HANDLER ====================
exports.processGameTransaction = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Not authenticated');
  }
  
  const { gameId, betAmount, gameType, result, winAmount, multiplier, gameData } = data;
  
  if (!gameId || !betAmount || !gameType || result === undefined) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required game data');
  }
  
  const userId = context.auth.uid;
  
  try {
    const resultData = await db.runTransaction(async (transaction) => {
      // Get user wallet
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);
      
      if (!walletDoc.exists) {
        throw new Error('Wallet not found');
      }
      
      const walletData = walletDoc.data();
      let newBalance = walletData.balance;
      let transactionType = '';
      let amount = 0;
      
      if (result === 'win' && winAmount > 0) {
        // User won
        transactionType = 'game_win';
        amount = winAmount;
        newBalance = walletData.balance + winAmount;
        
        // Update win statistics
        transaction.update(walletRef, {
          totalWon: admin.firestore.FieldValue.increment(winAmount)
        });
      } else {
        // User lost (or bet placed)
        transactionType = 'game_bet';
        amount = betAmount;
        newBalance = walletData.balance - betAmount;
        
        if (newBalance < 0) {
          throw new Error('Insufficient balance for bet');
        }
        
        // Update loss statistics
        transaction.update(walletRef, {
          totalLost: admin.firestore.FieldValue.increment(betAmount)
        });
      }
      
      // Update balance
      transaction.update(walletRef, {
        balance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        totalGamesPlayed: admin.firestore.FieldValue.increment(1)
      });
      
      // Create game transaction
      const txRef = db.collection('transactions').doc();
      const txData = {
        id: txRef.id,
        userId: userId,
        type: transactionType,
        amount: amount,
        gameId: gameId,
        gameType: gameType,
        betAmount: betAmount,
        winAmount: result === 'win' ? winAmount : 0,
        multiplier: multiplier || 1,
        result: result,
        status: 'completed',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userEmail: walletData.email,
        username: walletData.username,
        previousBalance: walletData.balance,
        newBalance: newBalance,
        gameData: gameData || {}
      };
      
      transaction.set(txRef, txData);
      
      // Create game log
      const gameLogRef = db.collection('game_logs').doc();
      transaction.set(gameLogRef, {
        userId: userId,
        gameId: gameId,
        gameType: gameType,
        betAmount: betAmount,
        result: result,
        winAmount: result === 'win' ? winAmount : 0,
        multiplier: multiplier || 1,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        newBalance: newBalance
      });
      
      return {
        success: true,
        transactionId: txRef.id,
        gameId: gameId,
        result: result,
        amount: amount,
        newBalance: newBalance,
        winAmount: result === 'win' ? winAmount : 0
      };
    });
    
    console.log(`[GAME] ${userId} ${result} $${result === 'win' ? winAmount : betAmount} on ${gameId}`);
    return resultData;
    
  } catch (error) {
    console.error('[ERROR] Game transaction failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== USER STATISTICS ====================
exports.getUserDashboardStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Not authenticated');
  }
  
  const userId = context.auth.uid;
  
  try {
    // Get wallet
    const walletDoc = await db.collection('wallets').doc(userId).get();
    if (!walletDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const walletData = walletDoc.data();
    
    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get today's transactions
    const todayTxSnapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .where('timestamp', '>=', today)
      .get();
    
    let todayDeposits = 0;
    let todayWins = 0;
    let todayLosses = 0;
    
    todayTxSnapshot.forEach(doc => {
      const tx = doc.data();
      if (tx.type === 'deposit' || tx.type === 'bonus') {
        todayDeposits += tx.amount || 0;
      } else if (tx.type === 'game_win') {
        todayWins += tx.amount || 0;
      } else if (tx.type === 'game_bet') {
        todayLosses += tx.amount || 0;
      }
    });
    
    // Get recent transactions
    const recentTxSnapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();
    
    const recentTransactions = [];
    recentTxSnapshot.forEach(doc => {
      const tx = doc.data();
      recentTransactions.push({
        id: doc.id,
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        timestamp: tx.timestamp ? tx.timestamp.toDate().toISOString() : null
      });
    });
    
    return {
      success: true,
      stats: {
        balance: walletData.balance || 0,
        totalDeposited: walletData.totalDeposited || 0,
        totalWithdrawn: walletData.totalWithdrawn || 0,
        totalWon: walletData.totalWon || 0,
        totalLost: walletData.totalLost || 0,
        todayDeposits: todayDeposits,
        todayWins: todayWins,
        todayLosses: todayLosses,
        netProfit: (walletData.totalWon || 0) - (walletData.totalLost || 0)
      },
      recentTransactions: recentTransactions
    };
    
  } catch (error) {
    console.error('[ERROR] getUserDashboardStats failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== DEPLOY INSTRUCTIONS ====================
// 1. cd functions
// 2. npm install
// 3. Create folder structure: functions/src/admin/
// 4. Create balance-management.js in that folder
// 5. firebase deploy --only functions
// 6. Then run: https://your-region-your-project.cloudfunctions.net/createMissingWallets?secret=YOUR_SECRET_KEY
