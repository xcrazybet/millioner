// ============================================
// js/sports-api.js - v27.0 FIXED
// Handles API failures gracefully
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';
const SYNC_INTERVAL = 60000;
const FORCE_UPDATE_INTERVAL = 30000;

// ===== FETCH WITH TIMEOUT & RETRY =====
async function fetchFromBackend(endpoint, retries = 2) {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const url = BACKEND_URL + endpoint;
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            return data;
        } catch (error) {
            console.warn(`⚠️ Fetch attempt ${i+1} failed for ${endpoint}:`, error.message);
            if (i === retries - 1) {
                console.error(`❌ All retries failed for ${endpoint}`);
                return { success: false, data: [], error: error.message };
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

// ===== FETCH FUNCTIONS WITH FALLBACK =====
async function fetchLiveMatches() { 
    return await fetchFromBackend('/api/livescores'); 
}

async function fetchUpcomingWeek() { 
    // Try the week endpoint
    const result = await fetchFromBackend('/api/fixtures/week');
    
    // If failed, try today's matches as fallback
    if (!result.success || !result.data || result.data.length === 0) {
        console.log('⚠️ Week endpoint failed, trying today...');
        const today = new Date().toISOString().split('T')[0];
        const todayResult = await fetchFromBackend('/api/fixtures/date/' + today);
        if (todayResult.success && todayResult.data) {
            return todayResult;
        }
    }
    return result;
}

async function fetchLeagues() { 
    return await fetchFromBackend('/api/leagues'); 
}

// ===== STATUS & CALCULATIONS =====
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

// ===== CANCELLATION & CASHOUT =====
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

function getCashoutFee(currentMinute) {
    if (currentMinute < 15) return 15;
    if (currentMinute < 30) return 20;
    if (currentMinute < 60) return 25;
    if (currentMinute < 80) return 30;
    return 35;
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
        expiresAt.setHours(expiresAt.getHours() + 24);
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
        await db.collection('sports_matches').doc(String(fixtureId)).set(matchData, { merge: true });
        return true;
    } catch(e) { return false; }
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
    for (const m of data.data.slice(0, 50)) if (await syncMatchToFirestore(m)) synced++;
    return synced;
}

async function syncAllMatches() {
    console.log('🚀 Syncing...');
    const live = await syncLiveMatches();
    const upcoming = await syncUpcomingMatches();
    console.log(`✅ Live: ${live}, Upcoming: ${upcoming}`);
    return { live, upcoming };
}

// ===== SETTLEMENT =====
async function settleBetsForMatch(fixtureId, result) {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    let settled = 0;
    try {
        const bets = await db.collection('bets').where('fixtureId', '==', fixtureId).where('status', '==', 'active').get();
        for (const doc of bets.docs) {
            const bet = doc.data();
            const won = bet.betType === result;
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
        await db.collection('sports_matches').doc(String(fixtureId)).update({ betsSettled: true });
    } catch(e) {}
    return settled;
}

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
    } catch(e) {}
    return updated;
}

// ===== AUTO-SYSTEM =====
let syncInterval = null;
let forceInterval = null;

function startAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
    if (forceInterval) clearInterval(forceInterval);
    
    syncAllMatches();
    
    syncInterval = setInterval(() => syncAllMatches(), SYNC_INTERVAL);
    forceInterval = setInterval(() => forceUpdateStatus(), FORCE_UPDATE_INTERVAL);
    
    console.log(`⏰ Auto-sync started`);
}

// ===== MANUAL TRIGGERS =====
async function manualSync() {
    return await syncAllMatches();
}

// ===== EXPORTS =====
window.syncNow = manualSync;
window.forceUpdate = forceUpdateStatus;
window.getLeagues = getLeagues;
window.formatCountdown = formatCountdown;
window.getLiveTimer = getLiveTimer;
window.getMatchMinute = getMatchMinute;
window.getTodayRange = getTodayRange;
window.getTomorrowRange = getTomorrowRange;
window.getCancelFee = getCancelFee;
window.getCashoutFee = getCashoutFee;
window.settleBetsForMatch = settleBetsForMatch;

// ===== AUTO-START =====
setTimeout(() => {
    manualSync();
    startAutoSync();
}, 500);

console.log('🏈 Sports API v27.0 - Fixed');
