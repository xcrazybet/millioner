// ============================================
// sports-api.js - v14.0 FULL 7 DAYS SYNC
// ✅ Syncs ALL matches for next 7 days
// ✅ Auto-settlement working
// ✅ Runs every 30 seconds
// ============================================

const API_BASE = 'https://millioner.onrender.com';

async function fetchAPI(endpoint) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${API_BASE}${endpoint}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch(e) {
        console.error(`API fetch error ${endpoint}:`, e.message);
        return { success: false, data: [] };
    }
}

async function syncMatchToDB(match) {
    if (!match || !match.fixture) return false;
    
    const fixture = match.fixture;
    const teams = match.teams;
    const league = match.league;
    const fixtureId = fixture.id;
    
    if (!fixtureId) return false;
    
    try {
        let status = 'upcoming';
        const statusShort = fixture.status?.short;
        if (statusShort === '1H' || statusShort === '2H' || statusShort === 'HT') {
            status = 'live';
        } else if (statusShort === 'FT' || statusShort === 'AET' || statusShort === 'PEN') {
            status = 'finished';
        }
        
        let result = null;
        let score = { home: 0, away: 0 };
        
        if (status === 'finished') {
            score = {
                home: match.goals?.home || 0,
                away: match.goals?.away || 0
            };
            if (score.home > score.away) result = 'home';
            else if (score.home < score.away) result = 'away';
            else result = 'draw';
        } else if (status === 'live') {
            score = {
                home: match.goals?.home || 0,
                away: match.goals?.away || 0
            };
        }
        
        const odds = {
            home: (1.80 + ((fixtureId % 20) / 100)).toFixed(2),
            draw: (3.20 + ((fixtureId % 15) / 100)).toFixed(2),
            away: (2.80 + ((fixtureId % 25) / 100)).toFixed(2)
        };
        
        const matchData = {
            fixture_id: fixtureId,
            status: status,
            result: result,
            odds: odds,
            league_id: league?.id || 0,
            league_name: league?.name || 'Unknown League',
            home_team: {
                id: teams?.home?.id || 0,
                name: teams?.home?.name || 'Home',
                logo: teams?.home?.logo || ''
            },
            away_team: {
                id: teams?.away?.id || 0,
                name: teams?.away?.name || 'Away',
                logo: teams?.away?.logo || ''
            },
            start_time: fixture.date,
            score: score,
            updated_at: new Date().toISOString()
        };
        
        const { error } = await supabaseClient
            .from('sports_matches')
            .upsert(matchData, { onConflict: 'fixture_id' });
        
        if (error) {
            console.error(`Sync error for ${fixtureId}:`, error.message);
            return false;
        }
        
        if (status === 'finished' && result) {
            await settleMatchBets(fixtureId, result);
        }
        
        return true;
        
    } catch(e) {
        console.error(`Error syncing match ${fixtureId}:`, e.message);
        return false;
    }
}

async function settleMatchBets(fixtureId, result) {
    if (!window.supaDB || !firebase?.firestore) return;
    
    try {
        const bets = await window.supaDB.getActiveBets(fixtureId);
        const db = firebase.firestore();
        
        for (const bet of bets) {
            let won = false;
            let payout = 0;
            
            if (bet.bet_type === 'home') won = (result === 'home');
            else if (bet.bet_type === 'draw') won = (result === 'draw');
            else if (bet.bet_type === 'away') won = (result === 'away');
            else if (bet.bet_type === 'over25') {
                const match = await window.supaDB.getMatch(fixtureId);
                const total = (match?.score?.home || 0) + (match?.score?.away || 0);
                won = total > 2.5;
            }
            else if (bet.bet_type === 'under25') {
                const match = await window.supaDB.getMatch(fixtureId);
                const total = (match?.score?.home || 0) + (match?.score?.away || 0);
                won = total < 2.5;
            }
            else if (bet.bet_type === 'btts_yes') {
                const match = await window.supaDB.getMatch(fixtureId);
                won = (match?.score?.home > 0 && match?.score?.away > 0);
            }
            else if (bet.bet_type === '1X') won = (result === 'home' || result === 'draw');
            else if (bet.bet_type === '12') won = (result === 'home' || result === 'away');
            else if (bet.bet_type === 'X2') won = (result === 'draw' || result === 'away');
            
            if (won) {
                payout = bet.amount * bet.odds;
                const wallet = await db.collection('wallets').doc(bet.user_id).get();
                const newBalance = (wallet.data()?.balance || 0) + payout;
                await db.collection('wallets').doc(bet.user_id).update({ balance: newBalance });
                
                await window.supaDB.updateBet(bet.id, {
                    status: 'won',
                    result: result,
                    payout: payout,
                    settled_at: new Date().toISOString()
                });
                console.log(`💰 Bet ${bet.id} WON - +$${payout.toFixed(2)}`);
            } else {
                await window.supaDB.updateBet(bet.id, {
                    status: 'lost',
                    result: result,
                    payout: 0,
                    settled_at: new Date().toISOString()
                });
                console.log(`❌ Bet ${bet.id} LOST`);
            }
        }
    } catch(e) {
        console.error('Settlement error:', e);
    }
}

