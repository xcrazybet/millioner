// ============================================
// js/sports-api.js - v29.0 FULLY FUNCTIONED
// X Lodon Sports - Complete Sports API
// Auto-sync, Settlement, Cleanup, Cache, Live, Upcoming, Finished
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';
const SYNC_INTERVAL = 120000; // 2 minutes
const FORCE_UPDATE_INTERVAL = 60000; // 1 minute
const CLEANUP_INTERVAL = 3600000; // 1 hour

// ===== FETCH WITH TIMEOUT & RETRY =====
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
async function fetchLiveMatches() { return await fetchFromBackend('/api/livescores'); }
async function fetchUpcomingWeek() {
    const today = new Date();
    const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
    const from = today.toISOString().split('T')[0];
    const to = nextWeek.toISOString().split('T')[0];
    let result = await fetchFromBackend('/api/fixtures/between/' + from + '/' + to);
    if (!result.success || !result.data || result.data.length === 0) {
        let allMatches = [];
        for (let i = 0; i < 3; i++) {
            const date = new Date(today); date.setDate(today.getDate() + i);
            const dayResult = await fetchFromBackend('/api/fixtures/date/' + date.toISOString().split('T')[0]);
            if (dayResult.success && dayResult.data) allMatches = allMatches.concat(dayResult.data);
            await new Promise(r => setTimeout(r, 500));
        }
        if (allMatches.length > 0) return { success: true, data: allMatches };
    }
    return result;
}
async function fetchLeagues() { return await fetchFromBackend('/api/leagues'); }
async function fetchFixturesByDate(date) { return await fetchFromBackend('/api/fixtures/date/' + date); }
async function fetchFixtureById(fixtureId) { return await fetchFromBackend('/api/fixtures/' + fixtureId); }

// ===== STATUS & CALCULATIONS =====
function getMatchStatus(match) {
    const status = match.fixture?.status?.short;
    if (!status || status === 'TBD' || status === 'NS') return 'upcoming';
    if (['1H','HT','2H','ET','P','LIVE'].includes(status)) return 'live';
    if (['FT','AET','PEN'].includes(status)) return 'finished';
    if (status === 'CANC') return 'cancelled';
    if (status === 'PST') return 'postponed';
    const now = new Date(); const start = new Date(match.fixture?.date);
    if (now < start) return 'upcoming';
    return 'live';
}

function calculateOdds(homeName, awayName) {
    let hash = 0; const str = homeName + awayName;
    for (let i = 0; i < str.length; i++) hash += str.charCodeAt(i);
    return { home: +(1.8+(hash%20)/100).toFixed(2), draw: +(3.2+(hash%15)/100).toFixed(2), away: +(2.8+(hash%25)/100).toFixed(2) };
}

// ===== TIME HELPERS =====
function formatCountdown(startTime) {
    if (!startTime) return '00:00:00';
    const diff = new Date(startTime) - new Date();
    if (diff <= 0) return '00:00:00';
    const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function getLiveTimer(startTime) {
    if (!startTime) return 'LIVE';
    try { const diff = Math.floor((new Date() - (startTime.toDate?startTime.toDate():new Date(startTime)))/60000); if(diff<45) return `1st Half • ${diff}'`; if(diff<60) return `HT • ${diff}'`; if(diff<105) return `2nd Half • ${diff-15}'`; return "90+'"; } catch(e) { return 'LIVE'; }
}

function getMatchMinute(startTime) { if(!startTime) return 45; try { const d=Math.floor((new Date()-(startTime.toDate?startTime.toDate():new Date(startTime)))/60000); return d<1?1:d>90?90:d; } catch(e){return 45;} }
function getMinutesUntilKickoff(startTime) { if(!startTime) return 0; return Math.floor(((startTime.toDate?startTime.toDate():new Date(startTime))-new Date())/60000); }
function getTodayRange() { const t=new Date(); t.setHours(0,0,0,0); return {start:t, end:new Date(t.getTime()+86400000-1)}; }
function getTomorrowRange() { const t=new Date(); t.setDate(t.getDate()+1); t.setHours(0,0,0,0); return {start:t, end:new Date(t.getTime()+86400000-1)}; }
function getDateRange(days) { const t=new Date(); t.setHours(0,0,0,0); const e=new Date(t); e.setDate(t.getDate()+(days||7)); return {start:t, end:e}; }
function formatMatchDate(date) { if(!date) return ''; const d=date.toDate?date.toDate():new Date(date); return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); }
function formatMatchTime(date) { if(!date) return ''; const d=date.toDate?date.toDate():new Date(date); return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }

