// ============================================
// js/sports-api.js - v32.0 FORCE LIVE SYNC
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';
const SYNC_INTERVAL = 120000;
const FORCE_UPDATE_INTERVAL = 60000;

// ===== FETCH =====
async function fetchFromBackend(endpoint) {
    try { const r = await fetch(BACKEND_URL + endpoint); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch(e) { console.error('Fetch error:', e.message); return { success: false, data: [] }; }
}

async function fetchLiveMatches() { return await fetchFromBackend('/api/livescores'); }
async function fetchUpcomingWeek() { return await fetchFromBackend('/api/fixtures/week'); }
async function fetchLeagues() { return await fetchFromBackend('/api/leagues'); }
async function fetchOdds(fixtureId) { return await fetchFromBackend('/api/odds/' + fixtureId); }
async function fetchMatchEvents(fixtureId) { return await fetchFromBackend('/api/fixtures/events/' + fixtureId); }
async function fetchMatchStats(fixtureId) { return await fetchFromBackend('/api/fixtures/statistics/' + fixtureId); }
async function fetchPredictions(fixtureId) { return await fetchFromBackend('/api/predictions/' + fixtureId); }

// ===== STATUS =====
function getMatchStatus(m) { const s=m.fixture?.status?.short; if(!s||s==='TBD'||s==='NS') return 'upcoming'; if(['1H','HT','2H','ET','P','LIVE'].includes(s)) return 'live'; if(['FT','AET','PEN'].includes(s)) return 'finished'; return 'upcoming'; }

function calculateOdds(h,a) { let x=0; const s=h+a; for(let i=0;i<s.length;i++) x+=s.charCodeAt(i); return { home:+(1.8+(x%20)/100).toFixed(2), draw:+(3.2+(x%15)/100).toFixed(2), away:+(2.8+(x%25)/100).toFixed(2) }; }

// ===== HELPERS =====
function formatCountdown(t) { if(!t) return '00:00:00'; const d=new Date(t)-new Date(); if(d<=0) return '00:00:00'; const h=Math.floor(d/3600000),m=Math.floor((d%3600000)/60000),s=Math.floor((d%60000)/1000); return `${h.padStart(2,'0')}:${m.padStart(2,'0')}:${s.padStart(2,'0')}`; }
function getLiveTimer(t) { if(!t) return 'LIVE'; try { const d=Math.floor((new Date()-(t.toDate?t.toDate():new Date(t)))/60000); if(d<45) return `1st Half • ${d}'`; if(d<60) return `HT • ${d}'`; if(d<105) return `2nd Half • ${d-15}'`; return "90+'"; } catch(e){return 'LIVE';} }
function getMatchMinute(t) { if(!t) return 45; try { return Math.floor((new Date()-(t.toDate?t.toDate():new Date(t)))/60000); } catch(e){return 45;} }
function getTodayRange() { const t=new Date(); t.setHours(0,0,0,0); return {start:t, end:new Date(t.getTime()+86400000-1)}; }
function getTomorrowRange() { const t=new Date(); t.setDate(t.getDate()+1); t.setHours(0,0,0,0); return {start:t, end:new Date(t.getTime()+86400000-1)}; }
function getCancelFee(t) { if(!t) return 100; const m=Math.floor(((t.toDate?t.toDate():new Date(t))-new Date())/60000); if(m<0) return 100; if(m<5) return 50; if(m<60) return 20; return 5; }
function getCashoutFee(m) { if(m<15) return 15; if(m<30) return 20; if(m<60) return 25; if(m<80) return 30; return 35; }

let cachedLeagues=[];
async function getLeagues() { if(cachedLeagues.length) return cachedLeagues; const d=await fetchLeagues(); if(d?.success&&d.data) cachedLeagues=d.data.sort((a,b)=>(a.name||'').localeCompare(b.name||'')); return cachedLeagues; }

// ===== SYNC (FORCE LIVE) =====
async function syncMatchToFirestore(match) {
    if(!firebase?.firestore) return false;
    const db=firebase.firestore();
    const f=match.fixture||{}, t=match.teams||{}, g=match.goals||{}, l=match.league||{}, id=f.id;
    if(!id) return false;
    const hn=t.home?.name||('Team '+(t.home?.id||'Home'));
    const an=t.away?.name||('Team '+(t.away?.id||'Away'));
    const status=getMatchStatus(match);
    const odds=calculateOdds(hn,an);
    let result=null, expiresAt=null;
    if(status==='finished') { const hg=g.home||0, ag=g.away||0; result=hg>ag?'home':hg<ag?'away':'draw'; expiresAt=new Date(); expiresAt.setHours(expiresAt.getHours()+24); }
    
    const data = {
        fixtureId: id, status, odds, result, expiresAt,
        leagueId: l.id||0, leagueName: l.name||'Unknown League',
        homeTeam: { id: t.home?.id||0, name: hn, logo: t.home?.logo||'' },
        awayTeam: { id: t.away?.id||0, name: an, logo: t.away?.logo||'' },
        startTime: f.date ? new Date(f.date) : new Date(),
        score: { home: g.home||0, away: g.away||0 },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        const ref = db.collection('sports_matches').doc(String(id));
        const old = await ref.get();
        const oldStatus = old.exists ? old.data().status : null;
        
        // 🔥 FORCE SET status to 'live' if API says it's live
        // This ensures matches that transition from upcoming->live are updated immediately
        await ref.set(data, { merge: true });
        
        if (status === 'live') {
            console.log(`🔴 LIVE: ${hn} vs ${an}`);
        }
        
        if (oldStatus && oldStatus !== 'finished' && status === 'finished') {
            console.log(`🏁 Auto-settling: ${hn} vs ${an}`);
            await settleBetsForMatch(id, result);
        }
        return true;
    } catch(e) { return false; }
}

async function syncLiveMatches() {
    const d = await fetchLiveMatches();
    if (!d?.success || !d.data) return 0;
    let s = 0;
    for (const m of d.data.slice(0, 30)) {
        if (await syncMatchToFirestore(m)) s++;
    }
    return s;
}

async function syncUpcomingMatches() { const d=await fetchUpcomingWeek(); if(!d?.success||!d.data) return 0; let s=0; for(const m of d.data.slice(0,30)) if(await syncMatchToFirestore(m)) s++; return s; }
async function syncAllMatches() { const l=await syncLiveMatches(); const u=await syncUpcomingMatches(); console.log(`✅ Live: ${l}, Upcoming: ${u}`); return {live:l, upcoming:u}; }

// ===== SETTLEMENT =====
async function settleBetsForMatch(fixtureId, result) {
    if(!firebase?.firestore) return 0;
    const db=firebase.firestore(); let settled=0;
    try {
        const bets=await db.collection('bets').where('fixtureId','==',fixtureId).where('status','==','active').get();
        for(const doc of bets.docs) {
            const bet=doc.data(); let won=false;
            if(['home','draw','away'].includes(bet.betType)) { won=bet.betType===result; }
            else if(bet.betType==='over25'||bet.betType==='under25') { const tg=(bet.matchScore?.home||0)+(bet.matchScore?.away||0); won=(bet.betType==='over25'&&tg>2.5)||(bet.betType==='under25'&&tg<2.5); }
            else if(bet.betType==='btts_yes'||bet.betType==='btts_no') { const bs=(bet.matchScore?.home>0&&bet.matchScore?.away>0); won=(bet.betType==='btts_yes'&&bs)||(bet.betType==='btts_no'&&!bs); }
            else if(bet.betType==='1X') { won=(result==='home'||result==='draw'); }
            else if(bet.betType==='12') { won=(result==='home'||result==='away'); }
            else if(bet.betType==='X2') { won=(result==='draw'||result==='away'); }
            if(won) { const w=await db.collection('wallets').doc(bet.userId).get(); await w.ref.update({ balance:(w.data()?.balance||0)+bet.potentialWin }); await doc.ref.update({ status:'won', result, payout:bet.potentialWin, settledAt:new Date() }); }
            else { await doc.ref.update({ status:'lost', result, payout:0, settledAt:new Date() }); }
            settled++;
        }
        if(settled>0) await db.collection('sports_matches').doc(String(fixtureId)).update({ betsSettled:true });
    } catch(e) {}
    return settled;
}

async function settleAllFinishedMatches() {
    if(!firebase?.firestore) return 0;
    const db=firebase.firestore(); let total=0;
    try { const finished=await db.collection('sports_matches').where('status','==','finished').get(); for(const doc of finished.docs) { const m=doc.data(); if(m.betsSettled) continue; let r=m.result; if(!r) { const h=m.score?.home||0, a=m.score?.away||0; r=h>a?'home':h<a?'away':'draw'; } total+=await settleBetsForMatch(m.fixtureId,r); } } catch(e) {}
    return total;
}

async function forceUpdateStatus() {
    if(!firebase?.firestore) return 0;
    const db=firebase.firestore(); const now=new Date(); let updated=0;
    try {
        const snap=await db.collection('sports_matches').where('status','==','upcoming').limit(30).get();
        const batch=db.batch();
        snap.forEach(d=>{ const m=d.data(); if((m.startTime?.toDate?m.startTime.toDate():new Date(m.startTime))<=now) { batch.update(d.ref,{status:'live'}); updated++; } });
        if(updated) await batch.commit();
        await settleAllFinishedMatches();
    } catch(e) {}
    return updated;
}

let si,fi;
function startAutoSync() { if(si)clearInterval(si); if(fi)clearInterval(fi); syncAllMatches(); si=setInterval(syncAllMatches,SYNC_INTERVAL); fi=setInterval(forceUpdateStatus,FORCE_UPDATE_INTERVAL); }

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

setTimeout(()=>{syncAllMatches(); startAutoSync();},500);
console.log('🏈 Sports API v32.0 - Force Live Sync Active');
