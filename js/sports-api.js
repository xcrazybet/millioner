// ============================================
// sports-api.js - v10.0 THE BRAIN
// ✅ Syncs matches to Supabase
// ✅ Auto-settlement when matches finish
// ============================================

const API_BASE = 'https://millioner.onrender.com';

// Fetch from API
async function fetchAPI(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        return await response.json();
    } catch(e) {
        console.error('API fetch error:', e);
        return { success: false, data: [] };
    }
}

// Sync match to Supabase
async function syncMatch(match, supaDB) {
    const fixture = match.fixture;
    const teams = match.teams;
    const league = match.league;
    const goals = match.goals;
    
    if (!fixture?.id) return false;
    
    let status = 'upcoming';
    const statusShort = fixture.status?.short;
    if (statusShort === '1H' || statusShort === '2H' || statusShort === 'HT') {
        status = 'live';
    } else if (statusShort === 'FT' || statusShort === 'AET') {
        status = 'finished';
    }
    
    // Calculate result for finished matches
    let result = null;
    if (status === 'finished' && goals) {
        if (goals.home > goals.away) result = 'home';
        else if (goals.home < goals.away) result = 'away';
        else result = 'draw';
    }
    
    // Generate odds
    const odds = {
        home: (1.80 + ((fixture.id % 20) / 100)).toFixed(2),
        draw: (3.20 + ((fixture.id % 15) / 100)).toFixed(2),
        away: (2.80 + ((fixture.id % 25) / 100)).toFixed(2)
    };
    
    const matchData = {
        fixture_id: fixture.id,
        status: status,
        result: result,
        odds: odds,
        league_id: league?.id || 0,
        league_name: league?.name || 'Unknown',
        home_team: { id: teams?.home?.id, name: teams?.home?.name, logo: teams?.home?.logo },
        away_team: { id: teams?.away?.id, name: teams?.away?.name, logo: teams?.away?.logo },
        start_time: fixture.date,
        score: { home: goals?.home || 0, away: goals?.away || 0 },
        updated_at: new Date().toISOString()
    };
    
    const saved = await supaDB.upsertMatch(matchData);
    
    // If match just finished, settle bets
    if (saved && status === 'finished' && result) {
        await settleBets(fixture.id, result, supaDB);
    }
    
    return saved;
}

// Settle bets for finished match
async function settleBets(fixtureId, result, supaDB) {
    const bets = await supaDB.getActiveBets(fixtureId);
    const db = firebase.firestore();
    
    for (const bet of bets) {
        let won = false;
        
        // Determine if bet won
        if (bet.bet_type === 'home') won = (result === 'home');
        else if (bet.bet_type === 'draw') won = (result === 'draw');
        else if (bet.bet_type === 'away') won = (result === 'away');
        else if (bet.bet_type === 'over25') {
            const match = await supaDB.getMatch(fixtureId);
            const total = (match?.score?.home || 0) + (match?.score?.away || 0);
            won = total > 2.5;
        }
        else if (bet.bet_type === 'under25') {
            const match = await supaDB.getMatch(fixtureId);
            const total = (match?.score?.home || 0) + (match?.score?.away || 0);
            won = total < 2.5;
        }
        else if (bet.bet_type === 'btts_yes') {
            const match = await supaDB.getMatch(fixtureId);
            won = (match?.score?.home > 0 && match?.score?.away > 0);
        }
        else if (bet.bet_type === '1X') won = (result === 'home' || result === 'draw');
        else if (bet.bet_type === '12') won = (result === 'home' || result === 'away');
        else if (bet.bet_type === 'X2') won = (result === 'draw' || result === 'away');
        
        if (won) {
            // Add winnings to wallet
            const wallet = await db.collection('wallets').doc(bet.user_id).get();
            const newBalance = (wallet.data()?.balance || 0) + bet.potential_win;
            await db.collection('wallets').doc(bet.user_id).update({ balance: newBalance });
            
            await supaDB.updateBet(bet.id, {
                status: 'won',
                result: result,
                payout: bet.potential_win,
                settled_at: new Date().toISOString()
            });
            console.log(`💰 Bet ${bet.id} WON - +$${bet.potential_win}`);
        } else {
            await supaDB.updateBet(bet.id, {
                status: 'lost',
                result: result,
                payout: 0,
                settled_at: new Date().toISOString()
            });
            console.log(`❌ Bet ${bet.id} LOST`);
        }
    }
}

// Sync all matches
async function syncAllMatches(supaDB) {
    console.log('🔄 Syncing matches...');
    
    // Sync upcoming week
    const weekData = await fetchAPI('/api/fixtures/week');
    if (weekData.success && weekData.data) {
        let synced = 0;
        for (const match of weekData.data) {
            if (await syncMatch(match, supaDB)) synced++;
        }
        console.log(`✅ Synced ${synced} matches`);
    }
    
    // Sync live scores
    const liveData = await fetchAPI('/api/livescores');
    if (liveData.success && liveData.data) {
        for (const match of liveData.data) {
            await syncMatch(match, supaDB);
        }
        console.log(`🔴 Synced ${liveData.data.length} live matches`);
    }
}

// Auto-sync every 30 seconds
let syncInterval = null;

function startAutoSync(supaDB) {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => syncAllMatches(supaDB), 30000);
    console.log('⏰ Auto-sync active (every 30 seconds)');
}

if (typeof window !== 'undefined') {
    window.syncAllMatches = syncAllMatches;
    window.startAutoSync = startAutoSync;
}

console.log('🏈 Sports API v10.0 - The Brain Ready');