// ===== CANCELLATION & CASHOUT =====
function getCancelFee(matchStartTime) { if(!matchStartTime) return 100; const m=Math.floor(((matchStartTime.toDate?matchStartTime.toDate():new Date(matchStartTime))-new Date())/60000); if(m<0) return 100; if(m<5) return 50; if(m<60) return 20; return 5; }
function canCancel(matchStartTime) { if(!matchStartTime) return false; return new Date() < (matchStartTime.toDate?matchStartTime.toDate():new Date(matchStartTime)); }
function getCashoutFee(currentMinute) { if(currentMinute<15) return 15; if(currentMinute<30) return 20; if(currentMinute<60) return 25; if(currentMinute<80) return 30; return 35; }
function canCashout(matchStatus, currentMinute) { return matchStatus==='live' && currentMinute<90; }

// ===== CACHING =====
let cachedLeagues = [];
async function getLeagues() { if(cachedLeagues.length) return cachedLeagues; const d=await fetchLeagues(); if(d?.success&&d.data) cachedLeagues=d.data.sort((a,b)=>(a.name||'').localeCompare(b.name||'')); return cachedLeagues; }
function clearCache() { cachedLeagues=[]; localStorage.removeItem('cachedLeagues'); }

// ===== FIRESTORE SYNC =====
async function syncMatchToFirestore(match) {
    if (!firebase?.firestore) return false;
    const db = firebase.firestore();
    const f = match.fixture||{}, t = match.teams||{}, g = match.goals||{}, l = match.league||{}, id = f.id;
    if (!id||!t.home?.name||!t.away?.name) return false;
    
    const status = getMatchStatus(match);
    const odds = calculateOdds(t.home.name, t.away.name);
    let result = null, expiresAt = null;
    if (status === 'finished') { const hg=g.home||0, ag=g.away||0; result=hg>ag?'home':hg<ag?'away':'draw'; expiresAt=new Date(); expiresAt.setHours(expiresAt.getHours()+24); }
    
    const matchData = {
        fixtureId: id, status, odds, result, expiresAt,
        leagueId: l.id||0, leagueName: l.name||'Unknown League',
        homeTeam: { id: t.home.id||0, name: t.home.name, logo: t.home.logo||'' },
        awayTeam: { id: t.away.id||0, name: t.away.name, logo: t.away.logo||'' },
        startTime: f.date ? new Date(f.date) : new Date(),
        score: { home: g.home||0, away: g.away||0 },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        isRealData: true
    };
    
    try {
        const docRef = db.collection('sports_matches').doc(String(id));
        const oldDoc = await docRef.get();
        const oldStatus = oldDoc.exists ? oldDoc.data().status : null;
        await docRef.set(matchData, { merge: true });
        
        // Auto-settle when match becomes finished
        if (oldStatus && oldStatus !== 'finished' && status === 'finished') {
            console.log(`🏁 Auto-settling: ${t.home.name} vs ${t.away.name} (${result})`);
            await settleBetsForMatch(id, result);
        }
        
        console.log(`📝 ${t.home.name} vs ${t.away.name} (${status})`);
        return true;
    } catch(e) { console.error('Sync error:', e); return false; }
}

async function syncLiveMatches() { const d=await fetchLiveMatches(); if(!d?.success||!d.data) return 0; let s=0; for(const m of d.data.slice(0,15)) if(await syncMatchToFirestore(m)) s++; return s; }
async function syncUpcomingMatches() { const d=await fetchUpcomingWeek(); if(!d?.success||!d.data) return 0; let s=0; for(const m of d.data.slice(0,20)) if(await syncMatchToFirestore(m)) s++; return s; }

async function syncAllMatches() {
    console.log('🚀 Starting sync...');
    const live = await syncLiveMatches();
    const upcoming = await syncUpcomingMatches();
    console.log(`✅ Live: ${live}, Upcoming: ${upcoming}`);
    return { live, upcoming };
}

// ===== CLEANUP =====
async function cleanupOldMatches() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore(); const now = new Date(); let deleted = 0;
    try {
        const snap = await db.collection('sports_matches').get();
        const toDelete = [];
        snap.forEach(d => {
            const m = d.data();
            if (m.fixtureId>=1000000) { toDelete.push(d.ref); return; }
            if (m.status==='upcoming') { const mt=m.startTime?.toDate(); if(mt&&mt<new Date(now.getTime()-6*60*60*1000)) toDelete.push(d.ref); }
            if (m.status==='finished'&&m.expiresAt) { const ea=m.expiresAt.toDate?m.expiresAt.toDate():new Date(m.expiresAt); if(ea<now) toDelete.push(d.ref); }
        });
        if (toDelete.length) { const batch=db.batch(); toDelete.forEach(r=>batch.delete(r)); await batch.commit(); deleted=toDelete.length; console.log(`🧹 Deleted ${deleted} old matches`); }
    } catch(e) { console.error('Cleanup error:', e); }
    return deleted;
}

