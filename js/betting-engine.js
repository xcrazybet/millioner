// ============================================
// betting-engine.js - v9.0 SUPABASE
// Fixed accumulator slip with outcome selector
// ============================================

window.ACCUMULATOR_SLIP = JSON.parse(localStorage.getItem('acc_slip') || '[]');
function saveSlip() { localStorage.setItem('acc_slip', JSON.stringify(window.ACCUMULATOR_SLIP)); }
function addToSlip(selection) { if (window.ACCUMULATOR_SLIP.some(s => s.fixtureId === selection.fixtureId && s.betType === selection.betType)) return false; window.ACCUMULATOR_SLIP.push(selection); saveSlip(); return true; }
function removeFromSlip(index) { window.ACCUMULATOR_SLIP.splice(index, 1); saveSlip(); }
function clearSlip() { window.ACCUMULATOR_SLIP = []; saveSlip(); }

// 🔥 NEW: Show outcome selector popup for accumulator
function showAccumulatorPopup(fixtureId, homeName, awayName, homeOdds, drawOdds, awayOdds) {
    const popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;padding:15px;';
    popup.innerHTML = `
        <div style="background:#111827;border-radius:20px;padding:25px;max-width:400px;width:100%;border:2px solid #ff9800;text-align:center;">
            <div style="color:#ff9800;font-size:18px;font-weight:bold;margin-bottom:5px;">Add to Accumulator</div>
            <div style="color:white;font-size:16px;margin-bottom:20px;">${homeName} vs ${awayName}</div>
            <div style="color:#a0a8c9;margin-bottom:15px;">Choose outcome:</div>
            <button onclick="addAccSelection(${fixtureId},'${homeName.replace(/'/g,"\\'")}','${awayName.replace(/'/g,"\\'")}','home','Home Win',${homeOdds});this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:15px;background:#1a2332;border:2px solid transparent;border-radius:12px;color:white;font-size:16px;margin-bottom:10px;cursor:pointer;">Home Win @${homeOdds.toFixed(2)}</button>
            <button onclick="addAccSelection(${fixtureId},'${homeName.replace(/'/g,"\\'")}','${awayName.replace(/'/g,"\\'")}','draw','Draw',${drawOdds});this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:15px;background:#1a2332;border:2px solid transparent;border-radius:12px;color:white;font-size:16px;margin-bottom:10px;cursor:pointer;">Draw @${drawOdds.toFixed(2)}</button>
            <button onclick="addAccSelection(${fixtureId},'${homeName.replace(/'/g,"\\'")}','${awayName.replace(/'/g,"\\'")}','away','Away Win',${awayOdds});this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:15px;background:#1a2332;border:2px solid transparent;border-radius:12px;color:white;font-size:16px;margin-bottom:10px;cursor:pointer;">Away Win @${awayOdds.toFixed(2)}</button>
            <button onclick="this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:transparent;border:1px solid #ff5252;border-radius:10px;color:#ff5252;cursor:pointer;margin-top:10px;">Cancel</button>
        </div>
    `;
    document.body.appendChild(popup);
}

// 🔥 NEW: Add selection with chosen outcome
window.addAccSelection = function(fixtureId, homeName, awayName, betType, betTypeName, odds) {
    if (window.ACCUMULATOR_SLIP.some(s => s.fixtureId === fixtureId && s.betType === betType)) {
        alert('Already in slip');
        return;
    }
    window.ACCUMULATOR_SLIP.push({
        fixtureId: fixtureId,
        matchName: `${homeName} vs ${awayName}`,
        betType: betType,
        betTypeName: betTypeName,
        odds: odds
    });
    saveSlip();
    if (typeof window.updateSlipUI === 'function') {
        window.updateSlipUI();
    }
};

// ===== PLACE BET (SUPABASE) =====
async function placeSingleBet(fixtureId, betType, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    
    try {
        const { data: matchData } = await supaClient.from('sports_matches').select('*').eq('fixture_id', fixtureId).single();
        if (!matchData) return { success: false, error: 'Match not found' };
        if (matchData.status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const odds = matchData.odds?.[betType] || 2.00;
        const potentialWin = amount * odds;
        
        const db = firebase.firestore();
        const walletDoc = await db.collection('wallets').doc(user.uid).get();
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        await db.collection('wallets').doc(user.uid).update({ balance: balance - amount });
        
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
            if (m.status !== 'upcoming') return { success: false, error: 'Match not available: ' + s.matchName };
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
window.showAccumulatorPopup = showAccumulatorPopup;

console.log('✅ Betting Engine v9.0 - Accumulator Popup Ready');
