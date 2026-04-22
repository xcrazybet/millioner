// ============================================
// js/sports-api.js - v26.0 COMPLETE REBUILD
// X Lodon Sports - Universal Sports API
// Works with ALL pages - No modifications needed
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';
const SYNC_INTERVAL = 60000;
const FORCE_UPDATE_INTERVAL = 30000;
const CLEANUP_INTERVAL = 3600000;
const MATCH_EXPIRY_HOURS = 24;
const UPCOMING_STALE_HOURS = 6;

// ===== API FETCHING =====
async function fetchFromBackend(endpoint) {
    try {
        const url = BACKEND_URL + endpoint;
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('❌ Fetch error:', error.message);
        return { success: false, data: [] };
    }
}

async function fetchLiveMatches() { return await fetchFromBackend('/api/livescores'); }
async function fetchUpcomingWeek() { return await fetchFromBackend('/api/fixtures/week'); }
async function fetchTodayMatches() { return await fetchFromBackend('/api/fixtures/today'); }
async function fetchLeagues() { return await fetchFromBackend('/api/leagues'); }
async function fetchFixturesByDate(date) { return await fetchFromBackend('/api/fixtures/date/' + date); }
async function fetchFixturesBetween(from, to) { return await fetchFromBackend('/api/fixtures/between/' + from + '/' + to); }

// ===== STATUS & CALCULATIONS =====
function getMatchStatus(match) {
    const status = match.fixture?.status?.short;
    if (!status || status === 'TBD' || status === 'NS') return 'upcoming';
    if (['1H','HT','2H','ET','P','LIVE'].includes(status)) return 'live';
    if (['FT','AET','PEN'].includes(status)) return 'finished';
    if (status === 'CANC') return 'cancelled';
    if (status === 'PST') return 'postponed';
    const now = new Date();
    const start = new Date(match.fixture?.date);
    if (now < start) return 'upcoming';
    return 'live';
}

function calculateOdds(homeName, awayName) {
    let hash = 0;
    const str = homeName + awayName;
    for (let i = 0; i < str.length; i++) hash += str.charCodeAt(i);
    return {
        home: Number((1.8 + (hash % 20) / 100).toFixed(2)),
        draw: Number((3.2 + (hash % 15) / 100).toFixed(2)),
        away: Number((2.8 + (hash % 25) / 100).toFixed(2))
    };
}

// ===== CANCELLATION & CASHOUT RULES =====
function getCancelFee(matchStartTime) {
    if (!matchStartTime) return 100;
    const now = new Date();
    const kickoff = matchStartTime.toDate ? matchStartTime.toDate() : new Date(matchStartTime);
    const minutesUntil = Math.floor((kickoff - now) / 60000);
    if (minutesUntil < 0) return 100;
    if (minutesUntil < 5) return 50;
    if (minutesUntil < 60) return 20;
    return 5;
}

function canCancel(matchStartTime) {
    if (!matchStartTime) return false;
    const now = new Date();
    const kickoff = matchStartTime.toDate ? matchStartTime.toDate() : new Date(matchStartTime);
    return now < kickoff;
}

function getCashoutFee(currentMinute) {
    if (currentMinute < 15) return 15;
    if (currentMinute < 30) return 20;
    if (currentMinute < 60) return 25;
    if (currentMinute < 80) return 30;
    return 35;
}

function canCashout(matchStatus, currentMinute) {
    return matchStatus === 'live' && currentMinute < 90;
}

// ===== TIME HELPERS =====
function formatCountdown(startTime) {
    if (!startTime) return '00:00:00';
    const diff = new Date(startTime) - new Date();
    if (diff <= 0) return '00:00:00';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function getLiveTimer(startTime) {
    if (!startTime) return 'LIVE';
    try {
        const now = new Date();
        const start = startTime.toDate ? startTime.toDate() : new Date(startTime);
        const diff = Math.floor((now - start) / 60000);
        if (diff < 45) return `1st Half • ${diff}'`;
        if (diff < 60) return `HT • ${diff}'`;
        if (diff < 105) return `2nd Half • ${diff - 15}'`;
        return `90+'`;
    } catch(e) { return 'LIVE'; }
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
    } catch(e) { return 45; }
}

