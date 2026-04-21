// ============================================
// js/sports-api.js - COMPLETE v20.0
// X Lodon Sports - API-Football Integration
// Auto-settlement, Cleanup, Caching, Force Status Update
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';

// ===== FETCH FROM BACKEND =====
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

// ===== FETCH FUNCTIONS =====
async function fetchLiveMatches() { return await fetchFromBackend('/api/livescores'); }
async function fetchUpcomingWeek() { return await fetchFromBackend('/api/fixtures/week'); }
async function fetchTodayMatches() { return await fetchFromBackend('/api/fixtures/today'); }
async function fetchFixturesByDate(date) { return await fetchFromBackend(`/api/fixtures/date/${date}`); }
async function fetchFixturesBetween(from, to) { return await fetchFromBackend(`/api/fixtures/between/${from}/${to}`); }
async function fetchFixtureById(fixtureId) { return await fetchFromBackend(`/api/fixtures/${fixtureId}`); }
async function fetchLeagues() { return await fetchFromBackend('/api/leagues'); }
async function fetchOdds(fixtureId) { return await fetchFromBackend(`/api/odds/${fixtureId}`); }

// ===== TEST CONNECTION =====
async function testAPIConnection() {
    console.log('🔍 Testing API connection...');
    const result = await fetchFromBackend('/api/debug');
    console.log('API Status:', result);
    return result;
}

// ===== STATUS MAPPING (API-Football) =====
function getMatchStatus(match) {
    const status = match.fixture?.status?.short;
    if (!status || status === 'TBD' || status === 'NS') return 'upcoming';
    if (status === '1H' || status === 'HT' || status === '2H' || status === 'ET' || status === 'P' || status === 'LIVE') return 'live';
    if (status === 'FT' || status === 'AET' || status === 'PEN') return 'finished';
    if (status === 'CANC') return 'cancelled';
    if (status === 'PST') return 'postponed';
    if (status === 'SUSP') return 'suspended';
    if (status === 'INT') return 'interrupted';
    if (status === 'ABD') return 'abandoned';
    const now = new Date();
    const start = new Date(match.fixture?.date);
    if (now < start) return 'upcoming';
    if (now > start && now < new Date(start.getTime() + 3 * 60 * 60 * 1000)) return 'live';
    return 'finished';
}

function getMatchResult(match) {
    const goals = match.goals;
    if (!goals) return null;
    const home = goals.home || 0;
    const away = goals.away || 0;
    const status = match.fixture?.status?.short;
    if (status === 'FT' || status === 'AET' || status === 'PEN') {
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

// ===== FORMAT DATE HELPERS =====
function formatMatchDate(date) { return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
function formatMatchTime(date) { return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function getMinutesUntilKickoff(startTime) {
    const now = new Date();
    const kickoff = startTime.toDate ? startTime.toDate() : new Date(startTime);
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

// ===== CLEANUP OLD MATCHES =====
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
            console.log(`🧹 Deleted ${deleted} old/sample matches`);
        }
    } catch (error) { console.error('Cleanup error:', error); }
    return deleted;
}

// ===== SYNC MATCH TO FIRESTORE =====
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
        isRealData: true, apiProvider: 'api-football'
    };

    try {
        const docRef = db.collection('sports_matches').doc(fixtureId.toString());
        const oldDoc = await docRef.get();
        const oldStatus = oldDoc.exists ? oldDoc.data().status : null;
        await docRef.set(matchData, { merge: true });
        if (oldStatus && oldStatus !== 'finished' && status === 'finished') {
            console.log(`🏁 Match finished: ${teams.home.name} vs ${teams.away.name} - Settling bets...`);
            await settleBetsForMatch(fixtureId, result);
        }
        console.log(`📝 ${teams.home.name} vs ${teams.away.name} (${status})`);
        return true;
    } catch (error) { console.error(`Sync error ${fixtureId}:`, error); return false; }
}

// ===== FORCE UPDATE MATCH STATUS BY TIME (FIXES STUCK MATCHES) =====
async function forceUpdateMatchStatusByTime() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    const now = new Date();
    let updated = 0;
    
    try {
        // Get all upcoming matches
        const snapshot = await db.collection('sports_matches')
            .where('status', '==', 'upcoming')
            .get();
        
        const batch = db.batch();
        
        snapshot.forEach(doc => {
            const match = doc.data();
            const startTime = match.startTime?.toDate ? match.startTime.toDate() : new Date(match.startTime);
            
            // If match should have started, update to live
            if (startTime <= now) {
                console.log(`⏰ Force updating to LIVE: ${match.homeTeam?.name} vs ${match.awayTeam?.name}`);
                batch.update(doc.ref, { 
                    status: 'live', 
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
                });
                updated++;
            }
        });
        
        if (updated > 0) {
            await batch.commit();
            console.log(`✅ Force updated ${updated} matches from upcoming to live`);
        }
        
        // Also check finished matches that need settlement
        const finishedSnapshot = await db.collection('sports_matches')
            .where('status', '==', 'finished')
            .where('betsSettled', '==', false)
            .get();
        
        for (const doc of finishedSnapshot.docs) {
            const match = doc.data();
            let result = match.result;
            if (!result) {
                const h = match.score?.home || 0, a = match.score?.away || 0;
                result = h > a ? 'home' : h < a ? 'away' : 'draw';
            }
            await settleBetsForMatch(match.fixtureId, result);
        }
        
    } catch (error) {
        console.error('Force update error:', error);
    }
    
    return updated;
}

// ===== SETTLE BETS FOR MATCH =====
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

