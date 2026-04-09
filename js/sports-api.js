// ============================================
// SPORTMONKS API INTEGRATION - X Lodon Betting
// Using WORKING token from live system
// ============================================

const SPORTMONKS_CONFIG = {
    token: 'DKFdWG9jFZVh8XSEgLrRfGwcZABwVgsP1vZS5ViRYn86zdPSO148NsV9iwoy',
    baseUrl: 'https://api.sportmonks.com/v3'
};

// ===== FETCH WITH PROXY (copied from working system) =====
async function fetchWithProxy(url) {
    // Method 1: Try codetabs proxy (working in your system)
    try {
        const proxyUrl = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url);
        console.log('🔄 Trying codetabs proxy...');
        
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Proxy fetch succeeded');
        return data;
        
    } catch (error) {
        console.error('❌ Proxy fetch failed:', error.message);
        
        // Fallback: Try direct fetch
        try {
            console.log('🔄 Trying direct fetch...');
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Direct fetch succeeded');
                return data;
            }
        } catch (e) {
            console.error('❌ Direct fetch failed:', e.message);
        }
        
        return null;
    }
}

// ===== FETCH FROM SPORTMONKS =====
async function fetchFromSportMonks(endpoint, params = '') {
    let url = '';
    
    if (endpoint === 'livescores') {
        url = `${SPORTMONKS_CONFIG.baseUrl}/football/livescores?api_token=${SPORTMONKS_CONFIG.token}&include=state;participants;league;scores`;
    } else if (endpoint === 'fixtures') {
        const today = new Date().toISOString().split('T')[0];
        url = `${SPORTMONKS_CONFIG.baseUrl}/football/fixtures/date/${today}?api_token=${SPORTMONKS_CONFIG.token}&include=participants;state;league;scores`;
    } else if (endpoint.startsWith('fixtures/')) {
        const id = endpoint.split('/')[1];
        url = `${SPORTMONKS_CONFIG.baseUrl}/football/fixtures/${id}?api_token=${SPORTMONKS_CONFIG.token}&include=league;participants;scores;odds`;
    } else {
        console.error('❌ Unknown endpoint:', endpoint);
        return null;
    }
    
    console.log(`🔄 Fetching: ${endpoint}`);
    return await fetchWithProxy(url);
}

// ===== FETCH FUNCTIONS =====
async function fetchLiveMatches() {
    return await fetchFromSportMonks('livescores');
}

async function fetchUpcomingFixtures() {
    return await fetchFromSportMonks('fixtures');
}

async function fetchFixtureById(fixtureId) {
    return await fetchFromSportMonks(`fixtures/${fixtureId}`);
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
    if (now > startTime) return 'live';
    
    return 'upcoming';
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

function calculateDefaultOdds(homeName, awayName) {
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
    const odds = calculateDefaultOdds(homeTeam.name, awayTeam.name);
    
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
    
    if (!data || !data.data) {
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
    
    if (!data || !data.data) {
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
    console.log('🚀 Starting SportMonks sync...');
    
    const liveCount = await syncAllLiveMatches();
    const upcomingCount = await syncAllUpcomingMatches();
    
    console.log(`✅ Sync complete: ${liveCount} live, ${upcomingCount} upcoming`);
    
    return { live: liveCount, upcoming: upcomingCount };
}

// ===== SAMPLE DATA =====
async function loadSampleMatches() {
    if (!firebase || !firebase.firestore) return;
    
    const db = firebase.firestore();
    
    const sampleMatches = [
        { fixtureId: 100001, leagueName: 'Premier League', homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Man City' }, startTime: new Date(Date.now() + 3600000), status: 'upcoming', odds: { home: 2.40, draw: 3.30, away: 2.90 }, score: { home: 0, away: 0 } },
        { fixtureId: 100002, leagueName: 'La Liga', homeTeam: { name: 'Barcelona' }, awayTeam: { name: 'Real Madrid' }, startTime: new Date(Date.now() + 7200000), status: 'upcoming', odds: { home: 2.10, draw: 3.50, away: 3.20 }, score: { home: 0, away: 0 } },
        { fixtureId: 100003, leagueName: 'Serie A', homeTeam: { name: 'Juventus' }, awayTeam: { name: 'Inter' }, startTime: new Date(), status: 'live', odds: { home: 2.60, draw: 3.10, away: 2.70 }, score: { home: 1, away: 1 } }
    ];
    
    console.log('📦 Loading sample matches...');
    
    for (const match of sampleMatches) {
        await db.collection('sports_matches').doc(match.fixtureId.toString()).set({
            ...match,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
    
    console.log('✅ Sample matches loaded!');
    return sampleMatches.length;
}

// ===== TEST FUNCTION =====
async function testAPIConnection() {
    console.log('🔍 Testing SportMonks API with working token...');
    
    const data = await fetchLiveMatches();
    
    if (data && data.data) {
        console.log(`✅ API CONNECTED! Found ${data.data.length} live matches.`);
        return true;
    } else {
        console.error('❌ API connection failed. Loading sample data...');
        await loadSampleMatches();
        return false;
    }
}

// ===== AUTO SYNC =====
let syncInterval = null;

function startAutoSync(intervalSeconds = 30) {
    if (syncInterval) clearInterval(syncInterval);
    
    testAPIConnection().then((connected) => {
        if (connected) syncAllMatches();
    });
    
    syncInterval = setInterval(() => {
        syncAllMatches();
    }, intervalSeconds * 1000);
    
    console.log(`⏰ Auto-sync started (every ${intervalSeconds}s)`);
}

// ===== EXPOSE TO CONSOLE =====
window.syncNow = syncAllMatches;
window.testAPI = testAPIConnection;
window.loadSamples = loadSampleMatches;

// ===== AUTO-START =====
if (document.readyState === 'complete') {
    startAutoSync(30);
} else {
    window.addEventListener('load', () => startAutoSync(30));
}

console.log('🏈 SportMonks API loaded with WORKING token');
console.log('💡 Run testAPI() to check connection');
