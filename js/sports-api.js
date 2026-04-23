// ============================================
// js/sports-api.js - v28.1 ENHANCED
// Based on your working v28.0 + Settlement Fixes
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';
const SYNC_INTERVAL = 60000;
const FORCE_UPDATE_INTERVAL = 30000;

// ===== FETCH WITH TIMEOUT =====
async function fetchFromBackend(endpoint, retries = 2) {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const url = BACKEND_URL + endpoint;
            console.log(`🔄 Fetching: ${endpoint}`);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            console.log(`✅ ${endpoint}: ${data.data?.length || 0} items`);
            return data;
        } catch (error) {
            console.warn(`⚠️ Attempt ${i+1} failed for ${endpoint}:`, error.message);
            if (i === retries - 1) return { success: false, data: [], error: error.message };
            await new Promise(r => setTimeout(r, 2000));
        }
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
    
    console.log(`📅 Fetching upcoming: ${from} to ${to}`);
    let result = await fetchFromBackend('/api/fixtures/between/' + from + '/' + to);
    
    if (!result.success || !result.data || result.data.length === 0) {
        console.log('⚠️ Between endpoint failed, trying individual dates...');
        let allMatches = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            const dayResult = await fetchFromBackend('/api/fixtures/date/' + dateStr);
            if (dayResult.success && dayResult.data) {
                allMatches = allMatches.concat(dayResult.data);
            }
            await new Promise(r => setTimeout(r, 500));
        }
        if (allMatches.length > 0) {
            return { success: true, data: allMatches };
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
        const docRef = db.collection('sports_matches').doc(String(fixtureId));
        const oldDoc = await docRef.get();
        const oldStatus = oldDoc.exists ? oldDoc.data().status : null;
        await docRef.set(matchData, { merge: true });
        console.log(`📝 Synced: ${teams.home.name} vs ${teams.away.name} (${status})`);
        
        // 🆕 ENHANCEMENT: Auto-settle if match just became finished
        if (oldStatus && oldStatus !== 'finished' && status === 'finished') {
            console.log(`🏁 Auto-settling: ${teams.home.name} vs ${teams.away.name}`);
            await settleBetsForMatch(fixtureId, result);
        }
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
    console.log(`📅 Found ${data.data.length} upcoming matches`);
    let synced = 0;
    for (const m of data.data) if (await syncMatchToFirestore(m)) synced++;
    return synced;
}

async function syncAllMatches() {
    console.log('🚀 Starting sync...');
    const live = await syncLiveMatches();
    const upcoming = await syncUpcomingMatches();
    console.log(`✅ Live: ${live}, Upcoming: ${upcoming}`);
    return { live, upcoming };
}

// ===== SETTLEMENT (ENHANCED) =====
async function settleBetsForMatch(fixtureId, result) {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    let settled = 0;
    try {
        // Settle single bets
        const bets = await db.collection('bets')
            .where('fixtureId', '==', fixtureId)
            .where('status', '==', 'active')
            .get();
        
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
        
        // 🆕 ENHANCEMENT: Settle accumulator bets containing this match
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
                    await walletRef.update({ balance: (walletDoc.data()?.balance || 0) + bet.potentialWin });
                    await doc.ref.update({ status: 'won', payout: bet.potentialWin, settledAt: new Date() });
                } else {
                    await doc.ref.update({ status: 'lost', payout: 0, settledAt: new Date() });
                }
                settled++;
            }
        }
        
        if (settled > 0) {
            await db.collection('sports_matches').doc(String(fixtureId)).update({ betsSettled: true });
            console.log(`💰 Settled ${settled} bets for fixture ${fixtureId}`);
        }
    } catch(e) { console.error('Settlement error:', e); }
    return settled;
}

// 🆕 ENHANCEMENT: Settle all finished matches (called by forceUpdate)
async function settleAllFinishedMatches() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    let total = 0;
    try {
        const finished = await db.collection('sports_matches')
            .where('status', '==', 'finished')
            .where('betsSettled', '==', false)
            .get();
        
        console.log(`🔍 Found ${finished.size} unsettled finished matches`);
        
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

async function forceUpdateStatus() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore();
    const now = new Date();
    let updated = 0;
    
    try {
        // Update upcoming → live
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
        
        // 🆕 ENHANCEMENT: Auto-settle all finished matches
        const settled = await settleAllFinishedMatches();
        if (settled > 0) console.log(`✅ Force update settled ${settled} bets`);
        
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
    
    console.log(`⏰ Auto-sync started (Sync:${SYNC_INTERVAL/1000}s, Force:${FORCE_UPDATE_INTERVAL/1000}s)`);
}

// ===== MANUAL TRIGGERS =====
async function manualSync() {
    return await syncAllMatches();
}

async function manualSettle() {
    return await settleAllFinishedMatches();
}

// ===== EXPORTS =====
window.syncNow = manualSync;
window.forceUpdate = forceUpdateStatus;
window.settleNow = manualSettle;  // 🆕 ENHANCEMENT: Manual settlement trigger
window.getLeagues = getLeagues;
window.formatCountdown = formatCountdown;
window.getLiveTimer = getLiveTimer;
window.getMatchMinute = getMatchMinute;
window.getTodayRange = getTodayRange;
window.getTomorrowRange = getTomorrowRange;
window.getCancelFee = getCancelFee;
window.getCashoutFee = getCashoutFee;
window.settleBetsForMatch = settleBetsForMatch;
window.settleAllFinishedMatches = settleAllFinishedMatches;  // 🆕 ENHANCEMENT: Exported

// ===== AUTO-START =====
setTimeout(() => {
    manualSync();
    startAutoSync();
}, 500);

console.log('🏈 Sports API v28.1 - Enhanced with Auto-Settlement');
