// ============================================
// X LODON SPORTS API - v10 (API-FOOTBALL FIXED)
// ============================================
const BACKEND_URL = 'https://millioner.onrender.com';

async function fetchFromBackend(endpoint) {
    try {
        const res = await fetch(`${BACKEND_URL}${endpoint}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) { console.error(`❌ ${endpoint}:`, e.message); return null; }
}

async function fetchLiveMatches() { return await fetchFromBackend('/api/livescores'); }
async function fetchUpcomingWeek() { return await fetchFromBackend('/api/fixtures/week'); }

function getMatchStatus(match) {
    const status = match.fixture?.status?.short;
    if (['TBD', 'NS'].includes(status)) return 'upcoming';
    if (['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(status)) return 'live';
    if (['FT', 'AET', 'PEN'].includes(status)) return 'finished';
    if (status === 'CANC') return 'cancelled';
    if (status === 'PST') return 'postponed';
    return 'upcoming';
}

async function syncMatchToFirestore(match) {
    if (!firebase?.firestore) return false;
    const db = firebase.firestore();
    const fixture = match.fixture;
    const teams = match.teams;
    const goals = match.goals;
    const league = match.league;
    const fixtureId = fixture?.id;
    if (!fixtureId || !teams?.home || !teams?.away) return false;

    const status = getMatchStatus(match);
    const result = status === 'finished' ? (goals.home > goals.away ? 'home' : goals.home < goals.away ? 'away' : 'draw') : null;
    
    const matchData = {
        fixtureId, status, result,
        leagueId: league?.id || 0, leagueName: league?.name || 'Unknown League',
        homeTeam: { id: teams.home.id, name: teams.home.name, logo: teams.home.logo },
        awayTeam: { id: teams.away.id, name: teams.away.name, logo: teams.away.logo },
        startTime: new Date(fixture.date),
        score: { home: goals?.home || 0, away: goals?.away || 0 },
        odds: { home: 2.00, draw: 3.50, away: 3.80 },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        expiresAt: status === 'finished' ? new Date(Date.now() + 24*60*60*1000) : null
    };
    
    try {
        await db.collection('sports_matches').doc(fixtureId.toString()).set(matchData, { merge: true });
        return true;
    } catch (e) { return false; }
}

// ===== AUTO-SETTLEMENT =====
async function settleFinishedMatches() {
    if (!firebase?.firestore) return;
    const db = firebase.firestore();
    const finished = await db.collection('sports_matches').where('status', '==', 'finished').get();
    
    for (const doc of finished.docs) {
        const match = doc.data();
        if (match.betsSettled) continue;
        
        const result = match.result || (match.score.home > match.score.away ? 'home' : match.score.home < match.score.away ? 'away' : 'draw');
        const activeBets = await db.collection('bets').where('fixtureId', '==', match.fixtureId).where('status', '==', 'active').get();
        
        if (!activeBets.empty && typeof settleBetsForMatch === 'function') {
            await settleBetsForMatch(match.fixtureId, result);
        }
        await doc.ref.update({ result, betsSettled: true });
    }
}

async function syncAllMatches() {
    console.log('🚀 Syncing...');
    const [live, upcoming] = await Promise.all([fetchLiveMatches(), fetchUpcomingWeek()]);
    let count = 0;
    if (live?.data) for (const m of live.data) if (await syncMatchToFirestore(m)) count++;
    if (upcoming?.data) for (const m of upcoming.data) if (await syncMatchToFirestore(m)) count++;
    await settleFinishedMatches();
    console.log(`✅ Synced ${count} matches`);
    return count;
}

window.syncNow = syncAllMatches;
syncAllMatches();
setInterval(syncAllMatches, 30000);
console.log('🏈 Sports API v10 Ready');
