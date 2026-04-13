// ============================================
// X LODON BETTING ENGINE - COMPLETE
// Place bets, cancel bets, settle bets
// ============================================

// ===== PLACE BET =====
async function placeBet(fixtureId, betType, amount) {
    console.log(`🎲 PLACE BET: fixture=${fixtureId}, type=${betType}, amount=$${amount}`);
    
    // Validation
    if (!fixtureId) return { success: false, error: 'Match not found' };
    if (!['home', 'draw', 'away'].includes(betType)) return { success: false, error: 'Invalid bet type' };
    if (amount < 1) return { success: false, error: 'Minimum bet is $1' };
    
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Please login to place bet' };
    
    const db = firebase.firestore();
    
    try {
        // Get match
        const matchDoc = await db.collection('sports_matches').doc(fixtureId.toString()).get();
        if (!matchDoc.exists) return { success: false, error: 'Match not found' };
        
        const match = matchDoc.data();
        
        // Validate match status
        if (match.status === 'live') return { success: false, error: 'Match already started' };
        if (match.status === 'finished') return { success: false, error: 'Match already finished' };
        if (match.status === 'cancelled') return { success: false, error: 'Match cancelled' };
        
        // Check kickoff time
        const kickoff = match.startTime.toDate();
        const now = new Date();
        if (kickoff - now < 120000) return { success: false, error: 'Betting closed - too close to kickoff' };
        
        // Get odds
        const odds = match.odds?.[betType] || (betType === 'home' ? 2.00 : betType === 'draw' ? 3.50 : 3.80);
        const potentialWin = amount * odds;
        
        // Check balance
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletDoc = await walletRef.get();
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        // Deduct balance
        await walletRef.update({
            balance: balance - amount,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Record transaction
        await walletRef.collection('transactions').add({
            type: 'sports_bet',
            amount: -amount,
            description: `Bet: ${match.homeTeam.name} vs ${match.awayTeam.name} (${betType})`,
            fixtureId: fixtureId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            beforeBalance: balance,
            afterBalance: balance - amount
        });
        
        // Save bet
        const betRef = await db.collection('bets').add({
            userId: user.uid,
            userEmail: user.email || 'User',
            fixtureId: fixtureId,
            matchName: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            leagueName: match.leagueName || '',
            betType: betType,
            amount: amount,
            odds: odds,
            potentialWin: potentialWin,
            status: 'active',
            result: null,
            payout: 0,
            placedAt: firebase.firestore.FieldValue.serverTimestamp(),
            settledAt: null
        });
        
        // Update betting profile
        const profileRef = db.collection('betting_profiles').doc(user.uid);
        const profileDoc = await profileRef.get();
        
        if (profileDoc.exists) {
            await profileRef.update({
                totalBets: firebase.firestore.FieldValue.increment(1),
                totalStaked: firebase.firestore.FieldValue.increment(amount),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await profileRef.set({
                userId: user.uid,
                totalBets: 1,
                totalWon: 0,
                totalLost: 0,
                totalStaked: amount,
                totalReturns: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        console.log(`✅ Bet placed! ID: ${betRef.id}`);
        
        return {
            success: true,
            betId: betRef.id,
            potentialWin: potentialWin,
            newBalance: balance - amount,
            message: `Bet placed! Potential win: $${potentialWin.toFixed(2)}`
        };
        
    } catch (error) {
        console.error('❌ Place bet error:', error);
        return { success: false, error: error.message };
    }
}

// ===== CANCEL BET =====
async function cancelBet(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Not logged in' };
    
    const db = firebase.firestore();
    
    try {
        const betRef = db.collection('bets').doc(betId);
        const betDoc = await betRef.get();
        
        if (!betDoc.exists) return { success: false, error: 'Bet not found' };
        
        const bet = betDoc.data();
        if (bet.userId !== user.uid) return { success: false, error: 'Not your bet' };
        if (bet.status !== 'active') return { success: false, error: 'Bet already settled' };
        
        // Check match
        const matchDoc = await db.collection('sports_matches').doc(bet.fixtureId.toString()).get();
        if (matchDoc.exists) {
            const match = matchDoc.data();
            if (match.status !== 'upcoming') return { success: false, error: 'Match already started' };
        }
        
        // Refund
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletDoc = await walletRef.get();
        const balance = walletDoc.data().balance || 0;
        
        await walletRef.update({
            balance: balance + bet.amount,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await walletRef.collection('transactions').add({
            type: 'bet_refund',
            amount: bet.amount,
            description: `Refund: ${bet.matchName}`,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await betRef.update({
            status: 'cancelled',
            settledAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, message: 'Bet cancelled and refunded' };
        
    } catch (error) {
        console.error('Cancel error:', error);
        return { success: false, error: error.message };
    }
}

// ===== SETTLE BETS =====
async function settleBetsForMatch(fixtureId, matchResult) {
    if (!fixtureId || !matchResult) return { success: false, error: 'Missing data' };
    if (!['home', 'draw', 'away'].includes(matchResult)) return { success: false, error: 'Invalid result' };
    
    const db = firebase.firestore();
    
    try {
        const betsSnapshot = await db.collection('bets')
            .where('fixtureId', '==', fixtureId)
            .where('status', '==', 'active')
            .get();
        
        if (betsSnapshot.empty) {
            console.log(`No active bets for fixture ${fixtureId}`);
            return { success: true, settled: 0 };
        }
        
        console.log(`💰 Settling ${betsSnapshot.size} bets...`);
        
        for (const doc of betsSnapshot.docs) {
            const bet = doc.data();
            const betRef = db.collection('bets').doc(doc.id);
            const won = (bet.betType === matchResult);
            
            if (won) {
                // Pay winner
                const walletRef = db.collection('wallets').doc(bet.userId);
                const walletDoc = await walletRef.get();
                
                if (walletDoc.exists) {
                    const balance = walletDoc.data().balance || 0;
                    await walletRef.update({
                        balance: balance + bet.potentialWin,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    await walletRef.collection('transactions').add({
                        type: 'sports_win',
                        amount: bet.potentialWin,
                        description: `Win: ${bet.matchName}`,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                
                await betRef.update({
                    status: 'won',
                    result: matchResult,
                    payout: bet.potentialWin,
                    settledAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Update profile
                const profileRef = db.collection('betting_profiles').doc(bet.userId);
                await profileRef.update({
                    totalWon: firebase.firestore.FieldValue.increment(1),
                    totalReturns: firebase.firestore.FieldValue.increment(bet.potentialWin),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
            } else {
                await betRef.update({
                    status: 'lost',
                    result: matchResult,
                    payout: 0,
                    settledAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                const profileRef = db.collection('betting_profiles').doc(bet.userId);
                await profileRef.update({
                    totalLost: firebase.firestore.FieldValue.increment(1),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        // Update match
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        
        await db.collection('sports_matches').doc(fixtureId.toString()).update({
            result: matchResult,
            expiresAt: expiresAt,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`✅ Settled ${betsSnapshot.size} bets`);
        return { success: true, settled: betsSnapshot.size };
        
    } catch (error) {
        console.error('Settle error:', error);
        return { success: false, error: error.message };
    }
}

// ===== GET USER BETS =====
async function getUserBets(statusFilter = 'all') {
    const user = firebase.auth().currentUser;
    if (!user) return [];
    
    const db = firebase.firestore();
    
    try {
        let query = db.collection('bets')
            .where('userId', '==', user.uid)
            .orderBy('placedAt', 'desc')
            .limit(100);
        
        if (statusFilter !== 'all') {
            query = query.where('status', '==', statusFilter);
        }
        
        const snapshot = await query.get();
        const bets = [];
        snapshot.forEach(doc => bets.push({ id: doc.id, ...doc.data() }));
        return bets;
        
    } catch (error) {
        console.error('Get bets error:', error);
        return [];
    }
}

// ===== CHECK ACTIVE BETS COUNT =====
async function getActiveBetsCount() {
    const user = firebase.auth().currentUser;
    if (!user) return 0;
    
    const db = firebase.firestore();
    const snapshot = await db.collection('bets')
        .where('userId', '==', user.uid)
        .where('status', '==', 'active')
        .get();
    
    return snapshot.size;
}

// Global access
window.placeBet = placeBet;
window.cancelBet = cancelBet;
window.settleBetsForMatch = settleBetsForMatch;
window.getUserBets = getUserBets;
window.getActiveBetsCount = getActiveBetsCount;

console.log('✅ Betting Engine v2.0 loaded');
