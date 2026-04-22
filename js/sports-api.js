const BACKEND_URL = 'https://millioner.onrender.com';

async function fetchFromBackend(endpoint) {
    try {
        const url = BACKEND_URL + endpoint;
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Fetch error:', error.message);
        return { success: false, data: [] };
    }
}

async function fetchLiveMatches() {
    return await fetchFromBackend('/api/livescores');
}

async function fetchUpcomingWeek() {
    return await fetchFromBackend('/api/fixtures/week');
}

async function testAPIConnection() {
    console.log('Testing API...');
    const result = await fetchFromBackend('/api/debug');
    console.log('API Status:', result);
    return result;
}

function getMatchStatus(match) {
    var status = match.fixture && match.fixture.status ? match.fixture.status.short : null;
    if (!status || status === 'TBD' || status === 'NS') return 'upcoming';
    if (status === '1H' || status === 'HT' || status === '2H' || status === 'ET' || status === 'P' || status === 'LIVE') return 'live';
    if (status === 'FT' || status === 'AET' || status === 'PEN') return 'finished';
    var now = new Date();
    var start = new Date(match.fixture.date);
    if (now < start) return 'upcoming';
    return 'live';
}

function calculateOdds(homeName, awayName) {
    var hash = 0;
    var str = homeName + awayName;
    for (var i = 0; i < str.length; i++) hash = hash + str.charCodeAt(i);
    return {
        home: Number((1.8 + (hash % 20) / 100).toFixed(2)),
        draw: Number((3.2 + (hash % 15) / 100).toFixed(2)),
        away: Number((2.8 + (hash % 25) / 100).toFixed(2))
    };
}

async function syncMatchToFirestore(match) {
    if (!firebase || !firebase.firestore) return false;
    var db = firebase.firestore();
    var fixture = match.fixture || {};
    var teams = match.teams || {};
    var goals = match.goals || {};
    var league = match.league || {};
    var fixtureId = fixture.id;
    if (!fixtureId) return false;
    if (!teams.home || !teams.away) return false;
    var status = getMatchStatus(match);
    var odds = calculateOdds(teams.home.name, teams.away.name);
    var matchData = {
        fixtureId: fixtureId,
        status: status,
        odds: odds,
        leagueId: league.id || 0,
        leagueName: league.name || 'Unknown League',
        homeTeam: { id: teams.home.id || 0, name: teams.home.name, logo: teams.home.logo || '' },
        awayTeam: { id: teams.away.id || 0, name: teams.away.name, logo: teams.away.logo || '' },
        startTime: fixture.date ? new Date(fixture.date) : new Date(),
        score: { home: goals.home || 0, away: goals.away || 0 },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
        await db.collection('sports_matches').doc(String(fixtureId)).set(matchData, { merge: true });
        console.log('Synced: ' + teams.home.name + ' vs ' + teams.away.name);
        return true;
    } catch (e) {
        console.error('Sync error:', e);
        return false;
    }
}

async function forceUpdateMatchStatusByTime() {
    if (!firebase || !firebase.firestore) return 0;
    var db = firebase.firestore();
    var now = new Date();
    var updated = 0;
    try {
        var snapshot = await db.collection('sports_matches').where('status', '==', 'upcoming').get();
        var batch = db.batch();
        snapshot.forEach(function(doc) {
            var match = doc.data();
            var startTime = match.startTime ? match.startTime.toDate() : new Date(match.startTime);
            if (startTime <= now) {
                batch.update(doc.ref, { status: 'live', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                updated++;
            }
        });
        if (updated > 0) await batch.commit();
        console.log('Force updated: ' + updated);
    } catch (e) {
        console.error('Force update error:', e);
    }
    return updated;
}

async function settleBetsForMatch(fixtureId, result) {
    if (!firebase || !firebase.firestore) return 0;
    var db = firebase.firestore();
    try {
        var bets = await db.collection('bets').where('fixtureId', '==', fixtureId).where('status', '==', 'active').get();
        bets.forEach(async function(doc) {
            var bet = doc.data();
            var won = bet.betType === result;
            if (won) {
                var walletRef = db.collection('wallets').doc(bet.userId);
                var walletDoc = await walletRef.get();
                var balance = walletDoc.exists ? walletDoc.data().balance : 0;
                await walletRef.update({ balance: balance + bet.potentialWin });
                await doc.ref.update({ status: 'won', result: result, payout: bet.potentialWin, settledAt: new Date() });
            } else {
                await doc.ref.update({ status: 'lost', result: result, payout: 0, settledAt: new Date() });
            }
        });
        await db.collection('sports_matches').doc(String(fixtureId)).update({ betsSettled: true });
        return bets.size;
    } catch (e) {
        console.error('Settle error:', e);
        return 0;
    }
}

async function syncLiveMatches() {
    var d = await fetchLiveMatches();
    if (!d || !d.success || !d.data) return 0;
    var s = 0;
    for (var i = 0; i < d.data.length; i++) {
        if (await syncMatchToFirestore(d.data[i])) s++;
    }
    return s;
}

async function syncUpcomingWeekMatches() {
    var d = await fetchUpcomingWeek();
    if (!d || !d.success || !d.data) return 0;
    var s = 0;
    var limit = Math.min(d.data.length, 100);
    for (var i = 0; i < limit; i++) {
        if (await syncMatchToFirestore(d.data[i])) s++;
    }
    return s;
}

async function syncAllMatches() {
    console.log('Starting sync...');
    var live = await syncLiveMatches();
    var upcoming = await syncUpcomingWeekMatches();
    var force = await forceUpdateMatchStatusByTime();
    console.log('Sync done: ' + live + ' live, ' + upcoming + ' upcoming');
    return { live: live, upcoming: upcoming, force: force };
}

var syncInterval = null;
var forceInterval = null;

function startAutoSync(seconds) {
    seconds = seconds || 60;
    if (syncInterval) clearInterval(syncInterval);
    if (forceInterval) clearInterval(forceInterval);
    syncAllMatches();
    syncInterval = setInterval(syncAllMatches, seconds * 1000);
    forceInterval = setInterval(forceUpdateMatchStatusByTime, 30000);
    console.log('Auto-sync started');
}

window.syncNow = syncAllMatches;
window.testAPI = testAPIConnection;
window.forceUpdateStatus = forceUpdateMatchStatusByTime;
window.settleBetsForMatch = settleBetsForMatch;

setTimeout(function() { syncAllMatches(); }, 1000);
startAutoSync(60);
console.log('Sports API loaded');
