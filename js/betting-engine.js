// ============================================
// betting-engine.js - v12.0 WORKING
// ✅ All bet types
// ✅ Accumulator support
// ✅ Balance management
// ============================================

window.ACCUMULATOR_SLIP = JSON.parse(localStorage.getItem('acc_slip') || '[]');

function saveSlip() {
    localStorage.setItem('acc_slip', JSON.stringify(window.ACCUMULATOR_SLIP));
}

function clearSlip() {
    window.ACCUMULATOR_SLIP = [];
    saveSlip();
    if (typeof window.updateSlipUI === 'function') window.updateSlipUI();
}

// Single bet
async function placeSingleBet(fixtureId, betType, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Please login first' };
    if (amount < 1) return { success: false, error: 'Minimum bet is $1' };
    
    try {
        const match = await window.supaDB.getMatch(fixtureId);
        if (!match) return { success: false, error: 'Match not found' };
        
        if (match.status !== 'upcoming' && match.status !== 'live') {
            return { success: false, error: 'Betting closed for this match' };
        }
        
        let odds = 2.0;
        let betTypeName = betType;
        if (betType === 'home') odds = parseFloat(match.odds?.home || 2.5);
        else if (betType === 'draw') odds = parseFloat(match.odds?.draw || 3.2);
        else if (betType === 'away') odds = parseFloat(match.odds?.away || 2.8);
        
        const potentialWin = amount * odds;
        
        const db = firebase.firestore();
        const walletDoc = await db.collection('wallets').doc(user.uid).get();
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        
        if (balance < amount) {
            return { success: false, error: 'Insufficient balance' };
        }
        
        await db.collection('wallets').doc(user.uid).update({ balance: balance - amount });
        
        const result = await window.supaDB.insertBet({
            userId: user.uid,
            fixtureId: fixtureId,
            betType: betType,
            amount: amount,
            odds: odds,
            potentialWin: potentialWin,
            matchName: `${match.home_team?.name || 'Home'} vs ${match.away_team?.name || 'Away'}`,
            kickoffTime: match.start_time,
            betCategory: 'single'
        });
        
        if (result.success) {
            return {
                success: true,
                betId: result.data?.id,
                potentialWin: potentialWin,
                newBalance: balance - amount
            };
        } else {
            await db.collection('wallets').doc(user.uid).update({ balance: balance });
            return { success: false, error: result.error };
        }
        
    } catch(e) {
        return { success: false, error: e.message };
    }
}

// Accumulator bet
async function placeAccumulatorBet(selections, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Please login first' };
    if (!selections || selections.length < 2) {
        return { success: false, error: 'Minimum 2 selections required' };
    }
    
    try {
        let totalOdds = 1;
        for (const s of selections) {
            totalOdds *= s.odds;
        }
        
        const potentialWin = amount * totalOdds;
        
        const db = firebase.firestore();
        const walletDoc = await db.collection('wallets').doc(user.uid).get();
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        
        if (balance < amount) {
            return { success: false, error: 'Insufficient balance' };
        }
        
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
            return {
                success: true,
                betId: result.data?.id,
                potentialWin: potentialWin,
                newBalance: balance - amount
            };
        } else {
            await db.collection('wallets').doc(user.uid).update({ balance: balance });
            return { success: false, error: result.error };
        }
        
    } catch(e) {
        return { success: false, error: e.message };
    }
}

