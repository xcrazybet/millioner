// ============================================
// js/sports-api.js - COMPLETE v15.0
// Auto-settlement, Cancellation Rules, Live→Finished
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';

// ===== FETCH FROM BACKEND =====
async function fetchFromBackend(endpoint) {
    try {
        const url = `${BACKEND_URL}${endpoint}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`❌ ${endpoint}:`, error.message);
        return { success: false, data: [] };
    }
}

async function fetchLiveMatches() { return await fetchFromBackend('/api/livescores'); }
async function fetchUpcomingWeek() { return await fetchFromBackend('/api/fixtures/week'); }

// ===== STATUS MAPPING =====
function getMatchStatus(match) {
    const status = match.fixture?.status?.short;
    if (!status || status === 'TBD' || status === 'NS') return 'upcoming';
    if (['1H','HT','2H','ET','P','LIVE'].includes(status)) return 'live';
    if (['FT','AET','PEN'].includes(status)) return 'finished';
    if (status === 'CANC') return 'cancelled';
    if (status === 'PST') return 'postponed';
    return 'upcoming';
}

function calculateOdds(home, away) {
    const hash = (home + away).split('').reduce((a,b) => a + b.charCodeAt(0), 0);
    return {
        home: +(1.80 + (hash % 20) / 100).toFixed(2),
        draw: +(3.20 + (hash % 15) / 100).toFixed(2),
        away: +(2.80 + (hash % 25) / 100).toFixed(2)
    };
}

// ===== BET CANCELLATION RULES (Global Standard) =====
window.BET_CANCELLATION_RULES = {
    // Returns fee percentage based on minutes until kickoff
    getCancelFee: (matchStartTime) => {
        const now = new Date();
        const kickoff = matchStartTime.toDate();
        const minutesUntil = Math.floor((kickoff - now) / 60000);
        
        if (minutesUntil < 0) return 100; // Match started - no cancellation
        if (minutesUntil < 5) return 50;  // 50% fee
        if (minutesUntil < 60) return 20; // 20% fee
        return 5; // 5% fee
    },
    
    canCancel: (matchStartTime) => {
        const now = new Date();
        const kickoff = matchStartTime.toDate();
        return now < kickoff; // Only before match starts
    },
    
    getCashoutFee: (currentMinute) => {
        if (currentMinute < 15) return 15;
        if (currentMinute < 30) return 20;
        if (currentMinute < 60) return 25;
        if (currentMinute < 80) return 30;
        return 35;
    }
};

// ===== SYNC MATCH TO FIRESTORE =====
async function syncMatchToFirestore(match) {
    if (!firebase?.firestore) return false;
    
    const db = firebase.firestore();
    const f = match.fixture || {};
    const t = match.teams || {};
    const g = match.goals || {};
    const l = match.league || {};
    
    const id = f.id;
    if (!id) return false;
    
    const home = t.home || {};
    const away = t.away || {};
    if (!home.name || !away.name) return false;
    
    const status = getMatchStatus(match);
    const odds = calculateOdds(home.name, away.name);
    
    let result = null;
    if (status === 'finished') {
        const hg = g.home || 0, ag = g.away || 0;
        result = hg > ag ? 'home' : hg < ag ? 'away' : 'draw';
    }
    
    const data = {
        fixtureId: id, status, result, odds,
        leagueId: l.id || 0, leagueName: l.name || 'Unknown League',
        homeTeam: { id: home.id || 0, name: home.name, logo: home.logo || '' },
        awayTeam: { id: away.id || 0, name: away.name, logo: away.logo || '' },
        startTime: f.date ? new Date(f.date) : new Date(),
        score: { home: g.home || 0, away: g.away || 0 },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        expiresAt: status === 'finished' ? new Date(Date.now() + 24*60*60*1000) : null
    };
    
    try {
        await db.collection('sports_matches').doc(id.toString()).set(data, { merge: true });
        
        // If match just became finished, settle bets
        const oldDoc = await db.collection('sports_matches').doc(id.toString()).get();
        const oldStatus = oldDoc.data()?.status;
        if (oldStatus !== 'finished' && status === 'finished') {
            console.log(`🏁 Match finished: ${home.name} vs ${away.name} - Settling bets...`);
            await settleBetsForMatch(id, result);
        }
        
        return true;
    } catch (e) {
        console.error(`❌ ${id}:`, e);
        return false;
    }
}

// ===== SETTLE BETS FOR MATCH =====
async function settleBetsForMatch(fixtureId, result) {
    if (!firebase?.firestore) return 0;
    
    const db = firebase.firestore();
    let settled = 0;
    
    try {
        // Settle single bets
        const singleBets = await db.collection('bets')
            .where('fixtureId', '==', fixtureId)
            .where('status', '==', 'active')
            .where('betCategory', '==', 'single')
            .get();
        
        for (const doc of singleBets.docs) {
            const bet = doc.data();
            const won = bet.betType === result;
            
            if (won) {
                const walletRef = db.collection('wallets').doc(bet.userId);
                const walletDoc = await walletRef.get();
                const newBalance = (walletDoc.data()?.balance || 0) + bet.potentialWin;
                
                await walletRef.update({
                    balance: newBalance,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                await doc.ref.update({
                    status: 'won',
                    result: result,
                    payout: bet.potentialWin,
                    settledAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await doc.ref.update({
                    status: 'lost',
                    result: result,
                    payout: 0,
                    settledAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            settled++;
        }
        
        // Settle accumulator bets containing this match
        const accBets = await db.collection('bets')
            .where('status', '==', 'active')
            .where('betCategory', '==', 'accumulator')
            .get();
        
        for (const doc of accBets.docs) {
            const bet = doc.data();
            const hasThisMatch = bet.selections?.some(s => s.fixtureId === fixtureId);
            if (!hasThisMatch) continue;
            
            // Check if all matches in accumulator are finished
            let allFinished = true;
            let allWon = true;
            
            for (const sel of bet.selections) {
                const m = await db.collection('sports_matches').doc(sel.fixtureId.toString()).get();
                if (!m.exists || m.data().status !== 'finished') {
                    allFinished = false;
                    break;
                }
                if (m.data().result !== sel.betType) {
                    allWon = false;
                }
            }
            
            if (allFinished) {
                if (allWon) {
                    const walletRef = db.collection('wallets').doc(bet.userId);
                    const walletDoc = await walletRef.get();
                    const newBalance = (walletDoc.data()?.balance || 0) + bet.potentialWin;
                    
                    await walletRef.update({
                        balance: newBalance,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    await doc.ref.update({
                        status: 'won',
                        payout: bet.potentialWin,
                        settledAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    await doc.ref.update({
                        status: 'lost',
                        payout: 0,
                        settledAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                settled++;
            }
        }
        
        console.log(`💰 Settled ${settled} bets for fixture ${fixtureId}`);
    } catch (e) {
        console.error('Settlement error:', e);
    }
    
    return settled;
}

// ===== SYNC ALL =====
async function syncAllMatches() {
    console.log('🚀 Syncing...');
    
    const live = await fetchLiveMatches();
    let count = 0;
    if (live?.data) for (const m of live.data) if (await syncMatchToFirestore(m)) count++;
    
    const upcoming = await fetchUpcomingWeek();
    if (upcoming?.data) for (const m of upcoming.data) if (await syncMatchToFirestore(m)) count++;
    
    console.log(`✅ Synced ${count} matches`);
    return count;
}

// ===== AUTO SYNC =====
let syncInterval = null;

function startAutoSync(seconds = 30) {
    if (syncInterval) clearInterval(syncInterval);
    syncAllMatches();
    syncInterval = setInterval(syncAllMatches, seconds * 1000);
    console.log(`⏰ Auto-sync every ${seconds}s`);
}

window.syncNow = syncAllMatches;
window.settleBetsForMatch = settleBetsForMatch;

if (document.readyState === 'complete') startAutoSync(30);
else window.addEventListener('load', () => startAutoSync(30));

console.log('🏈 Sports API v15 - Auto-Settlement Active');
