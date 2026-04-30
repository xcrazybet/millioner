// ============================================
// js/sports-api.js - v39.0 BATCH SYNC
// Fixed: Now syncs ALL matches in batches to avoid timeouts
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';
const SYNC_INTERVAL = 120000;  // 2 minutes
const FORCE_UPDATE_INTERVAL = 30000;  // 30 seconds
const BATCH_SIZE = 50;  // Sync 50 matches at a time
const BATCH_DELAY = 1000;  // Wait 1 second between batches

// ===== FETCH =====
async function fetchFromBackend(endpoint) {
    try { 
        const r = await fetch(BACKEND_URL + endpoint); 
        if (!r.ok) throw new Error('HTTP ' + r.status); 
        return await r.json(); 
    }
    catch(e) { 
        console.error('Fetch error:', e.message); 
        return { success: false, data: [] }; 
    }
}

async function fetchLiveMatches() { return await fetchFromBackend('/api/livescores'); }
async function fetchUpcomingWeek() { return await fetchFromBackend('/api/fixtures/week'); }
async function fetchLeagues() { return await fetchFromBackend('/api/leagues'); }

// ===== STATUS =====
function getMatchStatus(m) { 
    const s = m.fixture?.status?.short; 
    if(!s || s === 'TBD' || s === 'NS') return 'upcoming'; 
    if(['1H','HT','2H','ET','P','LIVE'].includes(s)) return 'live'; 
    if(['FT','AET','PEN'].includes(s)) return 'finished'; 
    return 'upcoming'; 
}

function calculateOdds(h, a) { 
    let x = 0; 
    const s = h + a; 
    for(let i = 0; i < s.length; i++) x += s.charCodeAt(i); 
    return { 
        home: +(1.8 + (x % 20) / 100).toFixed(2), 
        draw: +(3.2 + (x % 15) / 100).toFixed(2), 
        away: +(2.8 + (x % 25) / 100).toFixed(2)
    }; 
}

// ===== HELPERS =====
function formatCountdown(t) { 
    if(!t) return '00:00:00'; 
    const d = new Date(t) - new Date(); 
    if(d <= 0) return '00:00:00'; 
    const h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000), s = Math.floor((d % 60000) / 1000); 
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; 
}

function getLiveTimer(t) { 
    if(!t) return 'LIVE'; 
    try { 
        const d = Math.floor((new Date() - (t.toDate ? t.toDate() : new Date(t))) / 60000); 
        if(d < 45) return `1st Half • ${d}'`; 
        if(d < 60) return `HT • ${d}'`; 
        if(d < 105) return `2nd Half • ${d - 15}'`; 
        return "90+'"; 
    } catch(e) { return 'LIVE'; } 
}

function getMatchMinute(t) { 
    if(!t) return 45; 
    try { return Math.floor((new Date() - (t.toDate ? t.toDate() : new Date(t))) / 60000); } 
    catch(e) { return 45; } 
}

function getTodayRange() { 
    const t = new Date(); 
    t.setHours(0, 0, 0, 0); 
    return { start: t, end: new Date(t.getTime() + 86400000 - 1) }; 
}

function getTomorrowRange() { 
    const t = new Date(); 
    t.setDate(t.getDate() + 1); 
    t.setHours(0, 0, 0, 0); 
    return { start: t, end: new Date(t.getTime() + 86400000 - 1) }; 
}

function getCancelFee(t) { 
    if(!t) return 100; 
    const m = Math.floor(((t.toDate ? t.toDate() : new Date(t)) - new Date()) / 60000); 
    if(m < 0) return 100; 
    if(m < 5) return 50; 
    if(m < 60) return 20; 
    return 5; 
}

function getCashoutFee(m) { 
    if(m < 15) return 15; 
    if(m < 30) return 20; 
    if(m < 60) return 25; 
    if(m < 80) return 30; 
    return 35; 
}

let cachedLeagues = [];

