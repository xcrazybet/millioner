// ============================================
// X LODON SPORTS API - PRODUCTION v5.0
// Live updates every 5 seconds
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';

// ===== FETCH WITH RETRY =====
async function fetchFromBackend(endpoint, retries = 3) {
    const url = `${BACKEND_URL}${endpoint}`;
    
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return data;
        } catch (error) {
            if (i === retries - 1) {
                console.error(`❌ ${endpoint}:`, error.message);
                return null;
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

// ===== FETCH FUNCTIONS =====
async function fetchLiveMatches() {
    return await fetchFromBackend('/api/livescores');
}

async function fetchFixturesBetween(fromDate, toDate) {
    return await fetchFromBackend(`/api/fixtures/between/${fromDate}/${toDate}`);
}

async function fetchFixtureById(fixtureId) {
    return await fetchFromBackend(`/api/fixtures/${fixtureId}`);
}

// ===== FETCH NEXT 7 DAYS =====
async function fetchUpcomingWeek() {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    const from = today.toISOString().split('T')[0];
    const to = nextWeek.toISOString().split('T')[0];
    
    return await fetchFixturesBetween(from, to);
}

// ===== STATUS HELPERS =====
function getMatchStatus(match) {
    const stateId = match.state_id;
    if (stateId === 1) return 'upcoming';
    if ([2, 3, 4].includes(stateId)) return 'live';
    if ([5, 90, 100].includes(stateId)) return 'finished';
    if (stateId === 8) return 'cancelled';
    if (stateId === 9) return 'postponed';
    
    const now = new Date();
    const start = new Date(match.starting_at);
    if (now < start) return 'upcoming';
    if (now > start && now < new Date(start.getTime() + 3 * 60 * 60 * 1000)) return 'live';
    return 'finished';
}

function getMatchResult(match) {
    const scores = match.scores || [];
    if (scores.length < 2) return null;
    
    const home = scores[0]?.score?.goals || 0;
    const away = scores[1]?.score?.goals || 0;
    const stateId = match.state_id;
    
    if ([5, 90, 100].includes(stateId)) {
        if (home > away) return 'home';
        if (home < away) return 'away';
        return 'draw';
    }
    return null;
}

function calculateOdds(homeName, awayName) {
    const hash = (homeName + awayName).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return {
        home: +(1.80 + (hash % 20) / 100).toFixed(2),
        draw: +(3.20 + (hash % 15) / 100).toFixed(2),
        away: +(2.80 + (hash % 25) / 100).toFixed(2)
    };
}

// ===== SYNC TO FIRESTORE =====
async function syncMatchToFirestore(match) {
    if (!firebase?.firestore) return false;
    
    const db = firebase.firestore();
    const fixtureId = match.id;
    
    const participants = match.participants || [];
    const homeTeam = participants.find(p => p.meta?.location === 'home') || participants[0];
    const awayTeam = participants.find(p => p.meta?.location === 'away') || participants[1];
    
    if (!homeTeam || !awayTeam) return false;
    
    const status = getMatchStatus(match);
    const result = getMatchResult(match);
    const odds = calculateOdds(homeTeam.name, awayTeam.name);
    
    let expiresAt = null;
    if (status === 'finished') {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
    }
    
    const matchData = {
        fixtureId, status, result, odds, expiresAt,
        leagueId: match.league_id || 0,
        leagueName: match.league?.name || 'Unknown League',
        homeTeam: { id: homeTeam.id || 0, name: homeTeam.name || 'Home', logo: homeTeam.image_path || '' },
        awayTeam: { id: awayTeam.id || 0, name: awayTeam.name || 'Away', logo: awayTeam.image_path || '' },
        startTime: match.starting_at ? new Date(match.starting_at) : new Date(),
        score: { home: match.scores?.[0]?.score?.goals || 0, away: match.scores?.[1]?.score?.goals || 0 },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        isRealData: true
    };
    
    try {
        await db.collection('sports_matches').doc(fixtureId.toString()).set(matchData, { merge: true });
        return true;
    } catch (e) {
        console.error(`Sync error ${fixtureId}:`, e);
        return false;
    }
}

// ===== AUTO-SETTLE FINISHED MATCHES =====
async function settleFinishedMatches() {
    if (!firebase?.firestore) return;
    
    const db = firebase.firestore();
    const now = new Date();
    
    try {
        const finishedMatches = await db.collection('sports_matches')
            .where('status', '==', 'finished')
            .where('result', '!=', null)
            .get();
        
        for (const doc of finishedMatches.docs) {
            const match = doc.data();
            
            // Check if bets already settled
            const settledCheck = await db.collection('bets')
                .where('fixtureId', '==', match.fixtureId)
                .where('status', '==', 'active')
                .get();
            
            if (!settledCheck.empty) {
                console.log(`💰 Settling bets for ${match.homeTeam.name} vs ${match.awayTeam.name}`);
                if (typeof settleBetsForMatch === 'function') {
                    await settleBetsForMatch(match.fixtureId, match.result);
                }
            }
        }
    } catch (e) {
        console.error('Settle error:', e);
    }
}

// ===== SYNC ALL =====
async function syncLiveMatches() {
    const data = await fetchLiveMatches();
    if (!data?.data) return 0;
    
    let synced = 0;
    for (const m of data.data) if (await syncMatchToFirestore(m)) synced++;
    return synced;
}

async function syncUpcomingWeekMatches() {
    const data = await fetchUpcomingWeek();
    if (!data?.data) return 0;
    
    let synced = 0;
    for (const m of data.data) if (await syncMatchToFirestore(m)) synced++;
    return synced;
}

async function syncAllMatches() {
    console.log('🚀 Syncing...');
    const live = await syncLiveMatches();
    const upcoming = await syncUpcomingWeekMatches();
    await settleFinishedMatches();
    console.log(`✅ Live: ${live}, Upcoming: ${upcoming}`);
    return { live, upcoming };
}

// ===== LIVE UPDATE LOOP (5 seconds) =====
let liveUpdateInterval = null;

function startLiveUpdates() {
    if (liveUpdateInterval) clearInterval(liveUpdateInterval);
    
    syncAllMatches();
    liveUpdateInterval = setInterval(async () => {
        await syncLiveMatches();
        await settleFinishedMatches();
    }, 5000); // Every 5 seconds
    
    console.log('⚡ Live updates every 5 seconds');
}

// ===== EXPORT =====
window.syncNow = syncAllMatches;

if (document.readyState === 'complete') startLiveUpdates();
else window.addEventListener('load', startLiveUpdates);

console.log('🏈 Sports API v5.0 | Live updates: 5s');
