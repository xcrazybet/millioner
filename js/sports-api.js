// ============================================
// js/sports-api.js - FINAL v14.0
// X Lodon Sports - FULLY WORKING
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';

async function fetchFromBackend(endpoint) {
    try {
        const url = `${BACKEND_URL}${endpoint}`;
        console.log(`🔄 ${endpoint}`);
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
async function fetchTodayMatches() { return await fetchFromBackend('/api/fixtures/today'); }

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
        console.log(`✅ ${home.name} vs ${away.name} (${status})`);
        return true;
    } catch (e) {
        console.error(`❌ ${id}:`, e);
        return false;
    }
}

async function cleanupOldMatches() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    const snap = await db.collection('sports_matches').where('status', '==', 'upcoming').get();
    const toDelete = [];
    const sixHoursAgo = new Date(Date.now() - 6*60*60*1000);
    
    snap.forEach(d => {
        const m = d.data();
        if (m.startTime?.toDate() < sixHoursAgo) toDelete.push(d.ref);
    });
    
    if (toDelete.length) {
        const batch = db.batch();
        toDelete.forEach(r => batch.delete(r));
        await batch.commit();
        console.log(`🧹 Deleted ${toDelete.length} old matches`);
    }
    return toDelete.length;
}

async function settleFinishedMatches() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    const finished = await db.collection('sports_matches').where('status', '==', 'finished').get();
    let settled = 0;
    
    for (const d of finished.docs) {
        const m = d.data();
        if (m.betsSettled) continue;
        
        const result = m.result || (m.score.home > m.score.away ? 'home' : m.score.home < m.score.away ? 'away' : 'draw');
        const bets = await db.collection('bets').where('fixtureId', '==', m.fixtureId).where('status', '==', 'active').get();
        
        if (!bets.empty && typeof settleBetsForMatch === 'function') {
            await settleBetsForMatch(m.fixtureId, result);
            settled += bets.size;
        }
        await d.ref.update({ result, betsSettled: true });
    }
    return settled;
}

async function syncAllMatches() {
    console.log('🚀 Syncing...');
    await cleanupOldMatches();
    
    const live = await fetchLiveMatches();
    let liveCount = 0;
    if (live?.data) for (const m of live.data) if (await syncMatchToFirestore(m)) liveCount++;
    
    const upcoming = await fetchUpcomingWeek();
    let upcomingCount = 0;
    if (upcoming?.data) for (const m of upcoming.data) if (await syncMatchToFirestore(m)) upcomingCount++;
    
    const settled = await settleFinishedMatches();
    console.log(`✅ ${liveCount} live, ${upcomingCount} upcoming, ${settled} settled`);
    return { live: liveCount, upcoming: upcomingCount, settled };
}

let interval;
function startSync(sec = 30) {
    if (interval) clearInterval(interval);
    syncAllMatches();
    interval = setInterval(syncAllMatches, sec * 1000);
}

window.syncNow = syncAllMatches;
if (document.readyState === 'complete') startSync(30);
else window.addEventListener('load', () => startSync(30));
console.log('🏈 Sports API v14 Ready');
