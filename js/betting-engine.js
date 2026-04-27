// ============================================
// betting-engine.js - v6.0 ALL BET TYPES
// 1X2, Over/Under, BTTS, Double Chance, Cards, Corners
// Global Accumulator Slip
// ============================================

// ===== ACCUMULATOR SLIP (GLOBAL) =====
window.ACCUMULATOR_SLIP = JSON.parse(localStorage.getItem('acc_slip') || '[]');

function saveSlip() { localStorage.setItem('acc_slip', JSON.stringify(window.ACCUMULATOR_SLIP)); }
function addToSlip(selection) {
    if (window.ACCUMULATOR_SLIP.some(s => s.fixtureId === selection.fixtureId)) return false;
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
        const [m, w] = await Promise.all([db.collection('sports_matches').doc(String(fixtureId)).get(), db.collection('wallets').doc(user.uid).get()]);
        if (!m.exists) return { success: false, error: 'Match not found' };
        if (m.data().status !== 'upcoming') return { success: false, error: 'Betting closed' };
        const odds = m.data().odds?.[betType] || 2.00;
        const pw = amount * odds;
        const bal = w.exists ? (w.data().balance || 0) : 0;
        if (bal < amount) return { success: false, error: 'Insufficient balance' };
        const batch = db.batch();
        const ref = db.collection('bets').doc();
        batch.set(ref, { userId: user.uid, fixtureId: parseInt(fixtureId), betType, amount, odds, potentialWin: pw, matchName: `${m.data().homeTeam.name} vs ${m.data().awayTeam.name}`, kickoffTime: m.data().startTime, betCategory: 'single', status: 'active', placedAt: firebase.firestore.FieldValue.serverTimestamp() });
        batch.update(db.collection('wallets').doc(user.uid), { balance: bal - amount });
        await batch.commit();
        return { success: true, betId: ref.id, potentialWin: pw, newBalance: bal - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== OVER/UNDER =====
async function placeOverUnderBet(fixtureId, type, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const [m, w] = await Promise.all([db.collection('sports_matches').doc(String(fixtureId)).get(), db.collection('wallets').doc(user.uid).get()]);
        if (!m.exists) return { success: false, error: 'Match not found' };
        if (m.data().status !== 'upcoming') return { success: false, error: 'Betting closed' };
        const odds = type === 'over25' ? 1.80 : 2.00;
        const pw = amount * odds;
        const bal = w.exists ? (w.data().balance || 0) : 0;
        if (bal < amount) return { success: false, error: 'Insufficient balance' };
        const batch = db.batch();
        const ref = db.collection('bets').doc();
        batch.set(ref, { userId: user.uid, fixtureId: parseInt(fixtureId), betType: type, amount, odds, potentialWin: pw, matchName: `${m.data().homeTeam.name} vs ${m.data().awayTeam.name}`, kickoffTime: m.data().startTime, betCategory: 'overunder', status: 'active', placedAt: firebase.firestore.FieldValue.serverTimestamp() });
        batch.update(db.collection('wallets').doc(user.uid), { balance: bal - amount });
        await batch.commit();
        return { success: true, betId: ref.id, potentialWin: pw, newBalance: bal - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== BTTS =====
async function placeBTTSBet(fixtureId, type, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const [m, w] = await Promise.all([db.collection('sports_matches').doc(String(fixtureId)).get(), db.collection('wallets').doc(user.uid).get()]);
        if (!m.exists) return { success: false, error: 'Match not found' };
        if (m.data().status !== 'upcoming') return { success: false, error: 'Betting closed' };
        const odds = type === 'btts_yes' ? 1.90 : 1.85;
        const pw = amount * odds;
        const bal = w.exists ? (w.data().balance || 0) : 0;
        if (bal < amount) return { success: false, error: 'Insufficient balance' };
        const batch = db.batch();
        const ref = db.collection('bets').doc();
        batch.set(ref, { userId: user.uid, fixtureId: parseInt(fixtureId), betType: type, amount, odds, potentialWin: pw, matchName: `${m.data().homeTeam.name} vs ${m.data().awayTeam.name}`, kickoffTime: m.data().startTime, betCategory: 'btts', status: 'active', placedAt: firebase.firestore.FieldValue.serverTimestamp() });
        batch.update(db.collection('wallets').doc(user.uid), { balance: bal - amount });
        await batch.commit();
        return { success: true, betId: ref.id, potentialWin: pw, newBalance: bal - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== DOUBLE CHANCE =====
async function placeDoubleChanceBet(fixtureId, type, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const [m, w] = await Promise.all([db.collection('sports_matches').doc(String(fixtureId)).get(), db.collection('wallets').doc(user.uid).get()]);
        if (!m.exists) return { success: false, error: 'Match not found' };
        if (m.data().status !== 'upcoming') return { success: false, error: 'Betting closed' };
        const om = { '1X': 1.40, '12': 1.35, 'X2': 1.45 };
        const odds = om[type] || 1.40;
        const pw = amount * odds;
        const bal = w.exists ? (w.data().balance || 0) : 0;
        if (bal < amount) return { success: false, error: 'Insufficient balance' };
        const batch = db.batch();
        const ref = db.collection('bets').doc();
        batch.set(ref, { userId: user.uid, fixtureId: parseInt(fixtureId), betType: type, amount, odds, potentialWin: pw, matchName: `${m.data().homeTeam.name} vs ${m.data().awayTeam.name}`, kickoffTime: m.data().startTime, betCategory: 'doublechance', status: 'active', placedAt: firebase.firestore.FieldValue.serverTimestamp() });
        batch.update(db.collection('wallets').doc(user.uid), { balance: bal - amount });
        await batch.commit();
        return { success: true, betId: ref.id, potentialWin: pw, newBalance: bal - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== CARDS & CORNERS =====
async function placeCardCornerBet(fixtureId, type, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const [m, w] = await Promise.all([db.collection('sports_matches').doc(String(fixtureId)).get(), db.collection('wallets').doc(user.uid).get()]);
        if (!m.exists) return { success: false, error: 'Match not found' };
        if (m.data().status !== 'upcoming') return { success: false, error: 'Betting closed' };
        const om = { yellow_over: 1.70, yellow_under: 2.10, red_yes: 3.50, red_no: 1.30, corner_over: 1.90, corner_under: 1.85 };
        const odds = om[type] || 2.00;
        const pw = amount * odds;
        const bal = w.exists ? (w.data().balance || 0) : 0;
        if (bal < amount) return { success: false, error: 'Insufficient balance' };
        const batch = db.batch();
        const ref = db.collection('bets').doc();
        batch.set(ref, { userId: user.uid, fixtureId: parseInt(fixtureId), betType: type, amount, odds, potentialWin: pw, matchName: `${m.data().homeTeam.name} vs ${m.data().awayTeam.name}`, kickoffTime: m.data().startTime, betCategory: 'cards', status: 'active', placedAt: firebase.firestore.FieldValue.serverTimestamp() });
        batch.update(db.collection('wallets').doc(user.uid), { balance: bal - amount });
        await batch.commit();
        return { success: true, betId: ref.id, potentialWin: pw, newBalance: bal - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== ACCUMULATOR =====
async function placeAccumulatorBet(selections, amount) {
    const user = firebase.auth().currentUser;
    if (!user || !selections || selections.length < 2) return { success: false, error: 'Minimum 2 selections' };
    const db = firebase.firestore();
    try {
        let totalOdds = 1;
        for (const s of selections) { const m = await db.collection('sports_matches').doc(String(s.fixtureId)).get(); if (!m.exists) return { success: false, error: 'Match not found' }; if (m.data().status !== 'upcoming') return { success: false, error: 'Match not available' }; totalOdds *= (s.odds || 2); }
        const pw = amount * totalOdds;
        const w = await db.collection('wallets').doc(user.uid).get();
        const bal = w.exists ? (w.data().balance || 0) : 0;
        if (bal < amount) return { success: false, error: 'Insufficient balance' };
        const batch = db.batch();
        batch.set(db.collection('bets').doc(), { userId: user.uid, selections, amount, totalOdds, potentialWin: pw, betCategory: 'accumulator', status: 'active', placedAt: firebase.firestore.FieldValue.serverTimestamp() });
        batch.update(db.collection('wallets').doc(user.uid), { balance: bal - amount });
        await batch.commit();
        clearSlip();
        return { success: true, potentialWin: pw, newBalance: bal - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== CANCEL & CASHOUT =====
async function cancelBetWithFee(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const d = await db.collection('bets').doc(betId).get();
        if (!d.exists || d.data().userId !== user.uid || d.data().status !== 'active') return { success: false, error: 'Cannot cancel' };
        const m = await db.collection('sports_matches').doc(String(d.data().fixtureId)).get();
        const fp = typeof getCancelFee === 'function' ? getCancelFee(m.data()?.startTime) : 5;
        if (fp >= 100) return { success: false, error: 'Match started' };
        const fee = d.data().amount * (fp / 100);
        const refund = d.data().amount - fee;
        const w = await db.collection('wallets').doc(user.uid).get();
        const batch = db.batch();
        batch.update(db.collection('wallets').doc(user.uid), { balance: w.data().balance + refund });
        batch.update(d.ref, { status: 'cancelled', cancelFee: fee, refundAmount: refund, cancelledAt: new Date() });
        await batch.commit();
        return { success: true, refund, fee };
    } catch(e) { return { success: false, error: e.message }; }
}

async function cashoutBet(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    const db = firebase.firestore();
    try {
        const d = await db.collection('bets').doc(betId).get();
        if (!d.exists || d.data().status !== 'active') return { success: false, error: 'Cannot cash out' };
        const m = await db.collection('sports_matches').doc(String(d.data().fixtureId)).get();
        if (m.data()?.status !== 'live') return { success: false, error: 'Not live' };
        const min = typeof getMatchMinute === 'function' ? getMatchMinute(m.data()?.startTime) : 0;
        const fp = typeof getCashoutFee === 'function' ? getCashoutFee(min) : 25;
        const ca = d.data().potentialWin * 0.7 * (1 - fp / 100);
        const w = await db.collection('wallets').doc(user.uid).get();
        const batch = db.batch();
        batch.update(db.collection('wallets').doc(user.uid), { balance: w.data().balance + ca });
        batch.update(d.ref, { status: 'cashed_out', cashoutAmount: ca, cashoutFee: fp, cashedOutAt: new Date() });
        await batch.commit();
        return { success: true, amount: ca, fee: fp };
    } catch(e) { return { success: false, error: e.message }; }
}

window.placeSingleBet = placeSingleBet;
window.placeOverUnderBet = placeOverUnderBet;
window.placeBTTSBet = placeBTTSBet;
window.placeDoubleChanceBet = placeDoubleChanceBet;
window.placeCardCornerBet = placeCardCornerBet;
window.placeAccumulatorBet = placeAccumulatorBet;
window.cancelBetWithFee = cancelBetWithFee;
window.cashoutBet = cashoutBet;
window.placeBet = placeSingleBet;

console.log('✅ Betting Engine v6.0 - 1X2, O/U, BTTS, DC, Cards, Corners, Acc Slip');