// Cancel bet
async function cancelBet(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Please login' };
    
    try {
        const bet = await window.supaDB.getBetById(betId);
        if (!bet || bet.user_id !== user.uid) return { success: false, error: 'Bet not found' };
        if (bet.status !== 'active') return { success: false, error: 'Bet cannot be cancelled' };
        
        const match = await window.supaDB.getMatch(bet.fixture_id);
        const now = new Date();
        const matchTime = new Date(match.start_time);
        
        if (now >= matchTime) return { success: false, error: 'Match already started' };
        
        const hoursLeft = (matchTime - now) / (1000 * 60 * 60);
        let feePercent = 5;
        if (hoursLeft < 1) feePercent = 50;
        else if (hoursLeft < 6) feePercent = 20;
        else if (hoursLeft < 24) feePercent = 10;
        
        const fee = bet.amount * (feePercent / 100);
        const refund = bet.amount - fee;
        
        const db = firebase.firestore();
        const wallet = await db.collection('wallets').doc(user.uid).get();
        await db.collection('wallets').doc(user.uid).update({ balance: wallet.data().balance + refund });
        
        await window.supaDB.updateBet(betId, {
            status: 'cancelled',
            cancel_fee: fee,
            refund_amount: refund,
            cancelled_at: new Date().toISOString()
        });
        
        return { success: true, refund: refund, fee: fee, feePercent: feePercent };
        
    } catch(e) {
        return { success: false, error: e.message };
    }
}

// Add to accumulator slip
function addToAccumulatorSlip(fixtureId, matchName, betType, odds) {
    let betTypeName = '';
    if (betType === 'home') betTypeName = 'Home Win';
    else if (betType === 'draw') betTypeName = 'Draw';
    else if (betType === 'away') betTypeName = 'Away Win';
    
    if (window.ACCUMULATOR_SLIP.some(s => s.fixtureId === fixtureId && s.betType === betType)) {
        alert('Already in slip');
        return false;
    }
    
    window.ACCUMULATOR_SLIP.push({
        fixtureId: fixtureId,
        matchName: matchName,
        betType: betType,
        betTypeName: betTypeName,
        odds: odds
    });
    saveSlip();
    if (typeof window.updateSlipUI === 'function') window.updateSlipUI();
    return true;
}

function removeFromSlip(index) {
    window.ACCUMULATOR_SLIP.splice(index, 1);
    saveSlip();
    if (typeof window.updateSlipUI === 'function') window.updateSlipUI();
}

// Show accumulator popup
function showAccumulatorPopup(fixtureId, homeName, awayName, homeOdds, drawOdds, awayOdds) {
    const popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;padding:15px;';
    popup.innerHTML = `
        <div style="background:#111827;border-radius:20px;padding:25px;max-width:400px;width:100%;border:2px solid #ff9800;text-align:center;">
            <h3 style="color:#ff9800;margin-bottom:10px;">Add to Accumulator</h3>
            <p style="color:white;margin-bottom:20px;">${escapeHtml(homeName)} vs ${escapeHtml(awayName)}</p>
            <button onclick="window.addToAccumulatorSlip(${fixtureId},'${escapeHtml(homeName)} vs ${escapeHtml(awayName)}','home',${homeOdds});this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:#1a2332;border-radius:10px;color:white;margin-bottom:10px;cursor:pointer;">🏠 Home Win @ ${homeOdds}</button>
            <button onclick="window.addToAccumulatorSlip(${fixtureId},'${escapeHtml(homeName)} vs ${escapeHtml(awayName)}','draw',${drawOdds});this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:#1a2332;border-radius:10px;color:white;margin-bottom:10px;cursor:pointer;">🤝 Draw @ ${drawOdds}</button>
            <button onclick="window.addToAccumulatorSlip(${fixtureId},'${escapeHtml(homeName)} vs ${escapeHtml(awayName)}','away',${awayOdds});this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:#1a2332;border-radius:10px;color:white;margin-bottom:10px;cursor:pointer;">✈️ Away Win @ ${awayOdds}</button>
            <button onclick="this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:transparent;border:1px solid #ff5252;border-radius:10px;color:#ff5252;cursor:pointer;margin-top:10px;">Cancel</button>
        </div>
    `;
    document.body.appendChild(popup);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Export
window.placeSingleBet = placeSingleBet;
window.placeAccumulatorBet = placeAccumulatorBet;
window.cancelBet = cancelBet;
window.addToAccumulatorSlip = addToAccumulatorSlip;
window.removeFromSlip = removeFromSlip;
window.clearSlip = clearSlip;
window.showAccumulatorPopup = showAccumulatorPopup;

console.log('🎲 Betting Engine v12.0 - Ready');