function getMinutesUntilKickoff(startTime) {
    if (!startTime) return 0;
    const now = new Date();
    const kickoff = startTime.toDate ? startTime.toDate() : new Date(startTime);
    return Math.floor((kickoff - now) / 60000);
}

// ===== DATE HELPERS =====
function formatMatchDate(date) {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMatchTime(date) {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getDateRange(days) {
    const today = new Date(); today.setHours(0,0,0,0);
    const end = new Date(today); end.setDate(today.getDate() + (days || 7));
    return { start: today, end: end };
}

function getTodayRange() {
    const today = new Date(); today.setHours(0,0,0,0);
    const end = new Date(today); end.setHours(23,59,59,999);
    return { start: today, end: end };
}

function getTomorrowRange() {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0,0,0,0);
    const end = new Date(tomorrow); end.setHours(23,59,59,999);
    return { start: tomorrow, end: end };
}

// ===== CACHING =====
let cachedLeagues = [];
async function getLeagues() {
    if (cachedLeagues.length > 0) return cachedLeagues;
    const data = await fetchLeagues();
    if (data && data.success && data.data) {
        cachedLeagues = data.data.sort((a,b) => (a.name||'').localeCompare(b.name||''));
        return cachedLeagues;
    }
    return [];
}

function clearCache() {
    cachedLeagues = [];
    console.log('🧹 Cache cleared');
}

// ===== FIRESTORE SYNC =====
async function syncMatchToFirestore(match) {
    if (!firebase?.firestore) return false;
    const db = firebase.firestore();
    const fixture = match.fixture || {};
    const teams = match.teams || {};
    const goals = match.goals || {};
    const league = match.league || {};
    const fixtureId = fixture.id;
    if (!fixtureId) return false;
    if (!teams.home?.name || !teams.away?.name) return false;
    
    const status = getMatchStatus(match);
    const odds = calculateOdds(teams.home.name, teams.away.name);
    let result = null;
    if (status === 'finished') {
        const hg = goals.home || 0;
        const ag = goals.away || 0;
        result = hg > ag ? 'home' : (hg < ag ? 'away' : 'draw');
    }
    let expiresAt = null;
    if (status === 'finished') {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + MATCH_EXPIRY_HOURS);
    }
    
    const matchData = {
        fixtureId, status, odds, result, expiresAt,
        leagueId: league.id || 0,
        leagueName: league.name || 'Unknown League',
        homeTeam: { id: teams.home.id || 0, name: teams.home.name, logo: teams.home.logo || '' },
        awayTeam: { id: teams.away.id || 0, name: teams.away.name, logo: teams.away.logo || '' },
        startTime: fixture.date ? new Date(fixture.date) : new Date(),
        score: { home: goals.home || 0, away: goals.away || 0 },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        const docRef = db.collection('sports_matches').doc(String(fixtureId));
        const oldDoc = await docRef.get();
        const oldStatus = oldDoc.exists ? oldDoc.data().status : null;
        await docRef.set(matchData, { merge: true });
        
        if (oldStatus && oldStatus !== 'finished' && status === 'finished') {
            console.log(`🏁 ${teams.home.name} vs ${teams.away.name} - Auto-settling...`);
            await settleBetsForMatch(fixtureId, result);
        }
        return true;
    } catch(e) {
        console.error('Sync error:', e);
        return false;
    }
}

async function syncLiveMatches() {
    const data = await fetchLiveMatches();
    if (!data?.success || !data.data) return 0;
    let synced = 0;
    for (const m of data.data) if (await syncMatchToFirestore(m)) synced++;
    return synced;
}

async function syncUpcomingMatches() {
    const data = await fetchUpcomingWeek();
    if (!data?.success || !data.data) return 0;
    let synced = 0;
    const limit = Math.min(data.data.length, 100);
    for (let i = 0; i < limit; i++) if (await syncMatchToFirestore(data.data[i])) synced++;
    return synced;
}

async function syncAllMatches() {
    console.log('🚀 Starting full sync...');
    const live = await syncLiveMatches();
    const upcoming = await syncUpcomingMatches();
    console.log(`✅ Live: ${live}, Upcoming: ${upcoming}`);
    return { live, upcoming };
}

