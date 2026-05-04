// ============================================
// sports-api.js - v8.0 THE BRAIN
// ✅ Fetches from Render API
// ✅ Saves to Supabase
// ✅ Auto-sync every 30 seconds
// ✅ Auto-settle bets when matches finish
// ============================================

const API_BASE = 'https://millioner.onrender.com';
let syncInterval = null;
let statusInterval = null;

// ===== FETCH FROM RENDER API =====
async function fetchFromAPI(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch(e) {
        console.error(`API fetch error ${endpoint}:`, e.message);
        return { success: false, data: [] };
    }
}

// ===== SYNC MATCH TO SUPABASE =====
async function syncMatchToDB(match, supaDB) {
    if (!match || !match.fixture) return false;
    
    const fixture = match.fixture;
    const teams = match.teams;
    const league = match.league;
    const fixtureId = fixture.id;
    
    if (!fixtureId) return false;
    
    try {
        // Determine status
        let status = 'upcoming';
        const statusShort = fixture.status?.short;
        if (statusShort === '1H' || statusShort === '2H' || statusShort === 'HT') {
            status = 'live';
        } else if (statusShort === 'FT' || statusShort === 'AET' || statusShort === 'PEN') {
            status = 'finished';
        }
        
        // Calculate result
        let result = null;
        if (status === 'finished') {
            const homeGoals = match.goals?.home || 0;
            const awayGoals = match.goals?.away || 0;
            if (homeGoals > awayGoals) result = 'home';
            else if (homeGoals < awayGoals) result = 'away';
            else result = 'draw';
        }
        
        // Calculate odds (based on fixture ID for consistency)
        const id = fixtureId;
        const odds = {
            home: (1.80 + ((id % 20) / 100)).toFixed(2),
            draw: (3.20 + ((id % 15) / 100)).toFixed(2),
            away: (2.80 + ((id % 25) / 100)).toFixed(2)
        };
        
        const matchData = {
            fixture_id: fixtureId,
            status: status,
            result: result,
            odds: odds,
            league_id: league?.id || 0,
            league_name: league?.name || 'Unknown',
            league_logo: league?.logo || '',
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
            start_time: fixture.date || new Date().toISOString(),
            score: {
                home: match.goals?.home || 0,
                away: match.goals?.away || 0
            },
            updated_at: new Date().toISOString()
        };
        
        // Save to Supabase
        const saved = await supaDB.upsertMatch(matchData);
        
        // If match just finished, settle bets
        if (saved && status === 'finished' && result) {
            console.log(`🏁 Settling bets for ${teams?.home?.name} vs ${teams?.away?.name}`);
            await settleMatchBets(fixtureId, result);
        }
        
        return saved;
        
    } catch(e) {
        console.error(`Sync error for match ${fixtureId}:`, e.message);
        return false;
    }
}

// ===== SETTLE BETS FOR FINISHED MATCH =====
async function settleMatchBets(fixtureId, result) {
    if (!window.supaDB || !firebase?.firestore) return;
    
    try {
        const bets = await supaDB.getActiveBets(fixtureId);
        const db = firebase.firestore();
        
        for (const bet of bets) {
            let won = false;
            let payout = 0;
            
            // Check if bet won based on type
            if (bet.bet_type === 'home') won = (result === 'home');
            else if (bet.bet_type === 'draw') won = (result === 'draw');
            else if (bet.bet_type === 'away') won = (result === 'away');
            else if (bet.bet_type === 'over25') {
                const match = await supaDB.getMatch(fixtureId);
                const totalGoals = (match?.score?.home || 0) + (match?.score?.away || 0);
                won = totalGoals > 2.5;
            }
            else if (bet.bet_type === 'under25') {
                const match = await supaDB.getMatch(fixtureId);
                const totalGoals = (match?.score?.home || 0) + (match?.score?.away || 0);
                won = totalGoals < 2.5;
            }
            else if (bet.bet_type === 'btts_yes') {
                const match = await supaDB.getMatch(fixtureId);
                won = (match?.score?.home > 0 && match?.score?.away > 0);
            }
            else if (bet.bet_type === 'btts_no') {
                const match = await supaDB.getMatch(fixtureId);
                won = !(match?.score?.home > 0 && match?.score?.away > 0);
            }
            else if (bet.bet_type === '1X') won = (result === 'home' || result === 'draw');
            else if (bet.bet_type === '12') won = (result === 'home' || result === 'away');
            else if (bet.bet_type === 'X2') won = (result === 'draw' || result === 'away');
            
            if (won) {
                payout = bet.amount * bet.odds;
                // Update wallet balance in Firebase
                const walletRef = db.collection('wallets').doc(bet.user_id);
                const wallet = await walletRef.get();
                const currentBalance = wallet.exists ? (wallet.data().balance || 0) : 0;
                await walletRef.update({ balance: currentBalance + payout });
                
                await supaDB.updateBet(bet.id, {
                    status: 'won',
                    result: result,
                    payout: payout,
                    settled_at: new Date().toISOString()
                });
                console.log(`💰 Bet ${bet.id} WON - User ${bet.user_id} +$${payout.toFixed(2)}`);
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
    } catch(e) {
        console.error('Settlement error:', e);
    }
}

// ===== SYNC ALL MATCHES =====
async function syncAllMatches() {
    console.log('🔄 Syncing matches...', new Date().toLocaleTimeString());
    
    // Fetch upcoming week matches
    const weekData = await fetchFromAPI('/api/fixtures/week');
    if (weekData.success && weekData.data) {
        let synced = 0;
        for (const match of weekData.data) {
            if (await syncMatchToDB(match, window.supaDB)) synced++;
        }
        console.log(`✅ Synced ${synced}/${weekData.data.length} upcoming matches`);
    }
    
    // Fetch live matches
    const liveData = await fetchFromAPI('/api/livescores');
    if (liveData.success && liveData.data) {
        let synced = 0;
        for (const match of liveData.data) {
            if (await syncMatchToDB(match, window.supaDB)) synced++;
        }
        console.log(`🔴 Synced ${synced} live matches`);
    }
    
    // Clean old data
    if (window.supaDB.cleanOldData) {
        await window.supaDB.cleanOldData();
    }
}

// ===== UPDATE MATCH STATUSES =====
async function updateStatuses() {
    if (!window.supaDB) return;
    
    const matches = await window.supaDB.getUpcomingMatches();
    const now = new Date();
    let updated = 0;
    
    for (const match of matches) {
        const matchTime = new Date(match.start_time);
        if (match.status === 'upcoming' && matchTime <= now) {
            await window.supaDB.upsertMatch({
                ...match,
                status: 'live',
                updated_at: now.toISOString()
            });
            updated++;
        }
    }
    
    if (updated > 0) console.log(`⏰ Updated ${updated} matches: upcoming → live`);
}

// ===== START AUTO-SYNC =====
function startAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
    if (statusInterval) clearInterval(statusInterval);
    
    // Initial sync
    setTimeout(() => syncAllMatches(), 2000);
    setTimeout(() => updateStatuses(), 5000);
    
    // Sync every 30 seconds
    syncInterval = setInterval(syncAllMatches, 30000);
    statusInterval = setInterval(updateStatuses, 15000);
    
    console.log('⏰ Auto-sync active (every 30 seconds)');
}

// ===== EXPORTS =====
if (typeof window !== 'undefined') {
    window.syncAllMatches = syncAllMatches;
    window.startAutoSync = startAutoSync;
    window.settleMatchBets = settleMatchBets;
}

console.log('🏈 Sports API v8.0 - THE BRAIN - Ready');
console.log('   Commands: syncAllMatches(), startAutoSync()');