// ===== SETTLEMENT =====
async function settleBetsForMatch(fixtureId, result) {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore(); let settled = 0;
    try {
        const bets = await db.collection('bets').where('fixtureId','==',fixtureId).where('status','==','active').get();
        for (const doc of bets.docs) {
            const bet = doc.data(); const won = bet.betType === result;
            if (won) { const w = await db.collection('wallets').doc(bet.userId).get(); await w.ref.update({ balance: (w.data()?.balance||0) + bet.potentialWin }); await doc.ref.update({ status:'won', result, payout:bet.potentialWin, settledAt:new Date() }); }
            else { await doc.ref.update({ status:'lost', result, payout:0, settledAt:new Date() }); }
            settled++;
        }
        if (settled > 0) await db.collection('sports_matches').doc(String(fixtureId)).update({ betsSettled: true, result });
    } catch(e) { console.error('Settlement error:', e); }
    return settled;
}

async function settleAllFinishedMatches() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore(); let total = 0;
    try {
        const finished = await db.collection('sports_matches').where('status','==','finished').get();
        console.log(`🔍 Checking ${finished.size} finished matches for settlement...`);
        for (const doc of finished.docs) {
            const m = doc.data();
            if (m.betsSettled === true) continue;
            let r = m.result; if (!r) { const h=m.score?.home||0, a=m.score?.away||0; r = h>a?'home':h<a?'away':'draw'; }
            const bets = await db.collection('bets').where('fixtureId','==',m.fixtureId).where('status','==','active').get();
            if (!bets.empty) { total += await settleBetsForMatch(m.fixtureId, r); }
            else { await doc.ref.update({ betsSettled: true, result: r }); }
        }
        console.log(`✅ Settled ${total} bets`);
    } catch(e) { console.error('Settle all error:', e); }
    return total;
}

async function forceUpdateStatus() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore(); const now = new Date(); let updated = 0;
    try {
        const snap = await db.collection('sports_matches').where('status','==','upcoming').limit(20).get();
        const batch = db.batch();
        snap.forEach(d => { const m=d.data(); if((m.startTime?.toDate?m.startTime.toDate():new Date(m.startTime))<=now) { batch.update(d.ref, {status:'live'}); updated++; } });
        if(updated) await batch.commit();
        await settleAllFinishedMatches();
    } catch(e) {}
    return updated;
}

// ===== AUTO SYSTEM =====
let syncInterval, forceInterval, cleanupInterval;
function startAutoSync() {
    if(syncInterval)clearInterval(syncInterval);
    if(forceInterval)clearInterval(forceInterval);
    if(cleanupInterval)clearInterval(cleanupInterval);
    syncAllMatches();
    syncInterval=setInterval(syncAllMatches,SYNC_INTERVAL);
    forceInterval=setInterval(forceUpdateStatus,FORCE_UPDATE_INTERVAL);
    cleanupInterval=setInterval(cleanupOldMatches,CLEANUP_INTERVAL);
    console.log(`⏰ Auto-system: Sync ${SYNC_INTERVAL/1000}s | Force ${FORCE_UPDATE_INTERVAL/1000}s | Cleanup ${CLEANUP_INTERVAL/3600000}h`);
}
function stopAutoSync() { if(syncInterval)clearInterval(syncInterval); if(forceInterval)clearInterval(forceInterval); if(cleanupInterval)clearInterval(cleanupInterval); }

// ===== MANUAL TRIGGERS =====
async function manualSync() { return await syncAllMatches(); }
async function manualSettle() { return await settleAllFinishedMatches(); }
async function manualCleanup() { return await cleanupOldMatches(); }

// ===== EXPORTS =====
window.syncNow = manualSync;
window.forceUpdate = forceUpdateStatus;
window.settleNow = manualSettle;
window.cleanupNow = manualCleanup;
window.getLeagues = getLeagues;
window.clearCache = clearCache;
window.formatCountdown = formatCountdown;
window.getLiveTimer = getLiveTimer;
window.getMatchMinute = getMatchMinute;
window.getMinutesUntilKickoff = getMinutesUntilKickoff;
window.getTodayRange = getTodayRange;
window.getTomorrowRange = getTomorrowRange;
window.getDateRange = getDateRange;
window.formatMatchDate = formatMatchDate;
window.formatMatchTime = formatMatchTime;
window.getCancelFee = getCancelFee;
window.canCancel = canCancel;
window.getCashoutFee = getCashoutFee;
window.canCashout = canCashout;
window.settleBetsForMatch = settleBetsForMatch;
window.settleAllFinishedMatches = settleAllFinishedMatches;

// ===== AUTO START =====
setTimeout(() => { manualSync(); startAutoSync(); }, 500);
console.log('╔════════════════════════════════════════════╗');
console.log('║   🏈 SPORTS API v29.0 - FULLY FUNCTIONED  ║');
console.log('║   ✅ Auto-sync: 2min                       ║');
console.log('║   ✅ Force update: 1min                    ║');
console.log('║   ✅ Cleanup: 1hr                          ║');
console.log('║   ✅ Settlement: Auto + Manual             ║');
console.log('║   💡 Commands: syncNow(), settleNow()     ║');
console.log('╚════════════════════════════════════════════╝');
