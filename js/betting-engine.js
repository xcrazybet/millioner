// ============================================
// BETTING ENGINE - PLACE & SETTLE BETS
// X Lodon Betting Platform
// ============================================

// ===== BET PLACEMENT =====

async function placeBet(fixtureId, betType, amount) {
    // Validate inputs
    if (!fixtureId || !betType || !amount) {
        return { success: false, error: 'Missing required fields' };
    }
    
    if (!['home', 'draw', 'away'].includes(betType)) {
        return { success: false, error: 'Invalid bet type' };
    }
    
    if (amount <= 0) {
        return { success: false, error: 'Bet amount must be positive' };
    }
    
    // Check authentication
    const user = firebase.auth().currentUser;
    if (!user) {
        return { success: false, error: 'User not logged in' };
    }
    
    const db = firebase.firestore();
    
    try {
        // 1. Get match data
        const matchDoc = await db.collection('sports_matches').doc(fixtureId.toString()).get();
        
        if (!matchDoc.exists) {
            return { success: false, error: 'Match not found' };
        }
        
        const match = matchDoc.data();
        
        // 2. Validate match is still upcoming
        if (match.status !== 'upcoming') {
            return { success: false, error: 'Betting closed - match already started' };
        }
        
        // 3. Check if kickoff is within 2 minutes (cutoff)
        const now = new Date();
        const kickoff = match.startTime.toDate();
        const timeUntilKickoff = kickoff - now;
        const twoMinutesInMs = 2 * 60 * 1000;
        
        if (timeUntilKickoff < twoMinutesInMs) {
            return { success: false, error: 'Betting closed - too close to kickoff' };
        }
        
        // 4. Get current odds
        const odds = match.odds[betType];
        const potentialWin = amount * odds;
        
        // 5. Check user balance (using existing wallet system)
        if (typeof gameState !== 'undefined' && gameState.balance < amount) {
            return { success: false, error: 'Insufficient balance' };
        }
        
        // 6. Process wallet transaction (using your existing system)
        let transactionResult;
        
        if (typeof processTransaction === 'function') {
            transactionResult = await processTransaction(
                -amount,
                'sports_bet',
                `Bet on ${match.homeTeam.name} vs ${match.awayTeam.name} (${betType.toUpperCase()})`
            );
        } else {
            // Fallback - direct wallet update (use with caution)
            console.warn('processTransaction not found - using direct update');
            const walletRef = db.collection('wallets').doc(user.uid);
            const walletDoc = await walletRef.get();
            const currentBalance = walletDoc.data().balance;
            
            if (currentBalance < amount) {
                return { success: false, error: 'Insufficient balance' };
            }
            
            await walletRef.update({
                balance: currentBalance - amount,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            transactionResult = { success: true };
        }
        
        if (!transactionResult.success) {
            return { success: false, error: transactionResult.error || 'Transaction failed' };
        }
        
        // 7. Save bet to Firestore
        const betData = {
            userId: user.uid,
            userName: user.displayName || user.email || 'User',
            fixtureId: fixtureId,
            matchName: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            betType: betType,
            amount: amount,
            odds: odds,
            potentialWin: potentialWin,
            status: 'active',
            result: null,
            payout: 0,
            placedAt: firebase.firestore.FieldValue.serverTimestamp(),
            settledAt: null,
            transactionId: transactionResult.transactionId || null
        };
        
        const betRef = await db.collection('bets').add(betData);
        
        // 8. Update user betting profile
        await updateBettingProfile(user.uid, 'place');
        
        return {
            success: true,
            betId: betRef.id,
            potentialWin: potentialWin,
            message: `Bet placed successfully! Potential win: $${potentialWin.toFixed(2)}`
        };
        
    } catch (error) {
        console.error('Error placing bet:', error);
        return { success: false, error: error.message };
    }
}

// ===== BET SETTLEMENT =====

async function settleBetsForMatch(fixtureId, matchResult) {
    if (!fixtureId || !matchResult) {
        return { success: false, error: 'Missing fixtureId or result' };
    }
    
    const db = firebase.firestore();
    
    try {
        // 1. Find all active bets for this match
        const betsSnapshot = await db.collection('bets')
            .where('fixtureId', '==', fixtureId)
            .where('status', '==', 'active')
            .get();
        
        if (betsSnapshot.empty) {
            console.log(`No active bets found for fixture ${fixtureId}`);
            return { success: true, settled: 0 };
        }
        
        console.log(`Settling ${betsSnapshot.size} bets for fixture ${fixtureId}`);
        
        const batch = db.batch();
        let settledCount = 0;
        
        for (const doc of betsSnapshot.docs) {
            const bet = doc.data();
            const betRef = db.collection('bets').doc(doc.id);
            
            const won = (bet.betType === matchResult);
            
            if (won) {
                // Winning bet - credit user
                batch.update(betRef, {
                    status: 'won',
                    result: matchResult,
                    payout: bet.potentialWin,
                    settledAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Process win transaction
                if (typeof processTransaction === 'function') {
                    await processTransaction(
                        bet.potentialWin,
                        'sports_win',
                        `Won bet on ${bet.matchName} (${bet.betType.toUpperCase()})`
                    );
                } else {
                    // Fallback direct update
                    const walletRef = db.collection('wallets').doc(bet.userId);
                    const walletDoc = await walletRef.get();
                    await walletRef.update({
                        balance: walletDoc.data().balance + bet.potentialWin,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                
                // Update user profile
                await updateBettingProfile(bet.userId, 'win', bet.potentialWin);
                
            } else {
                // Losing bet - just update status
                batch.update(betRef, {
                    status: 'lost',
                    result: matchResult,
                    payout: 0,
                    settledAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                await updateBettingProfile(bet.userId, 'lose');
            }
            
            settledCount++;
        }
        
        await batch.commit();
        
        // 2. Update match with result and expiry
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        
        await db.collection('sports_matches').doc(fixtureId.toString()).update({
            result: matchResult,
            expiresAt: expiresAt,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, settled: settledCount };
        
    } catch (error) {
        console.error('Error settling bets:', error);
        return { success: false, error: error.message };
    }
}

// ===== AUTO-SETTLEMENT CHECK =====

async function checkAndSettleFinishedMatches() {
    const db = firebase.firestore();
    
    try {
        // Find finished matches without result set
        const matchesSnapshot = await db.collection('sports_matches')
            .where('status', '==', 'finished')
            .where('result', '==', null)
            .get();
        
        if (matchesSnapshot.empty) {
            return { success: true, settled: 0 };
        }
        
        console.log(`Found ${matchesSnapshot.size} matches to settle`);
        
        let totalSettled = 0;
        
        for (const doc of matchesSnapshot.docs) {
            const match = doc.data();
            
            // Determine result from score
            let result = null;
            if (match.score.home > match.score.away) result = 'home';
            else if (match.score.home < match.score.away) result = 'away';
            else if (match.score.home === match.score.away) result = 'draw';
            
            if (result) {
                const settlement = await settleBetsForMatch(match.fixtureId, result);
                if (settlement.success) {
                    totalSettled += settlement.settled;
                }
            }
        }
        
        return { success: true, settled: totalSettled };
        
    } catch (error) {
        console.error('Error checking settlements:', error);
        return { success: false, error: error.message };
    }
}

// ===== USER BETTING PROFILE =====

async function updateBettingProfile(userId, action, amount = 0) {
    const db = firebase.firestore();
    const profileRef = db.collection('betting_profiles').doc(userId);
    
    try {
        const doc = await profileRef.get();
        
        if (!doc.exists) {
            // Create new profile
            await profileRef.set({
                userId: userId,
                totalBets: action === 'place' ? 1 : 0,
                totalWon: action === 'win' ? 1 : 0,
                totalLost: action === 'lose' ? 1 : 0,
                totalStaked: action === 'place' ? amount : 0,
                totalReturns: action === 'win' ? amount : 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Update existing profile
            const updates = {
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            if (action === 'place') {
                updates.totalBets = firebase.firestore.FieldValue.increment(1);
                updates.totalStaked = firebase.firestore.FieldValue.increment(amount);
            } else if (action === 'win') {
                updates.totalWon = firebase.firestore.FieldValue.increment(1);
                updates.totalReturns = firebase.firestore.FieldValue.increment(amount);
            } else if (action === 'lose') {
                updates.totalLost = firebase.firestore.FieldValue.increment(1);
            }
            
            await profileRef.update(updates);
        }
        
    } catch (error) {
        console.error('Error updating betting profile:', error);
    }
}

// ===== GET USER BETS =====

async function getUserBets(statusFilter = 'all') {
    const user = firebase.auth().currentUser;
    if (!user) return [];
    
    const db = firebase.firestore();
    
    try {
        let query = db.collection('bets')
            .where('userId', '==', user.uid);
        
        if (statusFilter !== 'all') {
            query = query.where('status', '==', statusFilter);
        }
        
        query = query.orderBy('placedAt', 'desc').limit(100);
        
        const snapshot = await query.get();
        
        const bets = [];
        snapshot.forEach(doc => {
            bets.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        return bets;
        
    } catch (error) {
        console.error('Error getting user bets:', error);
        return [];
    }
}

// ===== CANCEL BET (Before match starts) =====

async function cancelBet(betId) {
    const user = firebase.auth().currentUser;
    if (!user) {
        return { success: false, error: 'Not logged in' };
    }
    
    const db = firebase.firestore();
    
    try {
        const betRef = db.collection('bets').doc(betId);
        const betDoc = await betRef.get();
        
        if (!betDoc.exists) {
            return { success: false, error: 'Bet not found' };
        }
        
        const bet = betDoc.data();
        
        // Verify ownership
        if (bet.userId !== user.uid) {
            return { success: false, error: 'Not your bet' };
        }
        
        // Check if still active
        if (bet.status !== 'active') {
            return { success: false, error: 'Bet already settled' };
        }
        
        // Check match status
        const matchDoc = await db.collection('sports_matches').doc(bet.fixtureId.toString()).get();
        if (!matchDoc.exists) {
            return { success: false, error: 'Match not found' };
        }
        
        const match = matchDoc.data();
        if (match.status !== 'upcoming') {
            return { success: false, error: 'Match already started' };
        }
        
        // Refund user
        if (typeof processTransaction === 'function') {
            await processTransaction(
                bet.amount,
                'bet_refund',
                `Cancelled bet on ${bet.matchName}`
            );
        }
        
        // Update bet status
        await betRef.update({
            status: 'cancelled',
            settledAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, message: 'Bet cancelled and refunded' };
        
    } catch (error) {
        console.error('Error cancelling bet:', error);
        return { success: false, error: error.message };
    }
}

// Auto-run settlement check periodically
setInterval(() => {
    checkAndSettleFinishedMatches();
}, 60000); // Every minute
