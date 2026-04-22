// ============================================
// betting-engine.js - v3.0 COMPLETE
// Single & Accumulator Bets, Cancel, Cashout
// ============================================

async function placeSingleBet(fixtureId, betType, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    
    try {
        const matchDoc = await db.collection('sports_matches').doc(String(fixtureId)).get();
        if (!matchDoc.exists) return { success: false, error: 'Match not found' };
        const match = matchDoc.data();
        if (match.status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const odds = match.odds?.[betType] || 2.00;
        const potentialWin = amount * odds;
        
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletDoc = await walletRef.get();
        const balance = walletDoc.exists ? walletDoc.data().balance : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        await walletRef.update({ balance: balance - amount });
        await walletRef.collection('transactions').add({
            type: 'bet', amount: -amount, description: `Bet: ${match.homeTeam.name} vs ${match.awayTeam.name}`,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        const betRef = await db.collection('bets').add({
            userId: user.uid, fixtureId, betType, amount, odds, potentialWin,
            matchName: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            kickoffTime: match.startTime, betCategory: 'single', status: 'active',
            placedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, betId: betRef.id, potentialWin };
    } catch(e) { return { success: false, error: e.message }; }
}

async function placeAccumulatorBet(selections, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    if (!selections || selections.length < 2) return { success: false, error: 'Minimum 2 selections' };
    const db = firebase.firestore();
    
    try {
        let totalOdds = 1;
        for (const sel of selections) {
            const m = await db.collection('sports_matches').doc(String(sel.fixtureId)).get();
            if (!m.exists) return { success: false, error: 'Match not found' };
            if (m.data().status !== 'upcoming') return { success: false, error: 'Match not available' };
            totalOdds *= sel.odds;
        }
        
        const potentialWin = amount * totalOdds;
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletDoc = await walletRef.get();
        const balance = walletDoc.exists ? walletDoc.data().balance : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        await walletRef.update({ balance: balance - amount });
        await db.collection('bets').add({
            userId: user.uid, selections, amount, totalOdds, potentialWin,
            betCategory: 'accumulator', status: 'active',
            placedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, potentialWin };
    } catch(e) { return { success: false, error: e.message }; }
}

async function cancelBetWithFee(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    
    try {
        const betRef = db.collection('bets').doc(betId);
        const betDoc = await betRef.get();
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
        await walletRef.update({ balance: walletDoc.data().balance + refund });
        
        await betRef.update({
            status: 'cancelled', cancelFee: fee, refundAmount: refund,
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, refund, fee, feePercent };
    } catch(e) { return { success: false, error: e.message }; }
}

async function cashoutBet(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    
    try {
        const betRef = db.collection('bets').doc(betId);
        const betDoc = await betRef.get();
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
        await walletRef.update({ balance: walletDoc.data().balance + cashoutAmount });
        
        await betRef.update({
            status: 'cashed_out', cashoutAmount, cashoutFee: fee,
            cashedOutAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, amount: cashoutAmount, fee, feePercent };
    } catch(e) { return { success: false, error: e.message }; }
}

window.placeSingleBet = placeSingleBet;
window.placeAccumulatorBet = placeAccumulatorBet;
window.cancelBetWithFee = cancelBetWithFee;
window.cashoutBet = cashoutBet;
window.placeBet = placeSingleBet;

console.log('✅ Betting Engine v3.0 - Single & Accumulator Ready');
