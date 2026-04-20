// ============================================
// js/sports-api.js - COMPLETE REWRITE v13.0
// X Lodon Sports - API-Football Integration
// FIXED: Sync now properly saves matches
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
        return data;
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
    if (status === 'TBD' || status === 'NS' || !status) return 'upcoming';
    if (status === '1H' || status === 'HT' || status === '2H' || status === 'ET' || status === 'P' || status === 'LIVE') return 'live';
    if (status === 'FT' || status === 'AET' || status === 'PEN') return 'finished';
    if (status === 'CANC') return 'cancelled';
    if (status === 'PST') return 'postponed';
    return 'upcoming';
}

function calculateOdds(homeName, awayName) {
    const hash = (homeName + awayName).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return {
        home: +(1.80 + (hash % 20) / 100).toFixed(2),
        draw: +(3.20 + (hash % 15) / 100).toFixed(2),
        away: +(2.80 + (hash % 25) / 100).toFixed(2)
    };
}

// ===== SYNC MATCH TO FIRESTORE (FIXED) =====
async function syncMatchToFirestore(match) {
    if (!firebase?.firestore) {
        console.error('❌ Firestore not initialized');
        return false;
    }
    
    const db = firebase.firestore();
    
    // Extract data with fallbacks
    const fixture = match.fixture || {};
    const teams = match.teams || {};
    const goals = match.goals || {};
    const league = match.league || {};
    
    const fixtureId = fixture.id;
    if (!fixtureId) {
        console.warn('⚠️ No fixture ID, skipping');
        return false;
    }
    
    const homeTeam = teams.home || {};
    const awayTeam = teams.away || {};
    
    if (!homeTeam.name || !awayTeam.name) {
        console.warn(`⚠️ Missing team names for fixture ${fixtureId}, skipping`);
        return false;
    }
    
    const status = getMatchStatus(match);
    const odds = calculateOdds(homeTeam.name, awayTeam.name);
    
    // Determine result if finished
    let result = null;
    if (status === 'finished') {
        const homeGoals = goals.home || 0;
        const awayGoals = goals.away || 0;
        if (homeGoals > awayGoals) result = 'home';
        else if (homeGoals < awayGoals) result = 'away';
        else result = 'draw';
    }
    
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
        leagueId: league.id || 0,
        leagueName: league.name || 'Unknown League',
        homeTeam: {
            id: homeTeam.id || 0,
            name: homeTeam.name,
            logo: homeTeam.logo || ''
        },
        awayTeam: {
            id: awayTeam.id || 0,
            name: awayTeam.name,
            logo: awayTeam.logo || ''
        },
        startTime: fixture.date ? new Date(fixture.date) : new Date(),
        score: {
            home: goals.home || 0,
            away: goals.away || 0
        },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        isRealData: true
    };
    
    try {
        await db.collection('sports_matches').doc(fixtureId.toString()).set(matchData, { merge: true });
        console.log(`✅ Saved: ${homeTeam.name} vs ${awayTeam.name} (${status})`);
        return true;
    } catch (error) {
        console.error(`❌ Firestore error for ${fixtureId}:`, error);
        return false;
    }
}

// ===== CLEANUP OLD MATCHES =====
async function cleanupOldMatches() {
    if (!firebase?.firestore) return 0;
    
    const db = firebase.firestore();
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    let deleted = 0;
    
    try {
        const snapshot = await db.collection('sports_matches')
            .where('status', '==', 'upcoming')
            .get();
        
        const toDelete = [];
        snapshot.forEach(doc => {
            const m = doc.data();
            const matchTime = m.startTime?.toDate();
            if (matchTime && matchTime < sixHoursAgo) {
                toDelete.push(doc.ref);
            }
        });
        
        if (toDelete.length > 0) {
            const batch = db.batch();
            toDelete.forEach(ref => batch.delete(ref));
            await batch.commit();
            deleted = toDelete.length;
            console.log(`🧹 Deleted ${deleted} old matches`);
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
    
    return deleted;
}

// ===== SETTLE FINISHED MATCHES =====
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
            if (match.betsSettled) continue;
            
            const result = match.result || 
                (match.score.home > match.score.away ? 'home' : 
                 match.score.home < match.score.away ? 'away' : 'draw');
            
            const activeBets = await db.collection('bets')
                .where('fixtureId', '==', match.fixtureId)
                .where('status', '==', 'active')
                .get();
            
            if (!activeBets.empty && typeof settleBetsForMatch === 'function') {
                await settleBetsForMatch(match.fixtureId, result);
                settled += activeBets.size;
            }
            
            await doc.ref.update({ result, betsSettled: true });
        }
    } catch (error) {
        console.error('Settlement error:', error);
    }
    
    return settled;
}

// ===== SYNC ALL MATCHES =====
async function syncAllMatches() {
    console.log('🚀 Starting sync...');
    
    await cleanupOldMatches();
    
    // Fetch live matches
    const liveData = await fetchLiveMatches();
    let liveCount = 0;
    if (liveData?.success && liveData.data) {
        console.log(`📊 Processing ${liveData.data.length} live matches`);
        for (const m of liveData.data) {
            if (await syncMatchToFirestore(m)) liveCount++;
        }
    }
    
    // Fetch upcoming matches
    const upcomingData = await fetchUpcomingWeek();
    let upcomingCount = 0;
    if (upcomingData?.success && upcomingData.data) {
        console.log(`📊 Processing ${upcomingData.data.length} upcoming matches`);
        for (const m of upcomingData.data) {
            if (await syncMatchToFirestore(m)) upcomingCount++;
        }
    }
    
    // Settle finished matches
    const settled = await settleFinishedMatches();
    
    console.log(`✅ Synced: ${liveCount} live, ${upcomingCount} upcoming, ${settled} settled`);
    return { live: liveCount, upcoming: upcomingCount, settled };
}

// ===== AUTO SYNC =====
let syncInterval = null;

function startAutoSync(seconds = 30) {
    if (syncInterval) clearInterval(syncInterval);
    syncAllMatches();
    syncInterval = setInterval(() => syncAllMatches(), seconds * 1000);
    console.log(`⏰ Auto-sync every ${seconds}s`);
}

// ===== EXPORT =====
window.syncNow = syncAllMatches;

if (document.readyState === 'complete') startAutoSync(30);
else window.addEventListener('load', () => startAutoSync(30));

console.log('🏈 Sports API v13.0 Loaded | Auto-sync: 30s');
