// ============================================
// X LODON SPORTS API - COMPLETE
// Fetches from Render backend
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';

// ===== FETCH FROM BACKEND =====
async function fetchFromBackend(endpoint) {
    const url = `${BACKEND_URL}${endpoint}`;
    console.log(`🔄 Fetching: ${endpoint}`);
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log(`✅ Success: ${endpoint}`);
        return data;
    } catch (error) {
        console.error(`❌ Failed: ${endpoint}`, error.message);
        return null;
    }
}

// ===== FETCH FUNCTIONS =====
async function fetchLiveMatches() {
    return await fetchFromBackend('/api/livescores');
}

async function fetchInPlayMatches() {
    return await fetchFromBackend('/api/livescores/inplay');
}

async function fetchFixturesByDate(date) {
    return await fetchFromBackend(`/api/fixtures/date/${date}`);
}

async function fetchFixturesBetween(fromDate, toDate) {
    return await fetchFromBackend(`/api/fixtures/between/${fromDate}/${toDate}`);
}

async function fetchFixtureById(fixtureId) {
    return await fetchFromBackend(`/api/fixtures/${fixtureId}`);
}

// ===== FETCH 7 DAYS UPCOMING =====
async function fetchUpcomingWeek() {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    const from = today.toISOString().split('T')[0];
    const to = nextWeek.toISOString().split('T')[0];
    
    return await fetchFixturesBetween(from, to);
}

// ===== TEST CONNECTION =====
async function testAPIConnection() {
    console.log('🔍 Testing backend...');
    const data = await fetchFromBackend('/api/test');
    
    if (data && data.success) {
        console.log(`✅ BACKEND ONLINE! Live matches: ${data.liveMatchesCount}`);
        return true;
    } else {
        console.error('❌ Backend offline');
        return false;
    }
}

// ===== SYNC HELPERS =====
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
    return 'live';
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
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await db.collection('sports_matches').doc(fixtureId.toString()).set(matchData, { merge: true });
        console.log(`📝 ${homeTeam.name} vs ${awayTeam.name} (${status})`);
        return true;
    } catch (e) {
        console.error(`Sync error ${fixtureId}:`, e);
        return false;
    }
}

// ===== SYNC ALL =====
async function syncLiveMatches() {
    const data = await fetchLiveMatches();
    if (!data?.data) return 0;
    
    console.log(`🎯 ${data.data.length} live matches`);
    let synced = 0;
    for (const m of data.data) if (await syncMatchToFirestore(m)) synced++;
    return synced;
}

async function syncUpcomingWeekMatches() {
    const data = await fetchUpcomingWeek();
    if (!data?.data) return 0;
    
    console.log(`📅 ${data.data.length} upcoming matches (7 days)`);
    let synced = 0;
    for (const m of data.data) if (await syncMatchToFirestore(m)) synced++;
    return synced;
}

async function syncAllMatches() {
    console.log('🚀 Starting sync...');
    const live = await syncLiveMatches();
    const upcoming = await syncUpcomingWeekMatches();
    console.log(`✅ Done: ${live} live, ${upcoming} upcoming`);
    return { live, upcoming };
}

// ===== AUTO SYNC =====
let syncInterval = null;

function startAutoSync(seconds = 30) {
    if (syncInterval) clearInterval(syncInterval);
    
    testAPIConnection().then(ok => { if (ok) syncAllMatches(); });
    
    syncInterval = setInterval(() => syncAllMatches(), seconds * 1000);
    console.log(`⏰ Auto-sync every ${seconds}s`);
}

// Global
window.syncNow = syncAllMatches;
window.testAPI = testAPIConnection;

if (document.readyState === 'complete') startAutoSync(30);
else window.addEventListener('load', () => startAutoSync(30));

console.log('🏈 Sports API v2.0 loaded | Backend:', BACKEND_URL);