async function getLeagues() { 
    if(cachedLeagues.length) return cachedLeagues; 
    const d = await fetchLeagues(); 
    if(d?.success && d.data) cachedLeagues = d.data.sort((a, b) => (a.name || '').localeCompare(b.name || '')); 
    return cachedLeagues; 
}

// ===== SYNC WITH BATCH PROCESSING =====
async function syncMatchToDatabase(match) {
    const f = match.fixture || {}, t = match.teams || {}, g = match.goals || {}, l = match.league || {}, id = f.id;
    if(!id) return false;
    
    const hn = t.home?.name || ('Team ' + (t.home?.id || 'Home'));
    const an = t.away?.name || ('Team ' + (t.away?.id || 'Away'));
    const status = getMatchStatus(match);
    const odds = calculateOdds(hn, an);
    let result = null, expiresAt = null;
    
    if(status === 'finished') { 
        const hg = g.home || 0, ag = g.away || 0; 
        result = hg > ag ? 'home' : hg < ag ? 'away' : 'draw'; 
        expiresAt = new Date(); 
        expiresAt.setHours(expiresAt.getHours() + 24); 
    }
    
    const matchData = {
        fixtureId: id,
        fixture_id: id,
        status: status,
        odds: odds,
        result: result,
        expiresAt: expiresAt,
        leagueId: l.id || 0,
        league_id: l.id || 0,
        league_name: l.name || 'Unknown League',
        league_logo: l.logo || '',
        home_team: { id: t.home?.id || 0, name: hn, logo: t.home?.logo || '' },
        away_team: { id: t.away?.id || 0, name: an, logo: t.away?.logo || '' },
        start_time: f.date ? new Date(f.date) : new Date(),
        score: { home: g.home || 0, away: g.away || 0 },
        updated_at: new Date().toISOString(),
        bets_settled: false
    };
    
    if (window.supaDB) {
        const saved = await window.supaDB.upsertMatch(matchData);
        if (saved && status === 'finished') {
            await settleBetsForMatch(id, result);
        }
        return saved;
    }
    return false;
}

// 🔥 BATCH SYNC - Sync matches in chunks to avoid timeouts
async function batchSyncMatches(matches, type) {
    if (!matches || matches.length === 0) return 0;
    
    console.log(`📦 Starting batch sync for ${matches.length} ${type} matches`);
    let synced = 0;
    let failed = 0;
    
    for (let i = 0; i < matches.length; i += BATCH_SIZE) {
        const batch = matches.slice(i, i + BATCH_SIZE);
        console.log(`⏳ Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(matches.length / BATCH_SIZE)} (${batch.length} matches)`);
        
        // Process batch in parallel
        const results = await Promise.allSettled(batch.map(m => syncMatchToDatabase(m)));
        
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value === true) {
                synced++;
            } else {
                failed++;
            }
        }
        
        console.log(`✅ Batch complete: ${synced} synced, ${failed} failed`);
        
        // Wait between batches to avoid rate limiting
        if (i + BATCH_SIZE < matches.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
    }
    
    console.log(`🎉 ${type} sync complete: ${synced} synced, ${failed} failed`);
    return synced;
}

async function syncLiveMatches() { 
    const d = await fetchLiveMatches(); 
    if(!d?.success || !d.data) return 0; 
    console.log(`📡 /api/livescores returned ${d.data.length} live matches`);
    return await batchSyncMatches(d.data, 'live');
}

async function syncUpcomingMatches() { 
    const d = await fetchUpcomingWeek(); 
    if(!d?.success || !d.data) return 0; 
    
    console.log(`📡 /api/fixtures/week/ returned ${d.data.length} total matches`);
    
    // Filter only upcoming/future matches
    const now = new Date();
    const upcomingMatches = d.data.filter(m => {
        const matchDate = new Date(m.fixture.date);
        const status = m.fixture.status?.short;
        return status === 'NS' || status === '1H' || status === '2H' || status === 'HT';
    });
    
    console.log(`📅 Filtered to ${upcomingMatches.length} upcoming/live matches`);
    
    return await batchSyncMatches(upcomingMatches, 'upcoming');
}

