// ============================================
// betting-engine.js - v5.0 NEW BET TYPES
// 1X2, Over/Under, BTTS, Cards, Corners, Double Chance
// ============================================

// ===== SINGLE BET (1X2) =====
async function placeSingleBet(fixtureId, betType, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const [matchDoc, walletDoc] = await Promise.all([
            db.collection('sports_matches').doc(String(fixtureId)).get(),
            db.collection('wallets').doc(user.uid).get()
        ]);
        if (!matchDoc.exists) return { success: false, error: 'Match not found' };
        const match = matchDoc.data();
        if (match.status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const odds = match.odds?.[betType] || getDefaultOdds(betType);
        const potentialWin = amount * odds;
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        const batch = db.batch();
        const betRef = db.collection('bets').doc();
        batch.set(betRef, {
            userId: user.uid, fixtureId: parseInt(fixtureId), betType, amount, odds, potentialWin,
            matchName: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            matchScore: match.score,
            kickoffTime: match.startTime,
            betCategory: 'single',
            status: 'active',
            placedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.update(db.collection('wallets').doc(user.uid), { balance: balance - amount });
        await batch.commit();
        return { success: true, betId: betRef.id, potentialWin, newBalance: balance - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== OVER/UNDER 2.5 =====
async function placeOverUnderBet(fixtureId, type, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const [matchDoc, walletDoc] = await Promise.all([
            db.collection('sports_matches').doc(String(fixtureId)).get(),
            db.collection('wallets').doc(user.uid).get()
        ]);
        if (!matchDoc.exists) return { success: false, error: 'Match not found' };
        const match = matchDoc.data();
        if (match.status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const odds = type === 'over25' ? 1.80 : 2.00;
        const potentialWin = amount * odds;
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        const batch = db.batch();
        const betRef = db.collection('bets').doc();
        batch.set(betRef, {
            userId: user.uid, fixtureId: parseInt(fixtureId), betType: type, amount, odds, potentialWin,
            matchName: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            matchScore: match.score,
            kickoffTime: match.startTime,
            betCategory: 'overunder',
            status: 'active',
            placedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.update(db.collection('wallets').doc(user.uid), { balance: balance - amount });
        await batch.commit();
        return { success: true, betId: betRef.id, potentialWin, newBalance: balance - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== BOTH TEAMS TO SCORE (BTTS) =====
async function placeBTTSBet(fixtureId, type, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const [matchDoc, walletDoc] = await Promise.all([
            db.collection('sports_matches').doc(String(fixtureId)).get(),
            db.collection('wallets').doc(user.uid).get()
        ]);
        if (!matchDoc.exists) return { success: false, error: 'Match not found' };
        const match = matchDoc.data();
        if (match.status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const odds = type === 'btts_yes' ? 1.90 : 1.85;
        const potentialWin = amount * odds;
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        const batch = db.batch();
        const betRef = db.collection('bets').doc();
        batch.set(betRef, {
            userId: user.uid, fixtureId: parseInt(fixtureId), betType: type, amount, odds, potentialWin,
            matchName: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            matchScore: match.score,
            kickoffTime: match.startTime,
            betCategory: 'btts',
            status: 'active',
            placedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.update(db.collection('wallets').doc(user.uid), { balance: balance - amount });
        await batch.commit();
        return { success: true, betId: betRef.id, potentialWin, newBalance: balance - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== DOUBLE CHANCE =====
async function placeDoubleChanceBet(fixtureId, type, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const [matchDoc, walletDoc] = await Promise.all([
            db.collection('sports_matches').doc(String(fixtureId)).get(),
            db.collection('wallets').doc(user.uid).get()
        ]);
        if (!matchDoc.exists) return { success: false, error: 'Match not found' };
        const match = matchDoc.data();
        if (match.status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const oddsMap = { '1X': 1.40, '12': 1.35, 'X2': 1.45 };
        const odds = oddsMap[type] || 1.40;
        const potentialWin = amount * odds;
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        const batch = db.batch();
        const betRef = db.collection('bets').doc();
        batch.set(betRef, {
            userId: user.uid, fixtureId: parseInt(fixtureId), betType: type, amount, odds, potentialWin,
            matchName: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            matchScore: match.score,
            kickoffTime: match.startTime,
            betCategory: 'doublechance',
            status: 'active',
            placedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.update(db.collection('wallets').doc(user.uid), { balance: balance - amount });
        await batch.commit();
        return { success: true, betId: betRef.id, potentialWin, newBalance: balance - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== ACCUMULATOR =====
async function placeAccumulatorBet(selections, amount) {
    const user = firebase.auth().currentUser;
    if (!user || !selections || selections.length < 2) return { success: false, error: 'Min 2 selections' };
    const db = firebase.firestore();
    try {
        let totalOdds = 1;
        for (const sel of selections) {
            const m = await db.collection('sports_matches').doc(String(sel.fixtureId)).get();
            if (!m.exists) return { success: false, error: 'Match not found' };
            if (m.data().status !== 'upcoming') return { success: false, error: 'Match not available' };
            totalOdds *= (sel.odds || 2.00);
        }
        const potentialWin = amount * totalOdds;
        const walletDoc = await db.collection('wallets').doc(user.uid).get();
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        const batch = db.batch();
        batch.set(db.collection('bets').doc(), {
            userId: user.uid, selections, amount, totalOdds, potentialWin,
            betCategory: 'accumulator', status: 'active',
            placedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.update(db.collection('wallets').doc(user.uid), { balance: balance - amount });
        await batch.commit();
        return { success: true, potentialWin, newBalance: balance - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== CANCEL & CASHOUT =====
async function cancelBetWithFee(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const betDoc = await db.collection('bets').doc(betId).get();
        if (!betDoc.exists) return { success: false, error: 'Bet not found' };
        const bet = betDoc.data();
        if (bet.userId !== user.uid || bet.status !== 'active') return { success: false, error: 'Cannot cancel' };
        
        const matchDoc = await db.collection('sports_matches').doc(String(bet.fixtureId)).get();
        const feePercent = typeof getCancelFee === 'function' ? getCancelFee(matchDoc.data()?.startTime) : 5;
        if (feePercent >= 100) return { success: false, error: 'Match started' };
        
        const fee = bet.amount * (feePercent / 100);
        const refund = bet.amount - fee;
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletDoc = await walletRef.get();
        
        const batch = db.batch();
        batch.update(walletRef, { balance: walletDoc.data().balance + refund });
        batch.update(betDoc.ref, { status: 'cancelled', cancelFee: fee, refundAmount: refund, cancelledAt: new Date() });
        await batch.commit();
        return { success: true, refund, fee };
    } catch(e) { return { success: false, error: e.message }; }
}

async function cashoutBet(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const betDoc = await db.collection('bets').doc(betId).get();
        if (!betDoc.exists || betDoc.data().status !== 'active') return { success: false, error: 'Cannot cash out' };
        const bet = betDoc.data();
        
        const matchDoc = await db.collection('sports_matches').doc(String(bet.fixtureId)).get();
        if (matchDoc.data()?.status !== 'live') return { success: false, error: 'Not live' };
        
        const minute = typeof getMatchMinute === 'function' ? getMatchMinute(matchDoc.data()?.startTime) : 0;
        const feePercent = typeof getCashoutFee === 'function' ? getCashoutFee(minute) : 25;
        const cashoutAmount = bet.potentialWin * 0.7 * (1 - feePercent / 100);
        
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletDoc = await walletRef.get();
        
        const batch = db.batch();
        batch.update(walletRef, { balance: walletDoc.data().balance + cashoutAmount });
        batch.update(betDoc.ref, { status: 'cashed_out', cashoutAmount, cashoutFee: feePercent, cashedOutAt: new Date() });
        await batch.commit();
        return { success: true, amount: cashoutAmount, fee: feePercent };
    } catch(e) { return { success: false, error: e.message }; }
}

function getDefaultOdds(type) {
    const map = { home: 2.00, draw: 3.50, away: 3.80, over25: 1.80, under25: 2.00, btts_yes: 1.90, btts_no: 1.85, '1X': 1.40, '12': 1.35, 'X2': 1.45 };
    return map[type] || 2.00;
}

window.placeSingleBet = placeSingleBet;
window.placeOverUnderBet = placeOverUnderBet;
window.placeBTTSBet = placeBTTSBet;
window.placeDoubleChanceBet = placeDoubleChanceBet;
window.placeAccumulatorBet = placeAccumulatorBet;
window.cancelBetWithFee = cancelBetWithFee;
window.cashoutBet = cashoutBet;
window.placeBet = placeSingleBet;

console.log('✅ Betting Engine v5.0 - 1X2, Over/Under, BTTS, Double Chance, Accumulator');
