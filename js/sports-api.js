// ============================================
// X LODON SPORTS API - v8.0 (FULLY WORKING)
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
        return null;
    }
}

// ===== FETCH FUNCTIONS =====
async function fetchLiveMatches() {
    return await fetchFromBackend('/api/livescores');
}

async function fetchUpcomingWeek() {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const from = today.toISOString().split('T')[0];
    const to = nextWeek.toISOString().split('T')[0];
    return await fetchFromBackend(`/api/fixtures/between/${from}/${to}`);
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
    
    // Skip sample data
    if (fixtureId >= 100000) return false;
    
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
        homeTeam: { id: homeTeam.id || 0, name: homeTeam.name, logo: homeTeam.image_path || '' },
        awayTeam: { id: awayTeam.id || 0, name: awayTeam.name, logo: awayTeam.image_path || '' },
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

// ===== CLEANUP OLD/SAMPLE MATCHES =====
async function cleanupOldMatches() {
    if (!firebase?.firestore) return 0;
    
    const db = firebase.firestore();
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    let deleted = 0;
    
    try {
        // Get all matches and filter manually (avoids index issues)
        const snapshot = await db.collection('sports_matches').get();
        const toDelete = [];
        
        snapshot.forEach(doc => {
            const m = doc.data();
            
            // Delete sample matches (fixtureId >= 100000)
            if (m.fixtureId >= 100000) {
                toDelete.push(doc.ref);
                return;
            }
            
            // Delete placeholder teams
            if (m.homeTeam?.name === 'Home' || m.awayTeam?.name === 'Away') {
                toDelete.push(doc.ref);
                return;
            }
            
            // Delete old upcoming matches
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
            if (match.betsSettled) continue;
            
            let result = match.result;
            if (!result) {
                const homeScore = match.score?.home || 0;
                const awayScore = match.score?.away || 0;
                if (homeScore > awayScore) result = 'home';
                else if (homeScore < awayScore) result = 'away';
                else result = 'draw';
            }
            
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
            
            await doc.ref.update({ 
                result: result, 
                betsSettled: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (e) {
        console.error('Settlement error:', e);
    }
    
    return settled;
}

// ===== SYNC ALL =====
async function syncLiveMatches() {
    const data = await fetchLiveMatches();
    if (!data?.data) return 0;
    let synced = 0;
    for (const m of data.data) {
        if (await syncMatchToFirestore(m)) synced++;
    }
    return synced;
}

async function syncUpcomingWeekMatches() {
    const data = await fetchUpcomingWeek();
    if (!data?.data) return 0;
    let synced = 0;
    for (const m of data.data) {
        if (await syncMatchToFirestore(m)) synced++;
    }
    return synced;
}

async function syncAllMatches() {
    console.log('🚀 Starting full sync...');
    
    await cleanupOldMatches();
    const live = await syncLiveMatches();
    const upcoming = await syncUpcomingWeekMatches();
    const settled = await settleFinishedMatches();
    
    console.log(`✅ Sync complete: ${live} live, ${upcoming} upcoming, ${settled} bets settled`);
    return { live, upcoming, settled };
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

if (document.readyState === 'complete') {
    startAutoSync(30);
} else {
    window.addEventListener('load', () => startAutoSync(30));
}

console.log('🏈 Sports API v8.0 - Fully Working');
