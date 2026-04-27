// ============================================
// betting-engine.js - v8.0 SUPABASE
// All bet types + Accumulator Slip
// ============================================

window.ACCUMULATOR_SLIP = JSON.parse(localStorage.getItem('acc_slip') || '[]');
function saveSlip() { localStorage.setItem('acc_slip', JSON.stringify(window.ACCUMULATOR_SLIP)); }
function addToSlip(selection) { if (window.ACCUMULATOR_SLIP.some(s => s.fixtureId === selection.fixtureId && s.betType === selection.betType)) return false; window.ACCUMULATOR_SLIP.push(selection); saveSlip(); return true; }
function removeFromSlip(index) { window.ACCUMULATOR_SLIP.splice(index, 1); saveSlip(); }
function clearSlip() { window.ACCUMULATOR_SLIP = []; saveSlip(); }

// ===== PLACE BET (SUPABASE) =====
async function placeSingleBet(fixtureId, betType, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    
    try {
        // Get match from Supabase
        const { data: matchData } = await supaClient.from('sports_matches').select('*').eq('fixture_id', fixtureId).single();
        if (!matchData) return { success: false, error: 'Match not found' };
        if (matchData.status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const odds = matchData.odds?.[betType] || 2.00;
        const potentialWin = amount * odds;
        
        // Check balance on FIREBASE
        const db = firebase.firestore();
        const walletDoc = await db.collection('wallets').doc(user.uid).get();
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        // Deduct from FIREBASE wallet
        await db.collection('wallets').doc(user.uid).update({ balance: balance - amount });
        
        // Save bet to SUPABASE
        const result = await window.supaDB.insertBet({
            userId: user.uid, fixtureId: parseInt(fixtureId), betType, amount, odds, potentialWin,
            matchName: `${matchData.home_team?.name || 'Home'} vs ${matchData.away_team?.name || 'Away'}`,
            kickoffTime: matchData.start_time, betCategory: 'single'
        });
        
        return { success: result.success, betId: result.data?.id, potentialWin, newBalance: balance - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

async function placeAccumulatorBet(selections, amount) {
    const user = firebase.auth().currentUser;
    if (!user || !selections || selections.length < 2) return { success: false, error: 'Minimum 2 selections' };
    
    try {
        let totalOdds = 1;
        for (const s of selections) {
            const { data: m } = await supaClient.from('sports_matches').select('status').eq('fixture_id', s.fixtureId).single();
            if (!m) return { success: false, error: 'Match not found' };
            if (m.status !== 'upcoming') return { success: false, error: 'Match not available' };
            totalOdds *= (s.odds || 2);
        }
        
        const potentialWin = amount * totalOdds;
        const db = firebase.firestore();
        const walletDoc = await db.collection('wallets').doc(user.uid).get();
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        await db.collection('wallets').doc(user.uid).update({ balance: balance - amount });
        
        const result = await window.supaDB.insertBet({
            userId: user.uid, selections, amount, totalOdds, potentialWin,
            betCategory: 'accumulator', betType: 'accumulator', odds: totalOdds,
            fixtureId: selections[0].fixtureId
        });
        
        clearSlip();
        return { success: result.success, potentialWin, newBalance: balance - amount };
    } catch(e) { return { success: false, error: e.message }; }
}

async function cancelBetWithFee(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    
    try {
        const { data: bet } = await supaClient.from('bets').select('*').eq('id', betId).single();
        if (!bet) return { success: false, error: 'Bet not found' };
        if (bet.user_id !== user.uid || bet.status !== 'active') return { success: false, error: 'Cannot cancel' };
        
        const feePercent = typeof getCancelFee === 'function' ? getCancelFee(bet.kickoff_time) : 5;
        if (feePercent >= 100) return { success: false, error: 'Match started' };
        
        const fee = parseFloat(bet.amount) * (feePercent / 100);
        const refund = parseFloat(bet.amount) - fee;
        
        const db = firebase.firestore();
        const walletDoc = await db.collection('wallets').doc(user.uid).get();
        await db.collection('wallets').doc(user.uid).update({ balance: walletDoc.data().balance + refund });
        
        await window.supaDB.updateBet(betId, { status: 'cancelled', cancel_fee: fee, refund_amount: refund, cancelled_at: new Date().toISOString() });
        
        return { success: true, refund, fee };
    } catch(e) { return { success: false, error: e.message }; }
}

// ===== EXPORT =====
window.placeSingleBet = placeSingleBet;
window.placeAccumulatorBet = placeAccumulatorBet;
window.cancelBetWithFee = cancelBetWithFee;
window.cashoutBet = async () => { return { success: false, error: 'Not available' }; };
window.placeBet = placeSingleBet;
window.addToSlip = addToSlip;
window.removeFromSlip = removeFromSlip;
window.clearSlip = clearSlip;

console.log('✅ Betting Engine v8.0 - Supabase');
