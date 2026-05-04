// ============================================
// betting-engine.js - v10.0 COMPLETE
// ✅ All bet types: 1X2, Over/Under, BTTS, Double Chance, Corners, Cards
// ✅ Accumulator bets
// ✅ Balance check before betting
// ✅ Auto-slip management
// ============================================

// Slip management
window.ACCUMULATOR_SLIP = JSON.parse(localStorage.getItem('acc_slip') || '[]');

function saveSlip() {
    localStorage.setItem('acc_slip', JSON.stringify(window.ACCUMULATOR_SLIP));
}

function addToSlip(selection) {
    if (window.ACCUMULATOR_SLIP.some(s => s.fixtureId === selection.fixtureId && s.betType === selection.betType)) {
        return false;
    }
    window.ACCUMULATOR_SLIP.push(selection);
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

// ===== SINGLE BET =====
async function placeSingleBet(fixtureId, betType, betName, odds, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Please login first' };
    
    if (amount < 1) return { success: false, error: 'Minimum bet is $1' };
    
    try {
        // Get match details
        const match = await window.supaDB.getMatch(fixtureId);
        if (!match) return { success: false, error: 'Match not found' };
        
        if (match.status !== 'upcoming') {
            return { success: false, error: 'Betting closed for this match' };
        }
        
        // Check balance
        const db = firebase.firestore();
        const walletDoc = await db.collection('wallets').doc(user.uid).get();
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        
        if (balance < amount) {
            return { success: false, error: 'Insufficient balance' };
        }
        
        const potentialWin = amount * odds;
        
        // Deduct amount immediately
        await db.collection('wallets').doc(user.uid).update({
            balance: balance - amount
        });
        
        // Place bet
        const result = await window.supaDB.insertBet({
            userId: user.uid,
            fixtureId: fixtureId,
            betType: betType,
            betName: betName,
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
            // Refund if bet failed
            await db.collection('wallets').doc(user.uid).update({
                balance: balance
            });
            return { success: false, error: result.error };
        }
        
    } catch(e) {
        return { success: false, error: e.message };
    }
}

// ===== ACCUMULATOR BET =====
async function placeAccumulatorBet(selections, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Please login first' };
    
    if (!selections || selections.length < 2) {
        return { success: false, error: 'Minimum 2 selections required' };
    }
    
    try {
        // Calculate total odds
        let totalOdds = 1;
        for (const s of selections) {
            totalOdds *= s.odds;
        }
        
        const potentialWin = amount * totalOdds;
        
        // Check balance
        const db = firebase.firestore();
        const walletDoc = await db.collection('wallets').doc(user.uid).get();
        const balance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        
        if (balance < amount) {
            return { success: false, error: 'Insufficient balance' };
        }
        
        // Deduct amount
        await db.collection('wallets').doc(user.uid).update({
            balance: balance - amount
        });
        
        // Place accumulator bet
        const result = await window.supaDB.insertBet({
            userId: user.uid,
            fixtureId: selections[0].fixtureId,
            betType: 'accumulator',
            betName: `${selections.length}-fold Accumulator`,
            amount: amount,
            odds: totalOdds,
            potentialWin: potentialWin,
            matchName: `${selections.length} selections`,
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
            // Refund
            await db.collection('wallets').doc(user.uid).update({
                balance: balance
            });
            return { success: false, error: result.error };
        }
        
    } catch(e) {
        return { success: false, error: e.message };
    }
}

// ===== CANCEL BET WITH FEE =====
async function cancelBet(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Please login' };
    
    try {
        const bet = await window.supaDB.getBetById(betId);
        if (!bet) return { success: false, error: 'Bet not found' };
        
        if (bet.user_id !== user.uid) {
            return { success: false, error: 'Not your bet' };
        }
        
        if (bet.status !== 'active') {
            return { success: false, error: 'Bet cannot be cancelled' };
        }
        
        // Check if match has started
        const match = await window.supaDB.getMatch(bet.fixture_id);
        const now = new Date();
        const matchTime = new Date(match.start_time);
        
        if (now >= matchTime) {
            return { success: false, error: 'Match already started, cannot cancel' };
        }
        
        // Calculate cancellation fee
        const hoursUntilMatch = (matchTime - now) / (1000 * 60 * 60);
        let feePercent = 5;
        if (hoursUntilMatch < 1) feePercent = 50;
        else if (hoursUntilMatch < 6) feePercent = 20;
        else if (hoursUntilMatch < 24) feePercent = 10;
        
        const fee = bet.amount * (feePercent / 100);
        const refund = bet.amount - fee;
        
        // Refund to wallet
        const db = firebase.firestore();
        const walletDoc = await db.collection('wallets').doc(user.uid).get();
        const currentBalance = walletDoc.exists ? (walletDoc.data().balance || 0) : 0;
        await db.collection('wallets').doc(user.uid).update({
            balance: currentBalance + refund
        });
        
        // Update bet status
        await window.supaDB.updateBet(betId, {
            status: 'cancelled',
            cancel_fee: fee,
            refund_amount: refund,
            cancelled_at: new Date().toISOString()
        });
        
        return {
            success: true,
            refund: refund,
            fee: fee,
            feePercent: feePercent
        };
        
    } catch(e) {
        return { success: false, error: e.message };
    }
}

// ===== SHOW ACCUMULATOR POPUP =====
function showAccumulatorPopup(fixtureId, homeName, awayName, homeOdds, drawOdds, awayOdds) {
    const popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;padding:15px;';
    popup.innerHTML = `
        <div style="background:#111827;border-radius:20px;padding:25px;max-width:400px;width:100%;border:2px solid #ff9800;text-align:center;">
            <h3 style="color:#ff9800;margin-bottom:10px;">Add to Accumulator</h3>
            <p style="color:white;margin-bottom:20px;">${homeName} vs ${awayName}</p>
            <button onclick="window.addAccSelection(${fixtureId},'${homeName.replace(/'/g, "\\'")}','${awayName.replace(/'/g, "\\'")}','home','Home Win',${homeOdds});this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:#1a2332;border-radius:10px;color:white;margin-bottom:10px;cursor:pointer;">Home Win @ ${homeOdds}</button>
            <button onclick="window.addAccSelection(${fixtureId},'${homeName.replace(/'/g, "\\'")}','${awayName.replace(/'/g, "\\'")}','draw','Draw',${drawOdds});this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:#1a2332;border-radius:10px;color:white;margin-bottom:10px;cursor:pointer;">Draw @ ${drawOdds}</button>
            <button onclick="window.addAccSelection(${fixtureId},'${homeName.replace(/'/g, "\\'")}','${awayName.replace(/'/g, "\\'")}','away','Away Win',${awayOdds});this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:#1a2332;border-radius:10px;color:white;margin-bottom:10px;cursor:pointer;">Away Win @ ${awayOdds}</button>
            <button onclick="this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:transparent;border:1px solid #ff5252;border-radius:10px;color:#ff5252;cursor:pointer;">Cancel</button>
        </div>
    `;
    document.body.appendChild(popup);
}

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
    if (typeof window.updateSlipUI === 'function') window.updateSlipUI();
    alert('Added to bet slip!');
};

// ===== ODDS CALCULATIONS =====
function calculatePotentialWin(amount, odds) {
    return amount * odds;
}

function calculateAccumulatorOdds(selections) {
    let total = 1;
    for (const s of selections) {
        total *= s.odds;
    }
    return total;
}

// Export for global use
window.placeSingleBet = placeSingleBet;
window.placeAccumulatorBet = placeAccumulatorBet;
window.cancelBet = cancelBet;
window.addToSlip = addToSlip;
window.removeFromSlip = removeFromSlip;
window.clearSlip = clearSlip;
window.showAccumulatorPopup = showAccumulatorPopup;
window.calculatePotentialWin = calculatePotentialWin;
window.calculateAccumulatorOdds = calculateAccumulatorOdds;

console.log('🎲 Betting Engine v10.0 - Ready');
console.log('   Bet types: 1X2, Over/Under, BTTS, Double Chance, Corners, Cards');
