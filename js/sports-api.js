// ============================================
// js/sports-api.js - v30.0 FULL BET TYPES
// Fixed sync + Added odds/events support
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';
const SYNC_INTERVAL = 120000;
const FORCE_UPDATE_INTERVAL = 60000;

// ===== FETCH =====
async function fetchFromBackend(endpoint) {
    try {
        const url = BACKEND_URL + endpoint;
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return await response.json();
    } catch(e) { console.error('Fetch error:', e.message); return { success: false, data: [] }; }
}

async function fetchLiveMatches() { return await fetchFromBackend('/api/livescores'); }
async function fetchUpcomingWeek() { return await fetchFromBackend('/api/fixtures/week'); }
async function fetchLeagues() { return await fetchFromBackend('/api/leagues'); }

// 🆕 NEW: Fetch odds for a fixture
async function fetchOdds(fixtureId) { return await fetchFromBackend('/api/odds/' + fixtureId); }

// 🆕 NEW: Fetch match events (cards, corners, penalties)
async function fetchMatchEvents(fixtureId) { return await fetchFromBackend('/api/fixtures/events/' + fixtureId); }

// 🆕 NEW: Fetch match statistics
async function fetchMatchStats(fixtureId) { return await fetchFromBackend('/api/fixtures/statistics/' + fixtureId); }

// 🆕 NEW: Fetch predictions
async function fetchPredictions(fixtureId) { return await fetchFromBackend('/api/predictions/' + fixtureId); }

// 🆕 NEW: Fetch H2H
async function fetchH2H(team1, team2) { return await fetchFromBackend('/api/fixtures/h2h/' + team1 + '/' + team2); }

// ===== STATUS =====
function getMatchStatus(match) {
    const s = match.fixture?.status?.short;
    if (!s || s === 'TBD' || s === 'NS') return 'upcoming';
    if (['1H','HT','2H','ET','P','LIVE'].includes(s)) return 'live';
    if (['FT','AET','PEN'].includes(s)) return 'finished';
    return 'upcoming';
}

function calculateOdds(home, away) {
    let h = 0; const s = home + away;
    for (let i=0; i<s.length; i++) h += s.charCodeAt(i);
    return { home: +(1.8+(h%20)/100).toFixed(2), draw: +(3.2+(h%15)/100).toFixed(2), away: +(2.8+(h%25)/100).toFixed(2) };
}

// ===== HELPERS =====
function formatCountdown(t) { if(!t) return '00:00:00'; const d=new Date(t)-new Date(); if(d<=0) return '00:00:00'; const h=Math.floor(d/3600000),m=Math.floor((d%3600000)/60000),s=Math.floor((d%60000)/1000); return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; }
function getLiveTimer(t) { if(!t) return 'LIVE'; try { const d=Math.floor((new Date()-(t.toDate?t.toDate():new Date(t)))/60000); if(d<45) return `1st Half • ${d}'`; if(d<60) return `HT • ${d}'`; if(d<105) return `2nd Half • ${d-15}'`; return "90+'"; } catch(e) { return 'LIVE'; } }
function getMatchMinute(t) { if(!t) return 45; try { return Math.floor((new Date()-(t.toDate?t.toDate():new Date(t)))/60000); } catch(e) { return 45; } }
function getTodayRange() { const t=new Date(); t.setHours(0,0,0,0); return {start:t, end:new Date(t.getTime()+86400000-1)}; }
function getTomorrowRange() { const t=new Date(); t.setDate(t.getDate()+1); t.setHours(0,0,0,0); return {start:t, end:new Date(t.getTime()+86400000-1)}; }
function getCancelFee(t) { if(!t) return 100; const m=Math.floor(((t.toDate?t.toDate():new Date(t))-new Date())/60000); if(m<0) return 100; if(m<5) return 50; if(m<60) return 20; return 5; }
function getCashoutFee(m) { if(m<15) return 15; if(m<30) return 20; if(m<60) return 25; if(m<80) return 30; return 35; }

let cachedLeagues = [];
async function getLeagues() { if(cachedLeagues.length) return cachedLeagues; const d=await fetchLeagues(); if(d?.success&&d.data) cachedLeagues=d.data.sort((a,b)=>(a.name||'').localeCompare(b.name||'')); return cachedLeagues; }

// ===== SYNC (FIXED) =====
async function syncMatchToFirestore(match) {
    if (!firebase?.firestore) return false;
    const db = firebase.firestore();
    const f = match.fixture||{}, t = match.teams||{}, g = match.goals||{}, l = match.league||{}, id = f.id;
    if (!id) return false;
    
    // 🔥 FIX: Allow matches even without team names (use IDs)
    const homeName = t.home?.name || ('Team ' + (t.home?.id || 'Home'));
    const awayName = t.away?.name || ('Team ' + (t.away?.id || 'Away'));
    
    const status = getMatchStatus(match);
    const odds = calculateOdds(homeName, awayName);
    let result = null, expiresAt = null;
    if (status === 'finished') { const hg=g.home||0, ag=g.away||0; result=hg>ag?'home':hg<ag?'away':'draw'; expiresAt=new Date(); expiresAt.setHours(expiresAt.getHours()+24); }
    
    const data = {
        fixtureId: id, status, odds, result, expiresAt,
        leagueId: l.id||0, leagueName: l.name||'Unknown League',
        homeTeam: { id: t.home?.id||0, name: homeName, logo: t.home?.logo||'' },
        awayTeam: { id: t.away?.id||0, name: awayName, logo: t.away?.logo||'' },
        startTime: f.date ? new Date(f.date) : new Date(),
        score: { home: g.home||0, away: g.away||0 },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        const ref = db.collection('sports_matches').doc(String(id));
        const old = await ref.get(); const oldStatus = old.exists ? old.data().status : null;
        await ref.set(data, { merge: true });
        if (oldStatus && oldStatus !== 'finished' && status === 'finished') {
            console.log(`🏁 Auto-settling: ${homeName} vs ${awayName}`);
            await settleBetsForMatch(id, result);
        }
        return true;
    } catch(e) { return false; }
}

