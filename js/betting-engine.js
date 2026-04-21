// ============================================
// X LODON BETTING ENGINE - PRODUCTION v3.0
// Single bets, Accumulator, Cashout, Fees
// ============================================

const BETTING_CONFIG = {
    cancelFee: 0.05,      // 5% fee for cancellation
    cashoutFee: 0.10,     // 10% fee for cashout
    minBet: 1,
    maxBet: 1000
};

// ===== SINGLE BET =====
async function placeSingleBet(fixtureId, betType, amount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    
    const db = firebase.firestore();
    
    try {
        const matchDoc = await db.collection('sports_matches').doc(fixtureId.toString()).get();
        if (!matchDoc.exists) return { success: false, error: 'Match not found' };
        
        const match = matchDoc.data();
        if (match.status !== 'upcoming') return { success: false, error: 'Betting closed' };
        
        const odds = match.odds?.[betType] || 2.00;
        const potentialWin = amount * odds;
        
        // Check balance
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletDoc = await walletRef.get();
        const balance = walletDoc.data()?.balance || 0;
        
        if (balance < amount) return { success: false, error: 'Insufficient balance' };
        
        // Deduct
        await walletRef.update({
            balance: balance - amount,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Record transaction
        await walletRef.collection('transactions').add({
            type: 'bet',
            amount: -amount,
            description: `Bet: ${match.homeTeam.name} vs ${match.awayTeam.name}`,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Save bet
        const betRef = await db.collection('bets').add({
            userId: user.uid,
            userEmail: user.email,
            fixtureId, betType, amount, odds, potentialWin,
            matchName: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            betTypeName: betType === 'home' ? 'Home Win' : betType === 'draw' ? 'Draw' : 'Away Win',
            status: 'active',
            betCategory: 'single',
            placedAt: firebase.firestore.FieldValue.serverTimestamp(),
            canCancel: true,
            canCashout: false
        });
        
        return { success: true, betId: betRef.id, potentialWin };
        
    } catch (e) {
        console.error('Bet error:', e);
        return { success: false, error: e.message };
    }
}

// ===== ACCUMULATOR BET =====
async function placeAccumulatorBet(selections, totalAmount) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    if (selections.length < 2) return { success: false, error: 'Min 2 selections for accumulator' };
    
    const db = firebase.firestore();
    
    try {
        // Calculate total odds
        let totalOdds = 1;
        const matchDetails = [];
        
        for (const sel of selections) {
            const matchDoc = await db.collection('sports_matches').doc(sel.fixtureId.toString()).get();
            if (!matchDoc.exists) return { success: false, error: 'Match not found' };
            
            const match = matchDoc.data();
            if (match.status !== 'upcoming') return { success: false, error: `${match.homeTeam.name} betting closed` };
            
            const odds = match.odds?.[sel.betType] || 2.00;
            totalOdds *= odds;
            matchDetails.push({ ...sel, matchName: `${match.homeTeam.name} vs ${match.awayTeam.name}`, odds });
        }
        
        const potentialWin = totalAmount * totalOdds;
        
        // Check balance
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletDoc = await walletRef.get();
        const balance = walletDoc.data()?.balance || 0;
        
        if (balance < totalAmount) return { success: false, error: 'Insufficient balance' };
        
        // Deduct
        await walletRef.update({
            balance: balance - totalAmount,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Save accumulator bet
        const betRef = await db.collection('bets').add({
            userId: user.uid,
            userEmail: user.email,
            amount: totalAmount,
            totalOdds,
            potentialWin,
            selections: matchDetails,
            status: 'active',
            betCategory: 'accumulator',
            placedAt: firebase.firestore.FieldValue.serverTimestamp(),
            canCancel: true,
            canCashout: false
        });
        
        return { success: true, betId: betRef.id, totalOdds, potentialWin };
        
    } catch (e) {
        console.error('Accumulator error:', e);
        return { success: false, error: e.message };
    }
}

// ===== CANCEL BET (with fee) =====
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
        if (!bet.canCancel) return { success: false, error: 'Cannot cancel - match started' };
        
        // Check match status
        if (bet.betCategory === 'single') {
            const matchDoc = await db.collection('sports_matches').doc(bet.fixtureId.toString()).get();
            if (matchDoc.exists && matchDoc.data().status !== 'upcoming') {
                return { success: false, error: 'Match already started' };
            }
        }
        
        const fee = bet.amount * BETTING_CONFIG.cancelFee;
        const refundAmount = bet.amount - fee;
        
        // Refund
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletDoc = await walletRef.get();
        
        await walletRef.update({
            balance: walletDoc.data().balance + refundAmount,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await walletRef.collection('transactions').add({
            type: 'cancel_refund',
            amount: refundAmount,
            fee: fee,
            description: `Cancelled bet refund (${(BETTING_CONFIG.cancelFee * 100)}% fee)`,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await betRef.update({
            status: 'cancelled',
            cancelFee: fee,
            refundAmount: refundAmount,
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, refund: refundAmount, fee };
        
    } catch (e) {
        console.error('Cancel error:', e);
        return { success: false, error: e.message };
    }
}

// ===== CASHOUT (during live match) =====
async function cashoutBet(betId) {
    const user = firebase.auth().currentUser;
    if (!user) return { success: false, error: 'Login required' };
    
    const db = firebase.firestore();
    
    try {
        const betRef = db.collection('bets').doc(betId);
        const betDoc = await betRef.get();
        if (!betDoc.exists) return { success: false, error: 'Bet not found' };
        
        const bet = betDoc.data();
        if (!bet.canCashout) return { success: false, error: 'Cashout not available' };
        
        // Calculate cashout value (simplified - 70% of potential win minus fee)
        const cashoutBase = bet.potentialWin * 0.7;
        const fee = cashoutBase * BETTING_CONFIG.cashoutFee;
        const cashoutAmount = cashoutBase - fee;
        
        // Credit user
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletDoc = await walletRef.get();
        
        await walletRef.update({
            balance: walletDoc.data().balance + cashoutAmount,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await betRef.update({
            status: 'cashed_out',
            cashoutAmount,
            cashoutFee: fee,
            cashedOutAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, amount: cashoutAmount, fee };
        
    } catch (e) {
        console.error('Cashout error:', e);
        return { success: false, error: e.message };
    }
}

// ===== SETTLE BETS (called automatically) =====
async function settleBetsForMatch(fixtureId, matchResult) {
    const db = firebase.firestore();
    
    try {
        // Settle single bets
        const singleBets = await db.collection('bets')
            .where('fixtureId', '==', fixtureId)
            .where('status', '==', 'active')
            .where('betCategory', '==', 'single')
            .get();
        
        for (const doc of singleBets.docs) {
            const bet = doc.data();
            const won = bet.betType === matchResult;
            
            if (won) {
                const walletRef = db.collection('wallets').doc(bet.userId);
                const walletDoc = await walletRef.get();
                
                await walletRef.update({
                    balance: walletDoc.data().balance + bet.potentialWin,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                await doc.ref.update({ status: 'won', payout: bet.potentialWin });
            } else {
                await doc.ref.update({ status: 'lost', payout: 0 });
            }
        }
        
        // Update accumulator bets containing this match
        const accBets = await db.collection('bets')
            .where('status', '==', 'active')
            .where('betCategory', '==', 'accumulator')
            .get();
        
        for (const doc of accBets.docs) {
            const bet = doc.data();
            const selection = bet.selections?.find(s => s.fixtureId === fixtureId);
            
            if (selection) {
                const won = selection.betType === matchResult;
                if (!won) {
                    // One leg lost = entire accumulator lost
                    await doc.ref.update({ status: 'lost', payout: 0 });
                } else {
                    // Check if all legs are won
                    let allWon = true;
                    for (const sel of bet.selections) {
                        if (sel.fixtureId === fixtureId) continue;
                        const m = await db.collection('sports_matches').doc(sel.fixtureId.toString()).get();
                        if (!m.exists || m.data().result !== sel.betType) {
                            allWon = false;
                            break;
                        }
                    }
                    
                    if (allWon) {
                        const walletRef = db.collection('wallets').doc(bet.userId);
                        const walletDoc = await walletRef.get();
                        
                        await walletRef.update({
                            balance: walletDoc.data().balance + bet.potentialWin,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        
                        await doc.ref.update({ status: 'won', payout: bet.potentialWin });
                    }
                }
            }
        }
        
        console.log(`✅ Settled bets for fixture ${fixtureId}`);
        return { success: true };
        
    } catch (e) {
        console.error('Settle error:', e);
        return { success: false, error: e.message };
    }
}

// ===== UPDATE CASHOUT AVAILABILITY =====
async function updateCashoutAvailability() {
    const db = firebase.firestore();
    
    try {
        const activeBets = await db.collection('bets')
            .where('status', '==', 'active')
            .get();
        
        for (const doc of activeBets.docs) {
            const bet = doc.data();
            let canCashout = false;
            
            if (bet.betCategory === 'single') {
                const match = await db.collection('sports_matches').doc(bet.fixtureId.toString()).get();
                if (match.exists && match.data().status === 'live') {
                    canCashout = true;
                }
            }
            
            if (bet.canCashout !== canCashout) {
                await doc.ref.update({ canCashout, canCancel: false });
            }
        }
    } catch (e) {
        console.error('Cashout update error:', e);
    }
}

// Run cashout update every 10 seconds
setInterval(updateCashoutAvailability, 10000);

// Global access
window.placeSingleBet = placeSingleBet;
window.placeAccumulatorBet = placeAccumulatorBet;
window.cancelBetWithFee = cancelBetWithFee;
window.cashoutBet = cashoutBet;
window.settleBetsForMatch = settleBetsForMatch;
window.placeBet = placeSingleBet; // Backward compatibility

console.log('✅ Betting Engine v3.0 | Single, Accumulator, Cashout, Fees');
