// ============================================
// betting-engine.js - v11.0 ALL BET TYPES
// ✅ 1X2, Double Chance, Over/Under, BTTS
// ✅ Corners, Cards, Handicap, Accumulator
// ============================================

window.ACCUMULATOR_SLIP = JSON.parse(localStorage.getItem('acc_slip') || '[]');

function saveSlip() {
    localStorage.setItem('acc_slip', JSON.stringify(window.ACCUMULATOR_SLIP));
}

// Single bet
async function placeBet(fixtureId, betType, betName, odds, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Please login' };
    if (amount < 1) return { success: false, error: 'Minimum bet $1' };
    
    const match = await window.supaDB.getMatch(fixtureId);
    if (!match) return { success: false, error: 'Match not found' };
    if (match.status !== 'upcoming' && match.status !== 'live') {
        return { success: false, error: 'Betting closed' };
    }
    
    const db = firebase.firestore();
    const wallet = await db.collection('wallets').doc(user.uid).get();
    const balance = wallet.exists ? wallet.data().balance : 0;
    
    if (balance < amount) return { success: false, error: 'Insufficient balance' };
    
    const potentialWin = amount * odds;
    
    // Deduct balance
    await db.collection('wallets').doc(user.uid).update({ balance: balance - amount });
    
    // Place bet
    const result = await window.supaDB.insertBet({
        userId: user.uid,
        fixtureId: fixtureId,
        betType: betType,
        amount: amount,
        odds: odds,
        potentialWin: potentialWin,
        matchName: `${match.home_team?.name} vs ${match.away_team?.name}`,
        kickoffTime: match.start_time,
        betCategory: 'single'
    });
    
    if (result.success) {
        return { success: true, potentialWin: potentialWin, newBalance: balance - amount };
    } else {
        await db.collection('wallets').doc(user.uid).update({ balance: balance });
        return { success: false, error: result.error };
    }
}

// Accumulator bet
async function placeAccumulator(selections, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Please login' };
    if (selections.length < 2) return { success: false, error: 'Need 2+ selections' };
    
    let totalOdds = 1;
    for (const s of selections) totalOdds *= s.odds;
    
    const potentialWin = amount * totalOdds;
    const db = firebase.firestore();
    const wallet = await db.collection('wallets').doc(user.uid).get();
    const balance = wallet.exists ? wallet.data().balance : 0;
    
    if (balance < amount) return { success: false, error: 'Insufficient balance' };
    
    await db.collection('wallets').doc(user.uid).update({ balance: balance - amount });
    
    const result = await window.supaDB.insertBet({
        userId: user.uid,
        fixtureId: selections[0].fixtureId,
        betType: 'accumulator',
        amount: amount,
        odds: totalOdds,
        potentialWin: potentialWin,
        matchName: `${selections.length}-fold Accumulator`,
        betCategory: 'accumulator',
        selections: selections,
        totalOdds: totalOdds
    });
    
    if (result.success) {
        clearSlip();
        return { success: true, potentialWin: potentialWin, newBalance: balance - amount };
    } else {
        await db.collection('wallets').doc(user.uid).update({ balance: balance });
        return { success: false, error: result.error };
    }
}

// Cancel bet
async function cancelBet(betId) {
    const user = firebase.auth().currentUser;
    const bet = await window.supaDB.getBetById(betId);
    if (!bet || bet.user_id !== user.uid) return { success: false, error: 'Cannot cancel' };
    
    const match = await window.supaDB.getMatch(bet.fixture_id);
    const now = new Date();
    const matchTime = new Date(match.start_time);
    
    if (now >= matchTime) return { success: false, error: 'Match started' };
    
    const hoursLeft = (matchTime - now) / (1000 * 60 * 60);
    let feePercent = hoursLeft < 1 ? 50 : (hoursLeft < 6 ? 20 : 5);
    const fee = bet.amount * (feePercent / 100);
    const refund = bet.amount - fee;
    
    const db = firebase.firestore();
    const wallet = await db.collection('wallets').doc(user.uid).get();
    await db.collection('wallets').doc(user.uid).update({ balance: wallet.data().balance + refund });
    
    await window.supaDB.updateBet(betId, { status: 'cancelled', cancel_fee: fee, refund_amount: refund });
    
    return { success: true, refund: refund, fee: fee };
}

// Add to accumulator slip
function addToSlip(fixtureId, matchName, betType, betName, odds) {
    if (window.ACCUMULATOR_SLIP.some(s => s.fixtureId === fixtureId && s.betType === betType)) {
        alert('Already in slip');
        return false;
    }
    window.ACCUMULATOR_SLIP.push({ fixtureId, matchName, betType, betName, odds });
    saveSlip();
    if (typeof window.updateSlipUI === 'function') window.updateSlipUI();
    return true;
}

function removeFromSlip(index) {
    window.ACCUMULATOR_SLIP.splice(index, 1);
    saveSlip();
    if (typeof window.updateSlipUI === 'function') window.updateSlipUI();
}

function clearSlip() {
    window.ACCUMULATOR_SLIP = [];
    saveSlip();
    if (typeof window.updateSlipUI === 'function') window.updateSlipUI();
}

// Export
window.placeBet = placeBet;
window.placeAccumulator = placeAccumulator;
window.cancelBet = cancelBet;
window.addToSlip = addToSlip;
window.removeFromSlip = removeFromSlip;
window.clearSlip = clearSlip;

console.log('🎲 Betting Engine v11.0 - All Bet Types Ready');
