// ============================================
// betting-engine.js - v4.0 OPTIMIZED
// Instant UI response + Batched writes
// ============================================

async function placeSingleBet(fixtureId, betType, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    
    const db = firebase.firestore();
    
    try {
        // 🔥 OPTIMIZATION: Run validation and read in parallel
        const [matchDoc, walletDoc] = await Promise.all([
            db.collection('sports_matches').doc(String(fixtureId)).get(),
            db.collection('wallets').doc(user.uid).get()
        ]);
        
        if (!matchDoc.exists) return { success: false, error: 'Match not found' };
        const match = matchDoc.data();
        if (match.status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const odds = match.odds?.[betType] || 2.00;
        const potentialWin = amount * odds;
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        // 🔥 OPTIMIZATION: Prepare all data before batch
        const betData = {
            userId: user.uid,
            fixtureId: parseInt(fixtureId),
            betType,
            amount,
            odds,
            potentialWin,
            matchName: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            kickoffTime: match.startTime,
            betCategory: 'single',
            status: 'active',
            placedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // 🔥 OPTIMIZATION: Single batch write (1 operation instead of 3)
        const batch = db.batch();
        const betRef = db.collection('bets').doc();
        const walletRef = db.collection('wallets').doc(user.uid);
        const txRef = walletRef.collection('transactions').doc();
        
        batch.set(betRef, betData);
        batch.update(walletRef, { balance: balance - amount });
        batch.set(txRef, {
            type: 'bet',
            amount: -amount,
            description: `Bet: ${match.homeTeam.name} vs ${match.awayTeam.name}`,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Execute batch (single network request)
        await batch.commit();
        
        return { 
            success: true, 
            betId: betRef.id, 
            potentialWin,
            newBalance: balance - amount 
        };
        
    } catch (e) {
        console.error('Bet error:', e);
        return { success: false, error: e.message };
    }
}

async function placeAccumulatorBet(selections, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    if (!selections || selections.length < 2) return { success: false, error: 'Minimum 2 selections' };
    
    const db = firebase.firestore();
    
    try {
        // 🔥 OPTIMIZATION: Fetch all matches in parallel
        const matchIds = selections.map(s => String(s.fixtureId));
        const matchDocs = await Promise.all(matchIds.map(id => db.collection('sports_matches').doc(id).get()));
        
        let totalOdds = 1;
        for (let i = 0; i < selections.length; i++) {
            const m = matchDocs[i];
            if (!m.exists) return { success: false, error: 'Match not found' };
            if (m.data().status !== 'upcoming') return { success: false, error: 'Match not available' };
            totalOdds *= selections[i].odds;
        }
        
        const potentialWin = amount * totalOdds;
        const walletDoc = await db.collection('wallets').doc(user.uid).get();
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        // 🔥 OPTIMIZATION: Single batch write
        const batch = db.batch();
        const betRef = db.collection('bets').doc();
        const walletRef = db.collection('wallets').doc(user.uid);
        
        batch.set(betRef, {
            userId: user.uid,
            selections,
            amount,
            totalOdds,
            potentialWin,
            betCategory: 'accumulator',
            status: 'active',
            placedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.update(walletRef, { balance: balance - amount });
        
        await batch.commit();
        
        return { success: true, potentialWin, newBalance: balance - amount };
        
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function cancelBetWithFee(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    
    const db = firebase.firestore();
    
    try {
        const betDoc = await db.collection('bets').doc(betId).get();
        if (!betDoc.exists) return { success: false, error: 'Bet not found' };
        
        const bet = betDoc.data();
        if (bet.userId !== user.uid) return { success: false, error: 'Not your bet' };
        if (bet.status !== 'active') return { success: false, error: 'Already settled' };
        
        const matchDoc = await db.collection('sports_matches').doc(String(bet.fixtureId)).get();
        const match = matchDoc.data();
        
        const feePercent = typeof getCancelFee === 'function' ? getCancelFee(match.startTime) : 5;
        if (feePercent >= 100) return { success: false, error: 'Cannot cancel - match started' };
        
        const fee = bet.amount * (feePercent / 100);
        const refund = bet.amount - fee;
        
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletDoc = await walletRef.get();
        const balance = walletDoc.data().balance;
        
        // 🔥 OPTIMIZATION: Batch update
        const batch = db.batch();
        batch.update(walletRef, { balance: balance + refund });
        batch.update(betDoc.ref, {
            status: 'cancelled',
            cancelFee: fee,
            refundAmount: refund,
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await batch.commit();
        
        return { success: true, refund, fee, feePercent };
        
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function cashoutBet(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    
    const db = firebase.firestore();
    
    try {
        const betDoc = await db.collection('bets').doc(betId).get();
        if (!betDoc.exists) return { success: false, error: 'Bet not found' };
        
        const bet = betDoc.data();
        if (bet.status !== 'active') return { success: false, error: 'Already settled' };
        
        const matchDoc = await db.collection('sports_matches').doc(String(bet.fixtureId)).get();
        const match = matchDoc.data();
        if (match.status !== 'live') return { success: false, error: 'Cashout only during live match' };
        
        const minute = typeof getMatchMinute === 'function' ? getMatchMinute(match.startTime) : 0;
        const feePercent = typeof getCashoutFee === 'function' ? getCashoutFee(minute) : 25;
        
        const cashoutBase = bet.potentialWin * 0.7;
        const fee = cashoutBase * (feePercent / 100);
        const cashoutAmount = cashoutBase - fee;
        
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletDoc = await walletRef.get();
        const balance = walletDoc.data().balance;
        
        // 🔥 OPTIMIZATION: Batch update
        const batch = db.batch();
        batch.update(walletRef, { balance: balance + cashoutAmount });
        batch.update(betDoc.ref, {
            status: 'cashed_out',
            cashoutAmount,
            cashoutFee: fee,
            cashedOutAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await batch.commit();
        
        return { success: true, amount: cashoutAmount, fee, feePercent };
        
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// 🔥 OPTIMIZATION: Instant UI feedback function
function updateUIBeforeBet(amount) {
    // Update balance display immediately (optimistic)
    const balanceEl = document.getElementById('balance-display') || document.getElementById('user-balance');
    if (balanceEl) {
        const currentBalance = parseFloat(balanceEl.textContent.replace('$', '')) || 0;
        balanceEl.textContent = '$' + (currentBalance - amount).toFixed(2);
    }
}

window.placeSingleBet = placeSingleBet;
window.placeAccumulatorBet = placeAccumulatorBet;
window.cancelBetWithFee = cancelBetWithFee;
window.cashoutBet = cashoutBet;
window.placeBet = placeSingleBet;
window.updateUIBeforeBet = updateUIBeforeBet;

console.log('✅ Betting Engine v4.0 - Optimized (Batch writes, Parallel reads)');