// ===== MANUAL SETTLEMENT CHECK =====
async function checkAndSettleAllFinishedMatches() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore(); let totalSettled = 0;
    try {
        const finished = await db.collection('sports_matches').where('status', '==', 'finished').where('betsSettled', '==', false).get();
        for (const doc of finished.docs) {
            const m = doc.data(); let r = m.result;
            if (!r) { const h=m.score?.home||0, a=m.score?.away||0; r = h>a?'home':h<a?'away':'draw'; }
            totalSettled += await settleBetsForMatch(m.fixtureId, r);
        }
    } catch (e) { console.error('Manual settlement error:', e); }
    return totalSettled;
}

// ===== SYNC ALL MATCHES =====
async function syncLiveMatches() { const d = await fetchLiveMatches(); if (!d?.success||!d.data) return 0; let s=0; for(const m of d.data) if(await syncMatchToFirestore(m)) s++; return s; }
async function syncUpcomingWeekMatches() { const d = await fetchUpcomingWeek(); if (!d?.success||!d.data) return 0; let s=0; for(const m of d.data.slice(0,50)) if(await syncMatchToFirestore(m)) s++; return s; }

async function syncAllMatches() {
    console.log('🚀 Starting full sync...');
    await cleanupOldMatches();
    const live = await syncLiveMatches();
    const upcoming = await syncUpcomingWeekMatches();
    const forceUpdated = await forceUpdateMatchStatusByTime();
    const settled = await checkAndSettleAllFinishedMatches();
    console.log(`✅ Sync complete: ${live} live, ${upcoming} upcoming, ${forceUpdated} force-updated, ${settled} settled`);
    return { live, upcoming, forceUpdated, settled };
}

// ===== DATA RETRIEVAL HELPERS =====
async function getMatchesByDateRange(startDate, endDate) { if (!firebase?.firestore) return []; const db = firebase.firestore(); const m=[]; try { const s = await db.collection('sports_matches').where('status','==','upcoming').where('startTime','>=',startDate).where('startTime','<=',endDate).orderBy('startTime').get(); s.forEach(d=>m.push(d.data())); } catch(e){} return m; }
async function getMatchesByLeague(leagueId) { if (!firebase?.firestore) return []; const db = firebase.firestore(); const m=[]; try { const s = await db.collection('sports_matches').where('leagueId','==',leagueId).where('status','in',['upcoming','live']).orderBy('startTime').limit(50).get(); s.forEach(d=>m.push(d.data())); } catch(e){} return m; }
async function getUserActiveBets(userId) { if (!firebase?.firestore) return []; const db = firebase.firestore(); const b=[]; try { const s = await db.collection('bets').where('userId','==',userId).where('status','==','active').orderBy('placedAt','desc').get(); s.forEach(d=>b.push({id:d.id,...d.data()})); } catch(e){} return b; }
async function getUserBetHistory(userId, limit=50) { if (!firebase?.firestore) return []; const db = firebase.firestore(); const b=[]; try { const s = await db.collection('bets').where('userId','==',userId).orderBy('placedAt','desc').limit(limit).get(); s.forEach(d=>b.push({id:d.id,...d.data()})); } catch(e){} return b; }
async function getUserBettingStats(userId) { if (!firebase?.firestore) return { total:0,won:0,lost:0,active:0,totalStaked:0,totalReturns:0 }; const db = firebase.firestore(); try { const s = await db.collection('bets').where('userId','==',userId).get(); const st={ total:0,won:0,lost:0,active:0,cancelled:0,totalStaked:0,totalReturns:0 }; s.forEach(d=>{ const b=d.data(); st.total++; st.totalStaked+=b.amount||0; if(b.status==='won'){ st.won++; st.totalReturns+=b.payout||b.potentialWin||0; } else if(b.status==='lost') st.lost++; else if(b.status==='active') st.active++; else if(b.status==='cancelled') st.cancelled++; }); return st; } catch(e){ return { total:0,won:0,lost:0,active:0,totalStaked:0,totalReturns:0 }; } }

// ===== AUTO SYNC =====
let syncInterval = null;
let forceUpdateInterval = null;

function startAutoSync(seconds = 60) {
    if (syncInterval) clearInterval(syncInterval);
    if (forceUpdateInterval) clearInterval(forceUpdateInterval);
    
    syncAllMatches();
    syncInterval = setInterval(() => syncAllMatches(), seconds * 1000);
    
    // Force status update every 30 seconds (fixes stuck matches)
    forceUpdateInterval = setInterval(() => forceUpdateMatchStatusByTime(), 30000);
    
    console.log(`⏰ Auto-sync every ${seconds}s | Force update every 30s`);
}

function stopAutoSync() {
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    if (forceUpdateInterval) { clearInterval(forceUpdateInterval); forceUpdateInterval = null; }
}

// ===== EXPORTS =====
window.syncNow = syncAllMatches;
window.testAPI = testAPIConnection;
window.cleanupNow = cleanupOldMatches;
window.settleNow = checkAndSettleAllFinishedMatches;
window.settleBetsForMatch = settleBetsForMatch;
window.forceUpdateStatus = forceUpdateMatchStatusByTime;
window.clearCache = () => localStorage.clear();

window.getMatchesByDateRange = getMatchesByDateRange;
window.getMatchesByLeague = getMatchesByLeague;
window.getUserActiveBets = getUserActiveBets;
window.getUserBetHistory = getUserBetHistory;
window.getUserBettingStats = getUserBettingStats;

window.formatMatchDate = formatMatchDate;
window.formatMatchTime = formatMatchTime;
window.getMinutesUntilKickoff = getMinutesUntilKickoff;
window.getMatchMinute = getMatchMinute;

if (document.readyState === 'complete') startAutoSync(60);
else window.addEventListener('load', () => startAutoSync(60));

console.log('🏈 Sports API v20.0 | Force Status Update Active');
