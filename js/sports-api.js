// ============================================
// SPORTMONKS API INTEGRATION - X Lodon Betting
// Uses YOUR Render backend at millioner.onrender.com
// ============================================

// Your Render backend URL (already deployed and working)
const RENDER_BACKEND = 'https://millioner.onrender.com';

// ===== FETCH FROM YOUR RENDER BACKEND =====
async function fetchFromBackend(endpoint) {
    const url = `${RENDER_BACKEND}${endpoint}`;
    
    console.log(`🔄 Fetching: ${endpoint}`);
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`✅ Success: ${endpoint}`);
        return data;
        
    } catch (error) {
        console.error(`❌ Failed to fetch ${endpoint}:`, error.message);
        return null;
    }
}

// ===== FETCH FUNCTIONS =====
async function fetchLiveMatches() {
    return await fetchFromBackend('/api/livescores');
}

async function fetchUpcomingFixtures() {
    const today = new Date().toISOString().split('T')[0];
    return await fetchFromBackend(`/api/fixtures/date/${today}`);
}

async function fetchFixturesByDate(date) {
    return await fetchFromBackend(`/api/fixtures/date/${date}`);
}

// ===== TEST CONNECTION =====
async function testAPIConnection() {
    console.log('🔍 Testing connection to Render backend...');
    
    const data = await fetchFromBackend('/api/test');
    
    if (data && data.success) {
        console.log(`✅ BACKEND CONNECTED! ${data.message}`);
        console.log(`📊 Live matches: ${data.liveMatchesCount}`);
        return true;
    } else {
        console.error('❌ Backend connection failed');
        return false;
    }
}

// ===== SYNC TO FIRESTORE =====
function getMatchStatus(match) {
    const stateId = match.state_id;
    
    if (stateId === 1) return 'upcoming';
    if (stateId === 2 || stateId === 3 || stateId === 4) return 'live';
    if (stateId === 5 || stateId === 90 || stateId === 100) return 'finished';
    if (stateId === 8) return 'cancelled';
    if (stateId === 9) return 'postponed';
    
    const now = new Date();
    const startTime = new Date(match.starting_at);
    
    if (now < startTime) return 'upcoming';
    return 'live';
}

function getMatchResult(match) {
    if (!match.scores || match.scores.length < 2) return null;
    
    const homeScore = match.scores[0]?.score?.goals || 0;
    const awayScore = match.scores[1]?.score?.goals || 0;
    
    const stateId = match.state_id;
    if (stateId === 5 || stateId === 90 || stateId === 100) {
        if (homeScore > awayScore) return 'home';
        if (homeScore < awayScore) return 'away';
        if (homeScore === awayScore) return 'draw';
    }
    
    return null;
}

function calculateOdds(homeName, awayName) {
    const hash = (homeName + awayName).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    
    return {
        home: Math.round((1.80 + (hash % 20) / 100) * 100) / 100,
        draw: Math.round((3.20 + (hash % 15) / 100) * 100) / 100,
        away: Math.round((2.80 + (hash % 25) / 100) * 100) / 100
    };
}

async function syncMatchToFirestore(match) {
    if (!firebase || !firebase.firestore) {
        console.error('❌ Firebase not initialized');
        return false;
    }
    
    const db = firebase.firestore();
    const fixtureId = match.id;
    
    const participants = match.participants || [];
    const homeTeam = participants.find(p => p.meta?.location === 'home') || participants[0];
    const awayTeam = participants.find(p => p.meta?.location === 'away') || participants[1];
    
    if (!homeTeam || !awayTeam) {
        console.warn(`⚠️ Skipping match ${fixtureId}: missing team data`);
        return false;
    }
    
    const status = getMatchStatus(match);
    const result = getMatchResult(match);
    const odds = calculateOdds(homeTeam.name, awayTeam.name);
    
    let expiresAt = null;
    if (status === 'finished') {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
    }
    
    const matchData = {
        fixtureId: fixtureId,
        leagueId: match.league_id || 0,
        leagueName: match.league?.name || 'Unknown League',
        homeTeam: {
            id: homeTeam.id || 0,
            name: homeTeam.name || 'Home Team',
            logo: homeTeam.image_path || ''
        },
        awayTeam: {
            id: awayTeam.id || 0,
            name: awayTeam.name || 'Away Team',
            logo: awayTeam.image_path || ''
        },
        startTime: match.starting_at ? new Date(match.starting_at) : new Date(),
        status: status,
        score: {
            home: match.scores?.[0]?.score?.goals || 0,
            away: match.scores?.[1]?.score?.goals || 0
        },
        odds: odds,
        result: result,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        expiresAt: expiresAt
    };
    
    try {
        await db.collection('sports_matches').doc(fixtureId.toString()).set(matchData, { merge: true });
        console.log(`📝 Synced: ${homeTeam.name} vs ${awayTeam.name} (${status})`);
        return true;
    } catch (error) {
        console.error(`❌ Error syncing match ${fixtureId}:`, error);
        return false;
    }
}

// ===== SYNC ALL MATCHES =====
async function syncAllLiveMatches() {
    const data = await fetchLiveMatches();
    
    if (!data || !data.data || data.data.length === 0) {
        console.log('ℹ️ No live matches found');
        return 0;
    }
    
    console.log(`🎯 Found ${data.data.length} live matches`);
    
    let synced = 0;
    for (const match of data.data) {
        const success = await syncMatchToFirestore(match);
        if (success) synced++;
    }
    
    return synced;
}

async function syncAllUpcomingMatches() {
    const data = await fetchUpcomingFixtures();
    
    if (!data || !data.data || data.data.length === 0) {
        console.log('ℹ️ No upcoming matches found');
        return 0;
    }
    
    console.log(`📅 Found ${data.data.length} upcoming matches`);
    
    let synced = 0;
    for (const match of data.data) {
        const success = await syncMatchToFirestore(match);
        if (success) synced++;
    }
    
    return synced;
}

async function syncAllMatches() {
    console.log('🚀 Starting SportMonks sync via Render backend...');
    
    const liveCount = await syncAllLiveMatches();
    const upcomingCount = await syncAllUpcomingMatches();
    
    console.log(`✅ Sync complete: ${liveCount} live, ${upcomingCount} upcoming`);
    
    return { live: liveCount, upcoming: upcomingCount };
}

// ===== AUTO SYNC =====
let syncInterval = null;

function startAutoSync(intervalSeconds = 30) {
    if (syncInterval) clearInterval(syncInterval);
    
    testAPIConnection().then((connected) => {
        if (connected) syncAllMatches();
    });
    
    syncInterval = setInterval(() => {
        console.log('⏰ Auto-sync running...');
        syncAllMatches();
    }, intervalSeconds * 1000);
    
    console.log(`⏰ Auto-sync started (every ${intervalSeconds}s)`);
}

// ===== EXPOSE TO CONSOLE =====
window.syncNow = syncAllMatches;
window.testAPI = testAPIConnection;

// ===== AUTO-START =====
if (document.readyState === 'complete') {
    startAutoSync(30);
} else {
    window.addEventListener('load', () => startAutoSync(30));
}

console.log('🏈 SportMonks API loaded - Using Render Backend');
console.log(`📡 Backend: ${RENDER_BACKEND}`);
console.log('💡 Commands: testAPI(), syncNow()');