// ===== AUTO-SETTLEMENT =====
async function settleSingleBets(fixtureId, result) {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    let settled = 0;
    try {
        const bets = await db.collection('bets')
            .where('fixtureId', '==', fixtureId)
            .where('status', '==', 'active')
            .where('betCategory', '==', 'single')
            .get();
        
        for (const doc of bets.docs) {
            const bet = doc.data();
            const won = bet.betType === result;
            if (won) {
                const walletRef = db.collection('wallets').doc(bet.userId);
                const walletDoc = await walletRef.get();
                const balance = walletDoc.exists ? walletDoc.data().balance : 0;
                await walletRef.update({ balance: balance + bet.potentialWin });
                await doc.ref.update({ status: 'won', result, payout: bet.potentialWin, settledAt: new Date() });
            } else {
                await doc.ref.update({ status: 'lost', result, payout: 0, settledAt: new Date() });
            }
            settled++;
        }
    } catch(e) { console.error('Single settlement error:', e); }
    return settled;
}

async function settleAccumulatorBets(fixtureId, result) {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    let settled = 0;
    try {
        const accBets = await db.collection('bets')
            .where('status', '==', 'active')
            .where('betCategory', '==', 'accumulator')
            .get();
        
        for (const doc of accBets.docs) {
            const bet = doc.data();
            const hasMatch = bet.selections?.some(s => s.fixtureId === fixtureId);
            if (!hasMatch) continue;
            
            let allFinished = true;
            let allWon = true;
            for (const sel of bet.selections) {
                const m = await db.collection('sports_matches').doc(String(sel.fixtureId)).get();
                if (!m.exists) { allFinished = false; break; }
                const mData = m.data();
                if (mData.status !== 'finished') { allFinished = false; break; }
                if (mData.result !== sel.betType) { allWon = false; }
            }
            
            if (allFinished) {
                if (allWon) {
                    const walletRef = db.collection('wallets').doc(bet.userId);
                    const walletDoc = await walletRef.get();
                    const balance = walletDoc.exists ? walletDoc.data().balance : 0;
                    await walletRef.update({ balance: balance + bet.potentialWin });
                    await doc.ref.update({ status: 'won', payout: bet.potentialWin, settledAt: new Date() });
                } else {
                    await doc.ref.update({ status: 'lost', payout: 0, settledAt: new Date() });
                }
                settled++;
            }
        }
    } catch(e) { console.error('Accumulator settlement error:', e); }
    return settled;
}

async function settleBetsForMatch(fixtureId, result) {
    const single = await settleSingleBets(fixtureId, result);
    const acc = await settleAccumulatorBets(fixtureId, result);
    if (firebase?.firestore) {
        await firebase.firestore().collection('sports_matches').doc(String(fixtureId))
            .update({ betsSettled: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    console.log(`💰 Settled ${single} single + ${acc} accumulator bets`);
    return single + acc;
}

async function settleAllFinishedMatches() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    let total = 0;
    try {
        const finished = await db.collection('sports_matches')
            .where('status', '==', 'finished')
            .where('betsSettled', '==', false)
            .get();
        
        for (const doc of finished.docs) {
            const m = doc.data();
            let r = m.result;
            if (!r) {
                const h = m.score?.home || 0;
                const a = m.score?.away || 0;
                r = h > a ? 'home' : (h < a ? 'away' : 'draw');
            }
            total += await settleBetsForMatch(m.fixtureId, r);
        }
    } catch(e) { console.error('Settle all error:', e); }
    return total;
}

// ===== CLEANUP =====
async function cleanupOldMatches() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    const now = new Date();
    const staleTime = new Date(now.getTime() - UPCOMING_STALE_HOURS * 60 * 60 * 1000);
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
                if (matchTime && matchTime < staleTime) toDelete.push(doc.ref);
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
    } catch(e) { console.error('Cleanup error:', e); }
    return deleted;
}

