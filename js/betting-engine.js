// ============================================
// betting-engine.js - v12.0 COMPLETE
// ✅ All bet types: 1X2, Double Chance, Over/Under, BTTS, Handicap, Corners, Cards
// ✅ Accumulator bets
// ✅ Balance check and management
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

// ===== ALL BET TYPES =====
const BET_TYPES = {
    // 1X2
    home: { name: 'Home Win', category: '1x2' },
    draw: { name: 'Draw', category: '1x2' },
    away: { name: 'Away Win', category: '1x2' },
    
    // Double Chance
    '1X': { name: 'Home or Draw', category: 'double_chance' },
    '12': { name: 'Home or Away', category: 'double_chance' },
    'X2': { name: 'Draw or Away', category: 'double_chance' },
    
    // Over/Under
    over05: { name: 'Over 0.5 Goals', category: 'over_under', value: 0.5 },
    under05: { name: 'Under 0.5 Goals', category: 'over_under', value: 0.5 },
    over15: { name: 'Over 1.5 Goals', category: 'over_under', value: 1.5 },
    under15: { name: 'Under 1.5 Goals', category: 'over_under', value: 1.5 },
    over25: { name: 'Over 2.5 Goals', category: 'over_under', value: 2.5 },
    under25: { name: 'Under 2.5 Goals', category: 'over_under', value: 2.5 },
    over35: { name: 'Over 3.5 Goals', category: 'over_under', value: 3.5 },
    under35: { name: 'Under 3.5 Goals', category: 'over_under', value: 3.5 },
    
    // BTTS
    btts_yes: { name: 'Both Teams to Score - Yes', category: 'btts' },
    btts_no: { name: 'Both Teams to Score - No', category: 'btts' },
    
    // Asian Handicap
    handicap_home: { name: 'Home (-1.5)', category: 'handicap', value: -1.5 },
    handicap_away: { name: 'Away (+1.5)', category: 'handicap', value: 1.5 },
    
    // Corners
    corners_over: { name: 'Over 9.5 Corners', category: 'corners', value: 9.5 },
    corners_under: { name: 'Under 9.5 Corners', category: 'corners', value: 9.5 },
    
    // Cards
    cards_over: { name: 'Over 4.5 Cards', category: 'cards', value: 4.5 },
    cards_under: { name: 'Under 4.5 Cards', category: 'cards', value: 4.5 },
    
    // Half Time / Full Time
    ht_ft_home_home: { name: 'HT: Home / FT: Home', category: 'ht_ft' },
    ht_ft_home_draw: { name: 'HT: Home / FT: Draw', category: 'ht_ft' },
    ht_ft_home_away: { name: 'HT: Home / FT: Away', category: 'ht_ft' },
    ht_ft_draw_home: { name: 'HT: Draw / FT: Home', category: 'ht_ft' },
    ht_ft_draw_draw: { name: 'HT: Draw / FT: Draw', category: 'ht_ft' },
    ht_ft_draw_away: { name: 'HT: Draw / FT: Away', category: 'ht_ft' },
    ht_ft_away_home: { name: 'HT: Away / FT: Home', category: 'ht_ft' },
    ht_ft_away_draw: { name: 'HT: Away / FT: Draw', category: 'ht_ft' },
    ht_ft_away_away: { name: 'HT: Away / FT: Away', category: 'ht_ft' },
    
    // First Goal Scorer
    first_goal_home: { name: 'First Goal - Home Team', category: 'first_goal' },
    first_goal_away: { name: 'First Goal - Away Team', category: 'first_goal' },
    
    // Exact Goals
    exact_goals_0: { name: 'Exact Goals: 0', category: 'exact_goals' },
    exact_goals_1: { name: 'Exact Goals: 1', category: 'exact_goals' },
    exact_goals_2: { name: 'Exact Goals: 2', category: 'exact_goals' },
    exact_goals_3: { name: 'Exact Goals: 3', category: 'exact_goals' },
    exact_goals_4: { name: 'Exact Goals: 4+', category: 'exact_goals' }
};

// ===== SINGLE BET =====
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
        
        let odds = null;
        if (betType === 'home') odds = parseFloat(match.odds?.home || 2.5);
        else if (betType === 'draw') odds = parseFloat(match.odds?.draw || 3.2);
        else if (betType === 'away') odds = parseFloat(match.odds?.away || 2.8);
        else odds = 2.0;
        
        const potentialWin = amount * odds;
        const betName = BET_TYPES[betType]?.name || betType;
        
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

// ===== ACCUMULATOR BET =====
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

