// ============================================
// js/sports-api.js - COMPLETE REWRITE v12.0
// X Lodon Sports - API-Football Integration
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';

// ===== FETCH FROM BACKEND =====
async function fetchFromBackend(endpoint) {
    try {
        const url = `${BACKEND_URL}${endpoint}`;
        console.log(`🔄 Fetching: ${endpoint}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log(`✅ ${endpoint}:`, data.success, `Count: ${data.count || data.data?.length || 0}`);
        return data;
    } catch (error) {
        console.error(`❌ ${endpoint}:`, error.message);
        return { success: false, data: [] };
    }
}

// ===== FETCH FUNCTIONS =====
async function fetchLiveMatches() {
    return await fetchFromBackend('/api/livescores');
}

async function fetchUpcomingWeek() {
    return await fetchFromBackend('/api/fixtures/week');
}

async function fetchTodayMatches() {
    return await fetchFromBackend('/api/fixtures/today');
}

async function fetchLeagues() {
    return await fetchFromBackend('/api/leagues');
}

// ===== STATUS MAPPING (API-Football) =====
function getMatchStatus(match) {
    const status = match.fixture?.status?.short;
    
    // Upcoming
    if (status === 'TBD' || status === 'NS') return 'upcoming';
    
    // Live
    if (status === '1H' || status === 'HT' || status === '2H' || 
        status === 'ET' || status === 'P' || status === 'LIVE') return 'live';
    
    // Finished
    if (status === 'FT' || status === 'AET' || status === 'PEN') return 'finished';
    
    // Cancelled/Postponed
    if (status === 'CANC') return 'cancelled';
    if (status === 'PST') return 'postponed';
    if (status === 'SUSP') return 'suspended';
    if (status === 'INT') return 'interrupted';
    if (status === 'ABD') return 'abandoned';
    
    // Fallback: check by time
    const now = new Date();
    const start = new Date(match.fixture?.date);
    if (now < start) return 'upcoming';
    if (now > start && now < new Date(start.getTime() + 3 * 60 * 60 * 1000)) return 'live';
    return 'finished';
}

function getMatchResult(match) {
    const goals = match.goals;
    if (!goals) return null;
    
    const home = goals.home || 0;
    const away = goals.away || 0;
    const status = match.fixture?.status?.short;
    
    if (status === 'FT' || status === 'AET' || status === 'PEN') {
        if (home > away) return 'home';
        if (home < away) return 'away';
        return 'draw';
    }
    return null;
}

function calculateOdds(homeName, awayName) {
    // Generate consistent odds based on team names
    const hash = (homeName + awayName).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return {
        home: +(1.80 + (hash % 20) / 100).toFixed(2),
        draw: +(3.20 + (hash % 15) / 100).toFixed(2),
        away: +(2.80 + (hash % 25) / 100).toFixed(2)
    };
}

// ===== CLEANUP OLD MATCHES =====
async function cleanupOldMatches() {
    if (!firebase?.firestore) return 0;
    
    const db = firebase.firestore();
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    let deleted = 0;
    
    try {
        const snapshot = await db.collection('sports_matches').get();
        const toDelete = [];
        
        snapshot.forEach(doc => {
            const m = doc.data();
            
            // Delete sample/placeholder matches
            if (m.fixtureId >= 1000000) {
                toDelete.push(doc.ref);
                return;
            }
            
            // Delete matches with placeholder teams
            if (m.homeTeam?.name === 'Home' || m.awayTeam?.name === 'Away') {
                toDelete.push(doc.ref);
                return;
            }
            
            // Delete old upcoming matches (past + 6 hours)
            if (m.status === 'upcoming') {
                const matchTime = m.startTime?.toDate();
                if (matchTime && matchTime < sixHoursAgo) {
                    toDelete.push(doc.ref);
                }
            }
        });
        
        if (toDelete.length > 0) {
            const batch = db.batch();
            toDelete.forEach(ref => batch.delete(ref));
            await batch.commit();
            deleted = toDelete.length;
            console.log(`🧹 Deleted ${deleted} old/sample matches`);
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
    
    return deleted;
}

// ===== SYNC MATCH TO FIRESTORE =====
async function syncMatchToFirestore(match) {
    if (!firebase?.firestore) return false;
    
    const db = firebase.firestore();
    const fixture = match.fixture;
    const teams = match.teams;
    const goals = match.goals;
    const league = match.league;
    
    const fixtureId = fixture?.id;
    if (!fixtureId) return false;
    if (fixtureId >= 1000000) return false; // Skip samples
    if (!teams?.home || !teams?.away) return false;
    
    const status = getMatchStatus(match);
    const result = getMatchResult(match);
    const odds = calculateOdds(teams.home.name, teams.away.name);
    
    let expiresAt = null;
    if (status === 'finished') {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
    }
    
    const matchData = {
        fixtureId: fixtureId,
        status: status,
        result: result,
        odds: odds,
        expiresAt: expiresAt,
        leagueId: league?.id || 0,
        leagueName: league?.name || 'Unknown League',
        homeTeam: {
            id: teams.home.id || 0,
            name: teams.home.name,
            logo: teams.home.logo || ''
        },
        awayTeam: {
            id: teams.away.id || 0,
            name: teams.away.name,
            logo: teams.away.logo || ''
        },
        startTime: fixture.date ? new Date(fixture.date) : new Date(),
        score: {
            home: goals?.home || 0,
            away: goals?.away || 0
        },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        isRealData: true,
        apiProvider: 'api-football'
    };
    
    try {
        await db.collection('sports_matches').doc(fixtureId.toString()).set(matchData, { merge: true });
        console.log(`📝 ${teams.home.name} vs ${teams.away.name} (${status})`);
        return true;
    } catch (error) {
        console.error(`Sync error ${fixtureId}:`, error);
        return false;
    }
}

// ===== AUTO-SETTLE FINISHED MATCHES =====
async function settleFinishedMatches() {
    if (!firebase?.firestore) return 0;
    
    const db = firebase.firestore();
    let settled = 0;
    
    try {
        const finishedMatches = await db.collection('sports_matches')
            .where('status', '==', 'finished')
            .get();
        
        for (const doc of finishedMatches.docs) {
            const match = doc.data();
            
            // Skip if already settled
            if (match.betsSettled) continue;
            
            // Determine result
            let result = match.result;
            if (!result) {
                const homeScore = match.score?.home || 0;
                const awayScore = match.score?.away || 0;
                if (homeScore > awayScore) result = 'home';
                else if (homeScore < awayScore) result = 'away';
                else result = 'draw';
            }
            
            // Find active bets for this match
            const activeBets = await db.collection('bets')
                .where('fixtureId', '==', match.fixtureId)
                .where('status', '==', 'active')
                .get();
            
            if (!activeBets.empty) {
                console.log(`💰 Settling ${activeBets.size} bets for ${match.homeTeam?.name} vs ${match.awayTeam?.name}`);
                
                if (typeof settleBetsForMatch === 'function') {
                    await settleBetsForMatch(match.fixtureId, result);
                }
                settled += activeBets.size;
            }
            
            // Mark as settled
            await doc.ref.update({
                result: result,
                betsSettled: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Check accumulator bets
        const activeAccBets = await db.collection('bets')
            .where('status', '==', 'active')
            .where('betCategory', '==', 'accumulator')
            .get();
        
        for (const doc of activeAccBets.docs) {
            const bet = doc.data();
            let allFinished = true;
            let allWon = true;
            
            for (const sel of bet.selections || []) {
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
                    await walletRef.update({
                        balance: (walletDoc.data().balance || 0) + bet.potentialWin,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    await doc.ref.update({ status: 'won', payout: bet.potentialWin });
                } else {
                    await doc.ref.update({ status: 'lost', payout: 0 });
                }
                settled++;
            }
        }
        
    } catch (error) {
        console.error('Settlement error:', error);
    }
    
    return settled;
}

// ===== SYNC ALL MATCHES =====
async function syncLiveMatches() {
    const data = await fetchLiveMatches();
    if (!data?.success || !data.data) return 0;
    
    console.log(`🎯 Processing ${data.data.length} live matches`);
    let synced = 0;
    for (const m of data.data) {
        if (await syncMatchToFirestore(m)) synced++;
    }
    return synced;
}

async function syncUpcomingWeekMatches() {
    const data = await fetchUpcomingWeek();
    if (!data?.success || !data.data) return 0;
    
    console.log(`📅 Processing ${data.data.length} upcoming matches`);
    let synced = 0;
    for (const m of data.data) {
        if (await syncMatchToFirestore(m)) synced++;
    }
    return synced;
}

async function syncAllMatches() {
    console.log('🚀 Starting full sync...');
    
    // Clean old matches first
    await cleanupOldMatches();
    
    // Sync live and upcoming
    const live = await syncLiveMatches();
    const upcoming = await syncUpcomingWeekMatches();
    
    // Settle finished matches
    const settled = await settleFinishedMatches();
    
    console.log(`✅ Sync complete: ${live} live, ${upcoming} upcoming, ${settled} bets settled`);
    return { live, upcoming, settled };
}

// ===== AUTO SYNC =====
let syncInterval = null;

function startAutoSync(seconds = 30) {
    if (syncInterval) clearInterval(syncInterval);
    
    // Run immediately
    syncAllMatches();
    
    // Then run periodically
    syncInterval = setInterval(() => syncAllMatches(), seconds * 1000);
    console.log(`⏰ Auto-sync started (every ${seconds}s)`);
}

function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('⏸️ Auto-sync stopped');
    }
}

// ===== TEST FUNCTION =====
async function testConnection() {
    console.log('🔍 Testing API connection...');
    const result = await fetchFromBackend('/api/debug');
    console.log('Debug result:', result);
    return result;
}

// ===== EXPORT TO WINDOW =====
window.syncNow = syncAllMatches;
window.testAPI = testConnection;
window.cleanupNow = cleanupOldMatches;
window.settleNow = settleFinishedMatches;

// ===== AUTO-START =====
if (document.readyState === 'complete') {
    startAutoSync(30);
} else {
    window.addEventListener('load', () => startAutoSync(30));
}

console.log('🏈 Sports API v12.0 Loaded | API-Football | Auto-sync: 30s');
console.log('💡 Commands: syncNow(), testAPI(), cleanupNow(), settleNow()');
