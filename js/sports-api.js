// ============================================
// js/sports-api.js - v22.0 SYNTAX FIXED
// X Lodon Sports - API-Football Integration
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';

async function fetchFromBackend(endpoint) {
    try {
        const url = `${BACKEND_URL}${endpoint}`;
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
async function fetchFixturesByDate(date) { return await fetchFromBackend(`/api/fixtures/date/${date}`); }
async function fetchFixtureById(fixtureId) { return await fetchFromBackend(`/api/fixtures/${fixtureId}`); }

async function testAPIConnection() {
    console.log('🔍 Testing API...');
    const result = await fetchFromBackend('/api/debug');
    console.log('API Status:', result);
    return result;
}

function getMatchStatus(match) {
    const status = match.fixture?.status?.short;
    if (!status || status === 'TBD' || status === 'NS') return 'upcoming';
    if (['1H','HT','2H','ET','P','LIVE'].includes(status)) return 'live';
    if (['FT','AET','PEN'].includes(status)) return 'finished';
    const now = new Date();
    const start = new Date(match.fixture?.date);
    if (now < start) return 'upcoming';
    return 'live';
}

function getMatchResult(match) {
    const goals = match.goals;
    if (!goals) return null;
    const home = goals.home || 0;
    const away = goals.away || 0;
    const status = match.fixture?.status?.short;
    if (['FT','AET','PEN'].includes(status)) {
        if (home > away) return 'home';
        if (home < away) return 'away';
        return 'draw';
    }
    return null;
}

function calculateOdds(homeName, awayName) {
    const hash = (homeName + awayName).split('').reduce((a,b) => a + b.charCodeAt(0), 0);
    return {
        home: +(1.80 + (hash % 20) / 100).toFixed(2),
        draw: +(3.20 + (hash % 15) / 100).toFixed(2),
        away: +(2.80 + (hash % 25) / 100).toFixed(2)
    };
}

function getMinutesUntilKickoff(startTime) {
    const now = new Date();
    const kickoff = startTime?.toDate ? startTime.toDate() : new Date(startTime);
    return Math.floor((kickoff - now) / 60000);
}

function getMatchMinute(startTime) {
    if (!startTime) return 45;
    try {
        const now = new Date();
        const start = startTime.toDate ? startTime.toDate() : new Date(startTime);
        const diff = Math.floor((now - start) / 60000);
        if (diff < 1) return 1;
        if (diff > 90) return 90;
        return diff;
    } catch (e) { return 45; }
}

async function cleanupOldMatches() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    let deleted = 0;
    try {
        const snapshot = await db.collection('sports_matches').get();
        const toDelete = [];
        snapshot.forEach(doc => {
            const m = doc.data();
            if (m.fixtureId >= 1000000) { toDelete.push(doc.ref); return; }
            if (m.homeTeam?.name === 'Home' || m.awayTeam?.name === 'Away') { toDelete.push(doc.ref); return; }
            if (m.status === 'upcoming') {
                const matchTime = m.startTime?.toDate();
                if (matchTime && matchTime < sixHoursAgo) toDelete.push(doc.ref);
            }
            if (m.status === 'finished' && m.expiresAt) {
                const expiresAt = m.expiresAt.toDate ? m.expiresAt.toDate() : new Date(m.expiresAt);
                if (expiresAt < now) toDelete.push(doc.ref);
            }
        });
        if (toDelete.length > 0) {
            const batch = db.batch();
            toDelete.forEach(ref => batch.delete(ref));
            await batch.commit();
            deleted = toDelete.length;
            console.log(`🧹 Deleted ${deleted} old matches`);
        }
    } catch (error) { console.error('Cleanup error:', error); }
    return deleted;
}

async function syncMatchToFirestore(match) {
    if (!firebase?.firestore) return false;
    const db = firebase.firestore();
    const fixture = match.fixture, teams = match.teams, goals = match.goals, league = match.league;
    const fixtureId = fixture?.id;
    if (!fixtureId || fixtureId >= 1000000) return false;
    if (!teams?.home || !teams?.away) return false;

    const status = getMatchStatus(match);
    const result = getMatchResult(match);
    const odds = calculateOdds(teams.home.name, teams.away.name);
    let expiresAt = null;
    if (status === 'finished') { expiresAt = new Date(); expiresAt.setHours(expiresAt.getHours() + 24); }

    const matchData = {
        fixtureId, status, result, odds, expiresAt,
        leagueId: league?.id || 0, leagueName: league?.name || 'Unknown League',
        homeTeam: { id: teams.home.id || 0, name: teams.home.name, logo: teams.home.logo || '' },
        awayTeam: { id: teams.away.id || 0, name: teams.away.name, logo: teams.away.logo || '' },
        startTime: fixture.date ? new Date(fixture.date) : new Date(),
        score: { home: goals?.home || 0, away: goals?.away || 0 },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        isRealData: true
    };

    try {
        const docRef = db.collection('sports_matches').doc(fixtureId.toString());
        const oldDoc = await docRef.get();
        const oldStatus = oldDoc.exists ? oldDoc.data().status : null;
        await docRef.set(matchData, { merge: true });
        if (oldStatus && oldStatus !== 'finished' && status === 'finished') {
            console.log(`🏁 Settling: ${teams.home.name} vs ${teams.away.name}`);
            await settleBetsForMatch(fixtureId, result);
        }
        return true;
    } catch (error) { console.error(`Sync error ${fixtureId}:`, error); return false; }
}

async function forceUpdateMatchStatusByTime() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    const now = new Date();
    let updated = 0;
    try {
        const snapshot = await db.collection('sports_matches').where('status', '==', 'upcoming').get();
        const batch = db.batch();
        snapshot.forEach(doc => {
            const match = doc.data();
            const startTime = match.startTime?.toDate ? match.startTime.toDate() : new Date(match.startTime);
            if (startTime <= now) {
                batch.update(doc.ref, { status: 'live', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                updated++;
            }
        });
        if (updated > 0) { await batch.commit(); console.log(`✅ Force updated ${updated} matches to live`); }
        const finished = await db.collection('sports_matches').where('status', '==', 'finished').where('betsSettled', '==', false).get();
        for (const doc of finished.docs) {
            const m = doc.data();
            let r = m.result;
            if (!r) { const h = m.score?.home || 0, a = m.score?.away || 0; r = h > a ? 'home' : h < a ? 'away' : 'draw'; }
            await settleBetsForMatch(m.fixtureId, r);
        }
    } catch (error) { console.error('Force update error:', error); }
    return updated;
}

async function settleBetsForMatch(fixtureId, result) {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore(); let settled = 0;
    try {
        const bets = await db.collection('bets').where('fixtureId', '==', fixtureId).where('status', '==', 'active').get();
        for (const doc of bets.docs) {
            const bet = doc.data(); const won = bet.betType === result;
            if (won) {
                const walletRef = db.collection('wallets').doc(bet.userId);
                const walletDoc = await walletRef.get();
                await walletRef.update({ balance: (walletDoc.data()?.balance || 0) + bet.potentialWin });
                await doc.ref.update({ status: 'won', result, payout: bet.potentialWin, settledAt: new Date() });
            } else {
                await doc.ref.update({ status: 'lost', result, payout: 0, settledAt: new Date() });
            }
            settled++;
        }
        await db.collection('sports_matches').doc(fixtureId.toString()).update({ betsSettled: true });
    } catch (e) { console.error('Settlement error:', e); }
    return settled;
}

async function syncLiveMatches() {
    const d = await fetchLiveMatches();
    if (!d?.success || !d.data) return 0;
    let s = 0;
    for (const m of d.data) if (await syncMatchToFirestore(m)) s++;
    return s;
}

async function syncUpcomingWeekMatches() {
    const d = await fetchUpcomingWeek();
    if (!d?.success || !d.data) return 0;
    let s = 0;
    for (const m of d.data.slice(0, 100)) if (await syncMatchToFirestore(m)) s++;
    return s;
}

async function syncAllMatches() {
    console.log('🚀 Starting sync...');
    await cleanupOldMatches();
    const live = await syncLiveMatches();
    const upcoming = await syncUpcomingWeekMatches();
    const forceUpdated = await forceUpdateMatchStatusByTime();
    console.log(`✅ Sync: ${live} live, ${upcoming} upcoming, ${forceUpdated} force-updated`);
    return { live, upcoming, forceUpdated };
}

let syncInterval = null;
let forceUpdateInterval = null;

function startAutoSync(seconds = 60) {
    if (syncInterval) clearInterval(syncInterval);
    if (forceUpdateInterval) clearInterval(forceUpdateInterval);
    syncAllMatches();
    syncInterval = setInterval(() => syncAllMatches(), seconds * 1000);
    forceUpdateInterval = setInterval(() => forceUpdateMatchStatusByTime(), 30000);
    console.log(`⏰ Auto-sync every ${seconds}s`);
}

window.syncNow = syncAllMatches;
window.testAPI = testAPIConnection;
window.cleanupNow = cleanupOldMatches;
window.settleNow = settleBetsForMatch;
window.forceUpdateStatus = forceUpdateMatchStatusByTime;

setTimeout(() => syncAllMatches(), 1000);
if (document.readyState === 'complete') startAutoSync(60);
else window.addEventListener('load', () => startAutoSync(60));

console.log('🏈 Sports API v22.0 - Syntax Fixed');