// ===== FORCE UPDATE =====
async function forceUpdateStatus() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    const now = new Date();
    let updated = 0;
    
    try {
        const snapshot = await db.collection('sports_matches').where('status', '==', 'upcoming').get();
        const batch = db.batch();
        snapshot.forEach(doc => {
            const m = doc.data();
            const startTime = m.startTime?.toDate ? m.startTime.toDate() : new Date(m.startTime);
            if (startTime <= now) {
                batch.update(doc.ref, { status: 'live', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                updated++;
            }
        });
        if (updated > 0) await batch.commit();
        
        const finished = await db.collection('sports_matches')
            .where('status', '==', 'finished')
            .where('betsSettled', '==', false)
            .get();
        
        for (const doc of finished.docs) {
            const m = doc.data();
            let r = m.result;
            if (!r) {
                const h = m.score?.home || 0;
                const a = m.score?.away || 0;
                r = h > a ? 'home' : (h < a ? 'away' : 'draw');
            }
            await settleBetsForMatch(m.fixtureId, r);
        }
    } catch(e) { console.error('Force update error:', e); }
    return updated;
}

// ===== AUTO-SYSTEM =====
let syncInterval = null;
let forceInterval = null;
let cleanupInterval = null;

function startAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
    if (forceInterval) clearInterval(forceInterval);
    if (cleanupInterval) clearInterval(cleanupInterval);
    
    syncAllMatches();
    settleAllFinishedMatches();
    
    syncInterval = setInterval(async () => {
        await syncAllMatches();
        await settleAllFinishedMatches();
    }, SYNC_INTERVAL);
    
    forceInterval = setInterval(async () => {
        await forceUpdateStatus();
    }, FORCE_UPDATE_INTERVAL);
    
    cleanupInterval = setInterval(async () => {
        await cleanupOldMatches();
    }, CLEANUP_INTERVAL);
    
    console.log(`⏰ Auto-system started (Sync:${SYNC_INTERVAL/1000}s, Force:${FORCE_UPDATE_INTERVAL/1000}s)`);
}

function stopAutoSync() {
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    if (forceInterval) { clearInterval(forceInterval); forceInterval = null; }
    if (cleanupInterval) { clearInterval(cleanupInterval); cleanupInterval = null; }
    console.log('⏸️ Auto-system stopped');
}

// ===== MANUAL TRIGGERS =====
async function manualSync() {
    console.log('💪 Manual sync triggered...');
    await cleanupOldMatches();
    const result = await syncAllMatches();
    const settled = await settleAllFinishedMatches();
    console.log(`✅ Manual sync: ${result.live} live, ${result.upcoming} upcoming, ${settled} settled`);
    return { ...result, settled };
}

async function manualForceUpdate() {
    console.log('💪 Manual force update...');
    return await forceUpdateStatus();
}

async function manualSettle() {
    console.log('💪 Manual settlement...');
    return await settleAllFinishedMatches();
}

// ===== EXPORTS =====
window.syncNow = manualSync;
window.forceUpdate = manualForceUpdate;
window.settleNow = manualSettle;
window.clearCache = clearCache;

window.getLeagues = getLeagues;
window.formatCountdown = formatCountdown;
window.getLiveTimer = getLiveTimer;
window.getMatchMinute = getMatchMinute;
window.getMinutesUntilKickoff = getMinutesUntilKickoff;
window.formatMatchDate = formatMatchDate;
window.formatMatchTime = formatMatchTime;
window.getDateRange = getDateRange;
window.getTodayRange = getTodayRange;
window.getTomorrowRange = getTomorrowRange;
window.getCancelFee = getCancelFee;
window.canCancel = canCancel;
window.getCashoutFee = getCashoutFee;
window.canCashout = canCashout;

window.settleBetsForMatch = settleBetsForMatch;
window.settleAllFinishedMatches = settleAllFinishedMatches;

// ===== AUTO-START =====
setTimeout(() => {
    manualSync();
    startAutoSync();
}, 1000);

console.log('╔════════════════════════════════════════════╗');
console.log('║   🏈 SPORTS API v26.0 - REBUILT           ║');
console.log('║   ✅ Auto-sync: 60s                        ║');
console.log('║   ✅ Force update: 30s                     ║');
console.log('║   ✅ Single & Accumulator settlement       ║');
console.log('║   💡 Commands: syncNow(), forceUpdate()   ║');
console.log('╚════════════════════════════════════════════╝');