async function syncLiveMatches() { const d=await fetchLiveMatches(); if(!d?.success||!d.data) return 0; let s=0; for(const m of d.data.slice(0,15)) if(await syncMatchToFirestore(m)) s++; return s; }
async function syncUpcomingMatches() { const d=await fetchUpcomingWeek(); if(!d?.success||!d.data) return 0; let s=0; for(const m of d.data.slice(0,30)) if(await syncMatchToFirestore(m)) s++; return s; }
async function syncAllMatches() { const live=await syncLiveMatches(); const upcoming=await syncUpcomingMatches(); console.log(`✅ Live: ${live}, Upcoming: ${upcoming}`); return {live, upcoming}; }

// ===== SETTLEMENT =====
async function settleBetsForMatch(fixtureId, result) {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore(); let settled = 0;
    try {
        const bets = await db.collection('bets').where('fixtureId','==',fixtureId).where('status','==','active').get();
        for (const doc of bets.docs) {
            const bet = doc.data(); let won = false;
            
            // 🆕 Check different bet types
            if (bet.betType === 'home' || bet.betType === 'draw' || bet.betType === 'away') {
                won = bet.betType === result;
            } else if (bet.betType === 'over25' || bet.betType === 'under25') {
                const totalGoals = (bet.matchScore?.home || 0) + (bet.matchScore?.away || 0);
                won = (bet.betType === 'over25' && totalGoals > 2.5) || (bet.betType === 'under25' && totalGoals < 2.5);
            } else if (bet.betType === 'btts_yes' || bet.betType === 'btts_no') {
                const bothScored = (bet.matchScore?.home > 0 && bet.matchScore?.away > 0);
                won = (bet.betType === 'btts_yes' && bothScored) || (bet.betType === 'btts_no' && !bothScored);
            }
            
            if (won) { const w = await db.collection('wallets').doc(bet.userId).get(); await w.ref.update({ balance: (w.data()?.balance||0) + bet.potentialWin }); await doc.ref.update({ status:'won', result, payout:bet.potentialWin, settledAt:new Date() }); }
            else { await doc.ref.update({ status:'lost', result, payout:0, settledAt:new Date() }); }
            settled++;
        }
        if (settled > 0) await db.collection('sports_matches').doc(String(fixtureId)).update({ betsSettled: true });
    } catch(e) {}
    return settled;
}

async function settleAllFinishedMatches() {
    if (!firebase?.firestore) return 0;
    const db = firebase.firestore(); let total = 0;
    try {
        const finished = await db.collection('sports_matches').where('status','==','finished').get();
        for (const doc of finished.docs) {
            const m = doc.data(); if (m.betsSettled) continue;
            let r = m.result; if (!r) { const h=m.score?.home||0, a=m.score?.away||0; r = h>a?'home':h<a?'away':'draw'; }
            total += await settleBetsForMatch(m.fixtureId, r);
        }
    } catch(e) {}
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

let syncInterval, forceInterval;
function startAutoSync() { if(syncInterval)clearInterval(syncInterval); if(forceInterval)clearInterval(forceInterval); syncAllMatches(); syncInterval=setInterval(syncAllMatches,SYNC_INTERVAL); forceInterval=setInterval(forceUpdateStatus,FORCE_UPDATE_INTERVAL); }

// ===== EXPORTS =====
window.syncNow = syncAllMatches;
window.forceUpdate = forceUpdateStatus;
window.settleNow = settleAllFinishedMatches;
window.settleAllFinishedMatches = settleAllFinishedMatches;
window.getLeagues = getLeagues;
window.formatCountdown = formatCountdown;
window.getLiveTimer = getLiveTimer;
window.getMatchMinute = getMatchMinute;
window.getTodayRange = getTodayRange;
window.getTomorrowRange = getTomorrowRange;
window.getCancelFee = getCancelFee;
window.getCashoutFee = getCashoutFee;
window.settleBetsForMatch = settleBetsForMatch;
window.fetchOdds = fetchOdds;
window.fetchMatchEvents = fetchMatchEvents;
window.fetchMatchStats = fetchMatchStats;
window.fetchPredictions = fetchPredictions;
window.fetchH2H = fetchH2H;

setTimeout(() => { syncAllMatches(); startAutoSync(); }, 500);
console.log('🏈 Sports API v30.0 - Full Bet Types Ready');
