// ============================================
// SPORTMONKS API INTEGRATION
// X Lodon Betting Platform
// ============================================

const SPORTMONKS_CONFIG = {
    token: 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy',
    baseUrl: 'https://api.sportmonks.com/v3/football'
};

// ===== FETCH FUNCTIONS =====

async function fetchFromSportMonks(endpoint, params = '') {
    const url = `${SPORTMONKS_CONFIG.baseUrl}/${endpoint}?api_token=${SPORTMONKS_CONFIG.token}${params ? '&' + params : ''}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('SportMonks API Error:', error);
        return null;
    }
}

async function fetchLiveMatches() {
    const params = 'include=league;participants;scores';
    return await fetchFromSportMonks('livescores', params);
}

async function fetchUpcomingFixtures() {
    const today = new Date().toISOString().split('T')[0];
    const params = `include=league;participants&filters=startingAt:gte:${today}`;
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
    if (!match.starting_at) return 'upcoming';
    
    const now = new Date();
    const startTime = new Date(match.starting_at);
    
    // Match hasn't started
    if (now < startTime) return 'upcoming';
    
    // Match is live (within 2 hours of start)
    const twoHoursInMs = 2 * 60 * 60 * 1000;
    if (now >= startTime && now <= new Date(startTime.getTime() + twoHoursInMs)) {
        return match.state_id === 1 ? 'live' : 'finished';
    }
    
    // Check SportMonks state
    if (match.state_id === 1) return 'live';
    if (match.state_id === 5) return 'finished';
    if (match.state_id === 4) return 'cancelled';
    
    return 'upcoming';
}

function getMatchResult(match) {
    if (!match.scores || match.scores.length < 2) return null;
    
    const homeScore = match.scores[0]?.score?.goals || 0;
    const awayScore = match.scores[1]?.score?.goals || 0;
    
    if (homeScore > awayScore) return 'home';
    if (homeScore < awayScore) return 'away';
    if (homeScore === awayScore && match.state_id === 5) return 'draw';
    
    return null;
}

async function syncMatchToFirestore(match) {
    if (!firebase || !firebase.firestore) {
        console.error('Firebase not initialized');
        return;
    }
    
    const db = firebase.firestore();
    const fixtureId = match.id;
    
    // Extract team data
    const participants = match.participants || [];
    const homeTeam = participants.find(p => p.meta?.location === 'home') || participants[0];
    const awayTeam = participants.find(p => p.meta?.location === 'away') || participants[1];
    
    const status = getMatchStatus(match);
    const result = getMatchResult(match);
    
    // Calculate expiresAt (24 hours after match finishes)
    let expiresAt = null;
    if (status === 'finished') {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
    }
    
    const matchData = {
        fixtureId: fixtureId,
        leagueId: match.league_id,
        leagueName: match.league?.name || 'Unknown League',
        homeTeam: {
            id: homeTeam?.id || 0,
            name: homeTeam?.name || 'Home Team',
            logo: homeTeam?.image_path || ''
        },
        awayTeam: {
            id: awayTeam?.id || 0,
            name: awayTeam?.name || 'Away Team',
            logo: awayTeam?.image_path || ''
        },
        startTime: match.starting_at ? new Date(match.starting_at) : new Date(),
        status: status,
        score: {
            home: match.scores?.[0]?.score?.goals || 0,
            away: match.scores?.[1]?.score?.goals || 0
        },
        odds: {
            home: 2.00,  // Will be updated by odds-calculator
            draw: 3.50,
            away: 3.80
        },
        result: result,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        expiresAt: expiresAt
    };
    
    try {
        await db.collection('sports_matches').doc(fixtureId.toString()).set(matchData, { merge: true });
        console.log(`Synced match ${fixtureId}: ${matchData.homeTeam.name} vs ${matchData.awayTeam.name}`);
        return true;
    } catch (error) {
        console.error(`Error syncing match ${fixtureId}:`, error);
        return false;
    }
}

async function syncAllLiveMatches() {
    const data = await fetchLiveMatches();
    
    if (!data || !data.data) {
        console.log('No live matches found');
        return 0;
    }
    
    console.log(`Found ${data.data.length} live matches`);
    
    for (const match of data.data) {
        await syncMatchToFirestore(match);
    }
    
    return data.data.length;
}

async function syncAllUpcomingMatches() {
    const data = await fetchUpcomingFixtures();
    
    if (!data || !data.data) {
        console.log('No upcoming matches found');
        return 0;
    }
    
    // Limit to next 50 matches to avoid quota issues
    const upcomingMatches = data.data.slice(0, 50);
    console.log(`Found ${upcomingMatches.length} upcoming matches`);
    
    for (const match of upcomingMatches) {
        await syncMatchToFirestore(match);
    }
    
    return upcomingMatches.length;
}

async function syncAllMatches() {
    console.log('Starting full sync...');
    
    const liveCount = await syncAllLiveMatches();
    const upcomingCount = await syncAllUpcomingMatches();
    
    console.log(`Sync complete: ${liveCount} live, ${upcomingCount} upcoming`);
    return { live: liveCount, upcoming: upcomingCount };
}

// ===== REAL-TIME SYNC LOOP =====

let syncInterval = null;

function startAutoSync(intervalSeconds = 30) {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    // Run immediately
    syncAllMatches();
    
    // Then run every X seconds
    syncInterval = setInterval(() => {
        syncAllMatches();
    }, intervalSeconds * 1000);
    
    console.log(`Auto-sync started (every ${intervalSeconds}s)`);
}

function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('Auto-sync stopped');
    }
}

// ===== MANUAL TEST FUNCTION =====

async function testAPIConnection() {
    console.log('Testing SportMonks API connection...');
    
    const liveData = await fetchLiveMatches();
    
    if (liveData && liveData.data) {
        console.log(`✅ API Connected! Found ${liveData.data.length} live matches.`);
        return true;
    } else {
        console.error('❌ API connection failed. Check token and network.');
        return false;
    }
}

// Auto-start on pages that include this script
if (document.readyState === 'complete') {
    startAutoSync(30);
} else {
    window.addEventListener('load', () => {
        startAutoSync(30);
    });
}