async function syncAllMatches() { 
    console.log('🔄 Starting full sync from Render API to Supabase...');
    const startTime = Date.now();
    const l = await syncLiveMatches(); 
    const u = await syncUpcomingMatches(); 
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Full sync complete in ${duration}s - Live: ${l}, Upcoming: ${u}, Total: ${l + u}`);
    return { live: l, upcoming: u }; 
}

// ===== AUTO STATUS UPDATE =====
async function forceUpdateStatusSupabase() {
    if (!window.supaDB || !supaClient) return 0;
    
    try {
        const now = new Date().toISOString();
        let updated = 0;
        
        const { data: started, error: err1 } = await supaClient
            .from('sports_matches')
            .select('fixture_id')
            .eq('status', 'upcoming')
            .lte('start_time', now);
        
        if (!err1 && started && started.length > 0) {
            const { error: err2 } = await supaClient
                .from('sports_matches')
                .update({ status: 'live', updated_at: now })
                .eq('status', 'upcoming')
                .lte('start_time', now);
            
            if (!err2) {
                updated += started.length;
                console.log(`⏰ Moved ${started.length} matches: upcoming → live`);
            }
        }
        
        return updated;
    } catch(e) {
        console.error('Force update error:', e);
        return 0;
    }
}

// ===== SETTLEMENT =====
async function settleBetsForMatch(fixtureId, result) {
    if (!window.supaDB) return 0;
    const bets = await window.supaDB.getActiveBets(fixtureId);
    let settled = 0;
    
    for (const bet of bets) {
        if (bet.bet_category === 'accumulator') continue;
        let won = false;
        
        if (['home', 'draw', 'away'].includes(bet.bet_type)) { 
            won = bet.bet_type === result; 
        }
        else if (bet.bet_type === 'over25' || bet.bet_type === 'under25') {
            const { data: match } = await supaClient.from('sports_matches').select('score').eq('fixture_id', fixtureId).single();
            const tg = (match?.score?.home || 0) + (match?.score?.away || 0);
            won = (bet.bet_type === 'over25' && tg > 2.5) || (bet.bet_type === 'under25' && tg < 2.5);
        }
        else if (bet.bet_type === 'btts_yes' || bet.bet_type === 'btts_no') {
            const { data: match } = await supaClient.from('sports_matches').select('score').eq('fixture_id', fixtureId).single();
            const bs = (match?.score?.home > 0 && match?.score?.away > 0);
            won = (bet.bet_type === 'btts_yes' && bs) || (bet.bet_type === 'btts_no' && !bs);
        }
        else if (bet.bet_type === '1X') { won = (result === 'home' || result === 'draw'); }
        else if (bet.bet_type === '12') { won = (result === 'home' || result === 'away'); }
        else if (bet.bet_type === 'X2') { won = (result === 'draw' || result === 'away'); }
        
        if (won) {
            if (firebase?.firestore) {
                const db = firebase.firestore();
                const w = await db.collection('wallets').doc(bet.user_id).get();
                await w.ref.update({ balance: (w.data()?.balance || 0) + bet.potential_win });
            }
            await window.supaDB.updateBet(bet.id, { status: 'won', result, payout: bet.potential_win, settled_at: new Date().toISOString() });
        } else {
            await window.supaDB.updateBet(bet.id, { status: 'lost', result, payout: 0, settled_at: new Date().toISOString() });
        }
        settled++;
    }
    
    const accSettled = await settleAccumulatorBets(fixtureId);
    settled += accSettled;
    
    if (settled > 0 && supaClient) {
        await supaClient.from('sports_matches').update({ bets_settled: true }).eq('fixture_id', fixtureId);
    }
    return settled;
}

async function settleAccumulatorBets(fixtureId) {
    if (!window.supaDB || !supaClient) return 0;
    const accBets = await window.supaDB.getActiveAccumulatorBets();
    if (!accBets || !accBets.length) return 0;
    
    let settled = 0;
    for (const bet of accBets) {
        let selections = bet.selections;
        if (typeof selections === 'string') { 
            try { selections = JSON.parse(selections); } 
            catch(e) { continue; } 
        }
        if (!selections || !selections.length) continue;
        
        const hasMatch = selections.some(s => s.fixtureId == fixtureId || s.fixture_id == fixtureId);
        if (!hasMatch) continue;
        
        let allFinished = true, allWon = true;
        for (const sel of selections) {
            const sid = sel.fixtureId || sel.fixture_id;
            const m = await window.supaDB.getMatchByFixtureId(sid);
            if (!m || m.status !== 'finished') { allFinished = false; break; }
            if (m.result !== sel.betType) { allWon = false; }
        }
        
        if (allFinished) {
            if (allWon) {
                if (firebase?.firestore) {
                    const db = firebase.firestore();
                    const w = await db.collection('wallets').doc(bet.user_id).get();
                    await w.ref.update({ balance: (w.data()?.balance || 0) + bet.potential_win });
                }
                await window.supaDB.updateBet(bet.id, { status: 'won', payout: bet.potential_win, settled_at: new Date().toISOString() });
            } else {
                await window.supaDB.updateBet(bet.id, { status: 'lost', payout: 0, settled_at: new Date().toISOString() });
            }
            settled++;
        }
    }
    return settled;
}

async function settleAllFinishedMatches() {
    if (!window.supaDB) return 0;
    const matches = await window.supaDB.getUnsettledMatches();
    let total = 0;
    for (const m of matches) {
        let r = m.result;
        if (!r) { 
            const h = m.score?.home || 0, a = m.score?.away || 0; 
            r = h > a ? 'home' : h < a ? 'away' : 'draw'; 
        }
        total += await settleBetsForMatch(m.fixture_id, r);
    }
    return total;
}

// ===== AUTO SYSTEM =====
let syncInterval, forceInterval;

function startAutoSync() { 
    if(syncInterval) clearInterval(syncInterval); 
    if(forceInterval) clearInterval(forceInterval); 
    
    syncAllMatches();
    forceUpdateStatusSupabase();
    settleAllFinishedMatches();
    
    syncInterval = setInterval(() => {
        syncAllMatches();
        forceUpdateStatusSupabase();
    }, SYNC_INTERVAL);
    
    forceInterval = setInterval(() => {
        forceUpdateStatusSupabase();
        settleAllFinishedMatches();
    }, FORCE_UPDATE_INTERVAL);
    
    console.log(`⏰ Auto-sync: Every ${SYNC_INTERVAL/1000}s | Batch size: ${BATCH_SIZE}`);
}

function stopAutoSync() { 
    if(syncInterval) clearInterval(syncInterval); 
    if(forceInterval) clearInterval(forceInterval); 
}

// ===== EXPORTS =====
window.syncNow = syncAllMatches;
window.settleNow = settleAllFinishedMatches;
window.forceUpdateStatus = forceUpdateStatusSupabase;
window.getLeagues = getLeagues;
window.formatCountdown = formatCountdown;
window.getLiveTimer = getLiveTimer;
window.getMatchMinute = getMatchMinute;
window.getTodayRange = getTodayRange;
window.getTomorrowRange = getTomorrowRange;
window.getCancelFee = getCancelFee;
window.getCashoutFee = getCashoutFee;
window.settleBetsForMatch = settleBetsForMatch;
window.settleAllFinishedMatches = settleAllFinishedMatches;

// ===== AUTO START =====
setTimeout(() => { startAutoSync(); }, 1000);

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   🏈 SPORTS API v39.0 - BATCH SYNC (No Timeouts)             ║');
console.log('║   ✅ Batch size: 50 matches at a time                         ║');
console.log('║   ✅ 1 second delay between batches                          ║');
console.log('║   ✅ Will sync ALL matches from API                          ║');
console.log('║   💡 Check console for progress updates                      ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