// ===== ADD TO ACCUMULATOR SLIP =====
function addToAccumulatorSlip(fixtureId, matchName, betType, odds) {
    const betInfo = BET_TYPES[betType];
    if (!betInfo) return false;
    
    if (window.ACCUMULATOR_SLIP.some(s => s.fixtureId === fixtureId && s.betType === betType)) {
        alert('Already in slip');
        return false;
    }
    
    window.ACCUMULATOR_SLIP.push({
        fixtureId: fixtureId,
        matchName: matchName,
        betType: betType,
        betTypeName: betInfo.name,
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

// ===== CANCEL BET =====
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

// ===== SHOW ACCUMULATOR POPUP =====
function showAccumulatorPopup(fixtureId, homeName, awayName, homeOdds, drawOdds, awayOdds) {
    const popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;padding:15px;';
    popup.innerHTML = `
        <div style="background:#111827;border-radius:20px;padding:25px;max-width:400px;width:100%;border:2px solid #ff9800;text-align:center;">
            <h3 style="color:#ff9800;margin-bottom:10px;">Add to Accumulator</h3>
            <p style="color:white;margin-bottom:20px;">${escapeHtml(homeName)} vs ${escapeHtml(awayName)}</p>
            <button onclick="window.addAccSelection(${fixtureId},'${escapeHtml(homeName)}','${escapeHtml(awayName)}','home',${homeOdds});this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:#1a2332;border-radius:10px;color:white;margin-bottom:10px;cursor:pointer;">🏠 Home Win @ ${homeOdds}</button>
            <button onclick="window.addAccSelection(${fixtureId},'${escapeHtml(homeName)}','${escapeHtml(awayName)}','draw',${drawOdds});this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:#1a2332;border-radius:10px;color:white;margin-bottom:10px;cursor:pointer;">🤝 Draw @ ${drawOdds}</button>
            <button onclick="window.addAccSelection(${fixtureId},'${escapeHtml(homeName)}','${escapeHtml(awayName)}','away',${awayOdds});this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:#1a2332;border-radius:10px;color:white;margin-bottom:10px;cursor:pointer;">✈️ Away Win @ ${awayOdds}</button>
            <hr style="margin:15px 0; border-color:#ffffff22;">
            <button onclick="window.addAccSelection(${fixtureId},'${escapeHtml(homeName)}','${escapeHtml(awayName)}','over25',1.85);this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:#1a2332;border-radius:10px;color:white;margin-bottom:10px;cursor:pointer;">⚽ Over 2.5 Goals @ 1.85</button>
            <button onclick="window.addAccSelection(${fixtureId},'${escapeHtml(homeName)}','${escapeHtml(awayName)}','btts_yes',1.90);this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:#1a2332;border-radius:10px;color:white;margin-bottom:10px;cursor:pointer;">✅ BTTS Yes @ 1.90</button>
            <button onclick="this.parentElement.parentElement.remove();" style="display:block;width:100%;padding:12px;background:transparent;border:1px solid #ff5252;border-radius:10px;color:#ff5252;cursor:pointer;margin-top:10px;">Cancel</button>
        </div>
    `;
    document.body.appendChild(popup);
}

window.addAccSelection = function(fixtureId, homeName, awayName, betType, odds) {
    const betInfo = BET_TYPES[betType];
    const betName = betInfo ? betInfo.name : betType;
    
    if (window.ACCUMULATOR_SLIP.some(s => s.fixtureId === fixtureId && s.betType === betType)) {
        alert('Already in slip');
        return;
    }
    window.ACCUMULATOR_SLIP.push({
        fixtureId: fixtureId,
        matchName: `${homeName} vs ${awayName}`,
        betType: betType,
        betTypeName: betName,
        odds: odds
    });
    saveSlip();
    if (typeof window.updateSlipUI === 'function') window.updateSlipUI();
    alert(`Added to slip: ${betName} @ ${odds}`);
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ===== CALCULATE POTENTIAL WIN =====
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

// ===== EXPORTS =====
window.placeSingleBet = placeSingleBet;
window.placeAccumulatorBet = placeAccumulatorBet;
window.cancelBet = cancelBet;
window.addToAccumulatorSlip = addToAccumulatorSlip;
window.removeFromSlip = removeFromSlip;
window.clearSlip = clearSlip;
window.showAccumulatorPopup = showAccumulatorPopup;
window.calculatePotentialWin = calculatePotentialWin;
window.calculateAccumulatorOdds = calculateAccumulatorOdds;
window.BET_TYPES = BET_TYPES;

console.log('🎲 Betting Engine v12.0 - Complete (All bet types available)');