// Sync ALL upcoming matches for 7 days
async function syncUpcomingMatches() {
    console.log('📅 Syncing upcoming matches for 7 days...');
    const data = await fetchAPI('/api/fixtures/week');
    
    if (data.success && data.data && data.data.length > 0) {
        console.log(`📡 API returned ${data.data.length} total matches`);
        
        // Get today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Calculate 7 days from now
        const sevenDaysLater = new Date(today);
        sevenDaysLater.setDate(today.getDate() + 7);
        
        // Filter matches for next 7 days only
        const next7DaysMatches = data.data.filter(match => {
            const matchDate = new Date(match.fixture.date);
            return matchDate >= today && matchDate <= sevenDaysLater;
        });
        
        console.log(`📅 Filtered to ${next7DaysMatches.length} matches for next 7 days`);
        
        // Group by date for logging
        const dateGroups = {};
        next7DaysMatches.forEach(m => {
            const date = new Date(m.fixture.date).toDateString();
            dateGroups[date] = (dateGroups[date] || 0) + 1;
        });
        console.log('📅 Matches by date:', dateGroups);
        
        let synced = 0;
        for (const match of next7DaysMatches) {
            if (await syncMatchToDB(match)) synced++;
        }
        console.log(`✅ Synced ${synced} upcoming matches to Supabase`);
        return synced;
    }
    return 0;
}

// Sync live matches
async function syncLiveMatches() {
    console.log('🔴 Syncing live matches...');
    const data = await fetchAPI('/api/livescores');
    
    if (data.success && data.data && data.data.length > 0) {
        console.log(`📡 Found ${data.data.length} live matches from API`);
        let synced = 0;
        for (const match of data.data) {
            if (await syncMatchToDB(match)) synced++;
        }
        console.log(`✅ Synced ${synced} live matches to Supabase`);
        return synced;
    }
    return 0;
}

// Update match statuses based on time
async function updateMatchStatuses() {
    if (!supabaseClient) return;
    
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('sports_matches')
        .select('fixture_id')
        .eq('status', 'upcoming')
        .lte('start_time', now);
    
    if (data && data.length > 0) {
        await supabaseClient
            .from('sports_matches')
            .update({ status: 'live', updated_at: now })
            .eq('status', 'upcoming')
            .lte('start_time', now);
        console.log(`⏰ Updated ${data.length} matches: upcoming → live`);
    }
}

// Main sync function
async function syncAllMatches() {
    console.log('\n🔄 SYNC STARTED', new Date().toLocaleTimeString());
    const startTime = Date.now();
    
    await syncLiveMatches();
    await syncUpcomingMatches();
    await updateMatchStatuses();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ SYNC COMPLETE in ${duration}s\n`);
}

// Auto-sync system
let syncInterval;
let statusInterval;

function startAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
    if (statusInterval) clearInterval(statusInterval);
    
    setTimeout(() => syncAllMatches(), 2000);
    syncInterval = setInterval(syncAllMatches, 30000);
    statusInterval = setInterval(updateMatchStatuses, 15000);
    
    console.log('⏰ Auto-sync active (every 30 seconds)');
    console.log('📅 Will sync ALL matches for next 7 days');
}

window.manualSync = syncAllMatches;
window.forceSync = syncAllMatches;

if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    startAutoSync();
}

console.log('🏈 Sports API v14.0 - Full 7 Days Sync Ready');
