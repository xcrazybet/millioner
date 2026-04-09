// ============================================
// SPORTMONKS API INTEGRATION - X Lodon Betting
// ============================================

const SPORTMONKS_CONFIG = {
    token: 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy',
    baseUrl: 'https://api.sportmonks.com/v3/football'
};

// Wait for proxy to be available
function waitForProxy() {
    return new Promise((resolve) => {
        if (typeof corsProxy !== 'undefined') {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (typeof corsProxy !== 'undefined') {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        }
    });
}

// ===== FETCH WITH PROXY =====
async function fetchFromSportMonks(endpoint, params = '') {
    await waitForProxy();
    
    const url = `${SPORTMONKS_CONFIG.baseUrl}/${endpoint}?api_token=${SPORTMONKS_CONFIG.token}${params ? '&' + params : ''}`;
    
    console.log(`🔄 Fetching: ${endpoint}`);
    
    try {
        // Use the CORS proxy
        const data = await corsProxy.fetchJSON(url);
        
        if (data && !data.error) {
            console.log(`✅ Success: ${endpoint}`);
            return data;
        } else {
            console.warn(`⚠️ API returned error for ${endpoint}`);
            return null;
        }
        
    } catch (error) {
        console.error(`❌ Failed to fetch ${endpoint}:`, error.message);
        return null;
    }
}

// ===== FETCH FUNCTIONS =====
async function fetchLiveMatches() {
    const params = 'include=league;participants;scores';
    return await fetchFromSportMonks('livescores', params);
}

async function fetchUpcomingFixtures() {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const params = `include=league;participants&filters=startingAt:${today},${tomorrow}`;
    return await fetchFromSportMonks('fixtures', params);
}

async function fetchLeagues() {
    return await fetchFromSportMonks('leagues', '');
}

async function fetchFixtureById(fixtureId) {
    const params = 'include=league;participants;scores;odds';
    return await fetchFromSportMonks(`fixtures/${fixtureId}`, params);
}

// ===== SYNC TO FIRESTORE =====
function getMatchStatus(match) {
    const stateId = match.state_id;
    
    // SportMonks state IDs
    if (stateId === 1) return 'live';
    if (stateId === 2) return 'live';      // First half
    if (stateId === 3) return 'live';      // Half time
    if (stateId === 4) return 'live';      // Second half
    if (stateId === 5) return 'finished';
    if (stateId === 6) return 'finished';  // After extra time
    if (stateId === 7) return 'finished';  // Penalties
    if (stateId === 8) return 'cancelled';
    if (stateId === 9) return 'postponed';
    
    // Check by time
    const now = new Date();
    const startTime = new Date(match.starting_at);
    
    if (now < startTime) return 'upcoming';
    
    return 'upcoming';
}

function getMatchResult(match) {
    if (!match.scores || match.scores.length < 2) return null;
    
    const homeScore = match.scores.find(s => s.description === 'CURRENT')?.score?.goals || 
                     match.scores[0]?.score?.goals || 0;
    const awayScore = match.scores.find(s => s.description === 'CURRENT')?.score?.goals || 
                     match.scores[1]?.score?.goals || 0;
    
    if (homeScore > awayScore) return 'home';
    if (homeScore < awayScore) return 'away';
    if (homeScore === awayScore && match.state_id === 5) return 'draw';
    
    return null;
}

async function syncMatchToFirestore(match) {
    if (!firebase || !firebase.firestore) {
        console.error('Firebase not initialized');
        return false;
    }
    
    const db = firebase.firestore();
    const fixtureId = match.id;
    
    // Get participants
    const participants = match.participants || [];
    const homeTeam = participants.find(p => p.meta?.location === 'home') || participants[0];
    const awayTeam = participants.find(p => p.meta?.location === 'away') || participants[1];
    
    if (!homeTeam || !awayTeam) {
        console.warn(`Skipping match ${fixtureId}: missing team data`);
        return false;
    }
    
    const status = getMatchStatus(match);
    const result = getMatchResult(match);
    
    // Calculate odds
    const odds = calculateDefaultOdds(homeTeam.name, awayTeam.name);
    
    // Set expiry for finished matches
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
            home: match.scores?.find(s => s.description === 'CURRENT')?.score?.goals || 
                  match.scores?.[0]?.score?.goals || 0,
            away: match.scores?.find(s => s.description === 'CURRENT')?.score?.goals || 
                  match.scores?.[1]?.score?.goals || 0
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

// Default odds calculator
function calculateDefaultOdds(homeName, awayName) {
    // Simple hash-based odds for consistency
    const hash = (homeName + awayName).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    
    const homeOdds = 1.80 + (hash % 20) / 100;
    const drawOdds = 3.20 + (hash % 15) / 100;
    const awayOdds = 2.80 + (hash % 25) / 100;
    
    return {
        home: Math.round(homeOdds * 100) / 100,
        draw: Math.round(drawOdds * 100) / 100,
        away: Math.round(awayOdds * 100) / 100
    };
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
    
    // Limit to 30 matches
    const upcomingMatches = data.data.slice(0, 30);
    console.log(`📅 Found ${upcomingMatches.length} upcoming matches`);
    
    let synced = 0;
    for (const match of upcomingMatches) {
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

// ===== LOAD SAMPLE DATA (FALLBACK) =====
async function loadSampleMatches() {
    if (!firebase || !firebase.firestore) return;
    
    const db = firebase.firestore();
    
    const sampleMatches = [
        {
            fixtureId: 100001,
            leagueName: 'Premier League',
            homeTeam: { id: 1, name: 'Arsenal', logo: '' },
            awayTeam: { id: 2, name: 'Manchester City', logo: '' },
            startTime: new Date(Date.now() + 3600000),
            status: 'upcoming',
            odds: { home: 2.40, draw: 3.30, away: 2.90 },
            score: { home: 0, away: 0 },
            result: null
        },
        {
            fixtureId: 100002,
            leagueName: 'La Liga',
            homeTeam: { id: 3, name: 'Barcelona', logo: '' },
            awayTeam: { id: 4, name: 'Real Madrid', logo: '' },
            startTime: new Date(Date.now() + 7200000),
            status: 'upcoming',
            odds: { home: 2.10, draw: 3.50, away: 3.20 },
            score: { home: 0, away: 0 },
            result: null
        },
        {
            fixtureId: 100003,
            leagueName: 'Serie A',
            homeTeam: { id: 5, name: 'Juventus', logo: '' },
            awayTeam: { id: 6, name: 'Inter Milan', logo: '' },
            startTime: new Date(),
            status: 'live',
            odds: { home: 2.60, draw: 3.10, away: 2.70 },
            score: { home: 1, away: 1 },
            result: null
        },
        {
            fixtureId: 100004,
            leagueName: 'Bundesliga',
            homeTeam: { id: 7, name: 'Bayern Munich', logo: '' },
            awayTeam: { id: 8, name: 'Dortmund', logo: '' },
            startTime: new Date(Date.now() - 7200000),
            status: 'finished',
            odds: { home: 1.90, draw: 3.80, away: 3.50 },
            score: { home: 3, away: 2 },
            result: 'home',
            expiresAt: new Date(Date.now() + 86400000)
        }
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
    console.log('🔍 Testing SportMonks API connection...');
    
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

function startAutoSync(intervalSeconds = 60) {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    // Test connection and sync
    testAPIConnection().then(() => {
        syncAllMatches();
    });
    
    syncInterval = setInterval(() => {
        syncAllMatches();
    }, intervalSeconds * 1000);
    
    console.log(`⏰ Auto-sync started (every ${intervalSeconds}s)`);
}

function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('⏸️ Auto-sync stopped');
    }
}

// Auto-start when DOM is ready
if (document.readyState === 'complete') {
    startAutoSync(60);
} else {
    window.addEventListener('load', () => {
        startAutoSync(60);
    });
}

// Manual sync trigger
window.syncNow = syncAllMatches;
window.testAPI = testAPIConnection;
window.loadSamples = loadSampleMatches;

console.log('🏈 SportMonks API module loaded');
