// ============================================
// betting-engine.js - v7.0 COMPLETE
// 1X2, Over/Under, BTTS, Double Chance, Cards, Corners, Accumulator
// Global Accumulator Slip
// ============================================

// ===== ACCUMULATOR SLIP (GLOBAL) =====
window.ACCUMULATOR_SLIP = JSON.parse(localStorage.getItem('acc_slip') || '[]');
function saveSlip() { localStorage.setItem('acc_slip', JSON.stringify(window.ACCUMULATOR_SLIP)); }
function addToSlip(selection) {
    if (window.ACCUMULATOR_SLIP.some(s => s.fixtureId === selection.fixtureId && s.betType === selection.betType)) {
        return false;
    }
    window.ACCUMULATOR_SLIP.push(selection);
    saveSlip();
    return true;
}
function removeFromSlip(index) { window.ACCUMULATOR_SLIP.splice(index, 1); saveSlip(); }
function clearSlip() { window.ACCUMULATOR_SLIP = []; saveSlip(); }
function getSlipTotalOdds() { return window.ACCUMULATOR_SLIP.reduce((t, s) => t * (s.odds || 2), 1); }

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
        
        const odds = match.odds?.[betType] || 2.00;
        const potentialWin = amount * odds;
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        const batch = db.batch();
        const betRef = db.collection('bets').doc();
        batch.set(betRef, {
            userId: user.uid, fixtureId: parseInt(fixtureId), betType, amount, odds, potentialWin,
            matchName: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            kickoffTime: match.startTime, betCategory: 'single', status: 'active',
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
        if (matchDoc.data().status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const odds = type === 'over25' ? 1.80 : 2.00;
        const potentialWin = amount * odds;
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        const batch = db.batch();
        const betRef = db.collection('bets').doc();
        batch.set(betRef, {
            userId: user.uid, fixtureId: parseInt(fixtureId), betType: type, amount, odds, potentialWin,
            matchName: `${matchDoc.data().homeTeam.name} vs ${matchDoc.data().awayTeam.name}`,
            kickoffTime: matchDoc.data().startTime, betCategory: 'overunder', status: 'active',
            placedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.update(db.collection('wallets').doc(user.uid), { balance: balance - amount });
        await batch.commit();
        return { success: true, betId: betRef.id, potentialWin, newBalance: balance - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== BTTS =====
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
        if (matchDoc.data().status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const odds = type === 'btts_yes' ? 1.90 : 1.85;
        const potentialWin = amount * odds;
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        const batch = db.batch();
        const betRef = db.collection('bets').doc();
        batch.set(betRef, {
            userId: user.uid, fixtureId: parseInt(fixtureId), betType: type, amount, odds, potentialWin,
            matchName: `${matchDoc.data().homeTeam.name} vs ${matchDoc.data().awayTeam.name}`,
            kickoffTime: matchDoc.data().startTime, betCategory: 'btts', status: 'active',
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
        if (matchDoc.data().status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const oddsMap = { '1X': 1.40, '12': 1.35, 'X2': 1.45 };
        const odds = oddsMap[type] || 1.40;
        const potentialWin = amount * odds;
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        const batch = db.batch();
        const betRef = db.collection('bets').doc();
        batch.set(betRef, {
            userId: user.uid, fixtureId: parseInt(fixtureId), betType: type, amount, odds, potentialWin,
            matchName: `${matchDoc.data().homeTeam.name} vs ${matchDoc.data().awayTeam.name}`,
            kickoffTime: matchDoc.data().startTime, betCategory: 'doublechance', status: 'active',
            placedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.update(db.collection('wallets').doc(user.uid), { balance: balance - amount });
        await batch.commit();
        return { success: true, betId: betRef.id, potentialWin, newBalance: balance - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== CARDS & CORNERS =====
async function placeCardCornerBet(fixtureId, type, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const [matchDoc, walletDoc] = await Promise.all([
            db.collection('sports_matches').doc(String(fixtureId)).get(),
            db.collection('wallets').doc(user.uid).get()
        ]);
        if (!matchDoc.exists) return { success: false, error: 'Match not found' };
        if (matchDoc.data().status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const oddsMap = { yellow_over: 1.70, yellow_under: 2.10, red_yes: 3.50, red_no: 1.30, corner_over: 1.90, corner_under: 1.85 };
        const odds = oddsMap[type] || 2.00;
        const potentialWin = amount * odds;
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        const batch = db.batch();
        const betRef = db.collection('bets').doc();
        batch.set(betRef, {
            userId: user.uid, fixtureId: parseInt(fixtureId), betType: type, amount, odds, potentialWin,
            matchName: `${matchDoc.data().homeTeam.name} vs ${matchDoc.data().awayTeam.name}`,
            kickoffTime: matchDoc.data().startTime, betCategory: 'cards', status: 'active',
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
    if (!user || !selections || selections.length < 2) return { success: false, error: 'Minimum 2 selections' };
    const db = firebase.firestore();
    try {
        let totalOdds = 1;
        for (const s of selections) {
            const m = await db.collection('sports_matches').doc(String(s.fixtureId)).get();
            if (!m.exists) return { success: false, error: 'Match not found' };
            if (m.data().status !== 'upcoming') return { success: false, error: 'Match not available' };
            totalOdds *= (s.odds || 2);
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
        clearSlip();
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

// ===== EXPORT =====
window.placeSingleBet = placeSingleBet;
window.placeOverUnderBet = placeOverUnderBet;
window.placeBTTSBet = placeBTTSBet;
window.placeDoubleChanceBet = placeDoubleChanceBet;
window.placeCardCornerBet = placeCardCornerBet;
window.placeAccumulatorBet = placeAccumulatorBet;
window.cancelBetWithFee = cancelBetWithFee;
window.cashoutBet = cashoutBet;
window.placeBet = placeSingleBet;
window.addToSlip = addToSlip;
window.removeFromSlip = removeFromSlip;
window.clearSlip = clearSlip;
window.getSlipTotalOdds = getSlipTotalOdds;

console.log('✅ Betting Engine v7.0 Complete');
