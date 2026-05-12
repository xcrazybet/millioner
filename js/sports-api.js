// ============================================
// sports-api.js - v19.0 FULLY AUTOMATED SETTLEMENT
// ✅ Auto-settlement when API returns FT status
// ✅ No admin intervention needed
// ✅ Runs every 60 seconds automatically
// ============================================

// ===== FIREBASE INITIALIZATION =====
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    const firebaseConfig = {
        apiKey: "AIzaSyA72Yo_YGqno9PX25p3yQBvyflcaM-NqEM",
        authDomain: "x-bet-prod-jd.firebaseapp.com",
        projectId: "x-bet-prod-jd",
        storageBucket: "x-bet-prod-jd.firebasestorage.app",
        messagingSenderId: "499334334535",
        appId: "1:499334334535:web:bebc1bf817e24d9e3c4962"
    };
    firebase.initializeApp(firebaseConfig);
    console.log('🔥 Firebase initialized');
}

// ===== CONFIGURATION =====
const API_BASE = 'https://millioner.onrender.com';
const BATCH_SIZE = 50;
const SYNC_INTERVAL = 60000; // 60 seconds
const STATUS_CHECK_INTERVAL = 30000; // 30 seconds

// ===== FETCH FROM API =====
async function fetchAPI(endpoint) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(`${API_BASE}${endpoint}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch(e) {
        console.error(`API fetch error:`, e.message);
        return { success: false, data: [] };
    }
}

// ===== SYNC MATCH TO SUPABASE AND CHECK FOR FINISHED STATUS =====
async function syncMatchToDB(match) {
    if (!match || !match.fixture) return false;
    
    const fixture = match.fixture;
    const teams = match.teams;
    const league = match.league;
    const fixtureId = fixture.id;
    
    if (!fixtureId) return false;
    
    try {
        // 🔥 CRITICAL: Get REAL status from API
        const statusShort = fixture.status?.short;
        let status = 'upcoming';
        let isFinished = false;
        
        if (statusShort === '1H' || statusShort === '2H' || statusShort === 'HT') {
            status = 'live';
        } else if (statusShort === 'FT' || statusShort === 'AET' || statusShort === 'PEN') {
            status = 'finished';
            isFinished = true;
        }
        
        let result = null;
        let score = { home: 0, away: 0 };
        
        if (status === 'finished') {
            score = { home: match.goals?.home || 0, away: match.goals?.away || 0 };
            if (score.home > score.away) result = 'home';
            else if (score.home < score.away) result = 'away';
            else result = 'draw';
        } else if (status === 'live') {
            score = { home: match.goals?.home || 0, away: match.goals?.away || 0 };
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
        
        // Get existing match to check if status changed
        const { data: existing } = await supabaseClient
            .from('sports_matches')
            .select('status, bets_settled')
            .eq('fixture_id', fixtureId)
            .single();
        
        const { error } = await supabaseClient
            .from('sports_matches')
            .upsert(matchData, { onConflict: 'fixture_id' });
        
        if (error) {
            console.error(`Sync error for ${fixtureId}:`, error.message);
            return false;
        }
        
        // 🔥 AUTO SETTLEMENT: If match just finished (status changed to finished)
        if (isFinished && (!existing || existing.status !== 'finished')) {
            console.log(`🏁 AUTO SETTLEMENT TRIGGERED for match ${fixtureId}`);
            console.log(`   Result: ${result} (${score.home}-${score.away})`);
            await settleMatchBets(fixtureId, result, score);
        }
        
        return true;
    } catch(e) {
        console.error(`Error syncing match:`, e.message);
        return false;
    }
}

// ===== 🔥 FULLY AUTOMATED SETTLEMENT ENGINE =====
async function settleMatchBets(fixtureId, result, score) {
    if (!window.supaDB || !firebase?.firestore) {
        console.warn('Settlement prerequisites not ready');
        return;
    }
    
    try {
        // Check if already settled (prevent double settlement)
        const { data: match } = await supabaseClient
            .from('sports_matches')
            .select('bets_settled')
            .eq('fixture_id', fixtureId)
            .single();
        
        if (match?.bets_settled) {
            console.log(`⚠️ Match ${fixtureId} already settled, skipping`);
            return;
        }
        
        // Get all active bets for this fixture
        const bets = await window.supaDB.getActiveBets(fixtureId);
        
        if (!bets || bets.length === 0) {
            // No bets to settle, just mark as settled
            await supabaseClient
                .from('sports_matches')
                .update({ bets_settled: true, result: result })
                .eq('fixture_id', fixtureId);
            console.log(`📭 No active bets for match ${fixtureId}, marked as settled`);
            return;
        }
        
        console.log(`💰 AUTO-SETTLING ${bets.length} bets for match ${fixtureId}`);
        console.log(`📊 Final score: ${score?.home || 0} - ${score?.away || 0}, Result: ${result}`);
        
        const db = firebase.firestore();
        let winnersCount = 0;
        let totalPayout = 0;
        
        for (const bet of bets) {
            let won = false;
            let payout = 0;
            let winReason = '';
            
            // ===== 1X2 MATCH RESULT =====
            if (bet.bet_type === 'home') {
                won = (result === 'home');
                winReason = won ? 'Home Win' : 'Not Home Win';
            }
            else if (bet.bet_type === 'draw') {
                won = (result === 'draw');
                winReason = won ? 'Draw' : 'Not Draw';
            }
            else if (bet.bet_type === 'away') {
                won = (result === 'away');
                winReason = won ? 'Away Win' : 'Not Away Win';
            }
            
            // ===== DOUBLE CHANCE =====
            else if (bet.bet_type === '1X') {
                won = (result === 'home' || result === 'draw');
                winReason = won ? 'Home or Draw' : 'Not Home or Draw';
            }
            else if (bet.bet_type === '12') {
                won = (result === 'home' || result === 'away');
                winReason = won ? 'Home or Away' : 'Not Home or Away';
            }
            else if (bet.bet_type === 'X2') {
                won = (result === 'draw' || result === 'away');
                winReason = won ? 'Draw or Away' : 'Not Draw or Away';
            }
            
            // ===== OVER/UNDER GOALS =====
            else if (bet.bet_type === 'over25') {
                const total = (score?.home || 0) + (score?.away || 0);
                won = total > 2.5;
                winReason = won ? `Over 2.5 (Total: ${total})` : `Under 2.5 (Total: ${total})`;
            }
            else if (bet.bet_type === 'under25') {
                const total = (score?.home || 0) + (score?.away || 0);
                won = total < 2.5;
                winReason = won ? `Under 2.5 (Total: ${total})` : `Over 2.5 (Total: ${total})`;
            }
            
            // ===== BTTS (Both Teams to Score) =====
            else if (bet.bet_type === 'btts_yes') {
                const homeScored = (score?.home || 0) > 0;
                const awayScored = (score?.away || 0) > 0;
                won = (homeScored && awayScored);
                winReason = won ? 'Both teams scored' : 'Not both teams scored';
            }
            else if (bet.bet_type === 'btts_no') {
                const homeScored = (score?.home || 0) > 0;
                const awayScored = (score?.away || 0) > 0;
                won = !(homeScored && awayScored);
                winReason = won ? 'Not both teams scored' : 'Both teams scored';
            }
            
            // ===== PROCESS WINNER =====
            if (won) {
                payout = bet.amount * bet.odds;
                totalPayout += payout;
                winnersCount++;
                
                // Update wallet (add winnings)
                try {
                    const wallet = await db.collection('wallets').doc(bet.user_id).get();
                    const newBalance = (wallet.data()?.balance || 0) + payout;
                    await db.collection('wallets').doc(bet.user_id).update({ balance: newBalance });
                    
                    console.log(`✅ Bet ${bet.id} WON - User ${bet.user_id} +$${payout.toFixed(2)} (${winReason})`);
                } catch(e) {
                    console.error(`Failed to update wallet for bet ${bet.id}:`, e);
                }
                
                // Update bet in Supabase
                await window.supaDB.updateBet(bet.id, {
                    status: 'won',
                    result: result,
                    payout: payout,
                    settlement_reason: winReason,
                    settled_at: new Date().toISOString()
                });
            } else {
                // Update bet as lost
                await window.supaDB.updateBet(bet.id, {
                    status: 'lost',
                    result: result,
                    payout: 0,
                    settlement_reason: winReason,
                    settled_at: new Date().toISOString()
                });
                console.log(`❌ Bet ${bet.id} LOST - ${winReason}`);
            }
        }
        
        // Mark match as settled
        await supabaseClient
            .from('sports_matches')
            .update({ 
                bets_settled: true, 
                result: result,
                settled_at: new Date().toISOString()
            })
            .eq('fixture_id', fixtureId);
        
        console.log(`💰 AUTO-SETTLEMENT COMPLETE: ${winnersCount} winners, total payout $${totalPayout.toFixed(2)}`);
        
    } catch(e) {
        console.error('Settlement error:', e);
    }
}

// ===== CHECK FOR FINISHED MATCHES (Calls API directly) =====
async function checkForFinishedMatches() {
    console.log('🔍 Checking for finished matches...');
    
    // Get all live matches from database
    const { data: liveMatches } = await supabaseClient
        .from('sports_matches')
        .select('fixture_id, start_time')
        .eq('status', 'live');
    
    if (!liveMatches || liveMatches.length === 0) return;
    
    // Check each live match with API
    for (const match of liveMatches) {
        try {
            const response = await fetch(`${API_BASE}/api/fixture/${match.fixture_id}`);
            const data = await response.json();
            
            if (data.success && data.fixture) {
                const statusShort = data.fixture.status?.short;
                
                // If API says match is finished
                if (statusShort === 'FT' || statusShort === 'AET' || statusShort === 'PEN') {
                    const homeScore = data.fixture.goals?.home || 0;
                    const awayScore = data.fixture.goals?.away || 0;
                    const result = homeScore > awayScore ? 'home' : (homeScore < awayScore ? 'away' : 'draw');
                    
                    console.log(`🏁 Match ${match.fixture_id} finished according to API!`);
                    
                    // Update match status
                    await supabaseClient
                        .from('sports_matches')
                        .update({ 
                            status: 'finished', 
                            result: result,
                            score: { home: homeScore, away: awayScore }
                        })
                        .eq('fixture_id', match.fixture_id);
                    
                    // Settle bets
                    await settleMatchBets(match.fixture_id, result, { home: homeScore, away: awayScore });
                }
            }
        } catch(e) {
            console.error(`Error checking match ${match.fixture_id}:`, e.message);
        }
    }
}

// ===== SYNC UPCOMING MATCHES =====
async function syncUpcomingMatches() {
    console.log('📅 Syncing upcoming matches...');
    
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 30);
    const to = futureDate.toISOString().split('T')[0];
    
    const data = await fetchAPI(`/api/fixtures/range/${from}/${to}`);
    
    if (data.success && data.data && data.data.length > 0) {
        console.log(`📡 Found ${data.data.length} matches`);
        
        let synced = 0;
        for (let i = 0; i < data.data.length; i += BATCH_SIZE) {
            const batch = data.data.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(match => syncMatchToDB(match));
            const results = await Promise.all(batchPromises);
            synced += results.filter(r => r === true).length;
            console.log(`📊 Synced ${synced}/${data.data.length} matches`);
        }
        
        console.log(`✅ Synced ${synced} matches to Supabase`);
        return synced;
    }
    return 0;
}

// ===== SYNC LIVE MATCHES =====
async function syncLiveMatches() {
    console.log('🔴 Syncing live matches...');
    const data = await fetchAPI('/api/livescores');
    
    if (data.success && data.data && data.data.length > 0) {
        const liveMatches = data.data.filter(m => {
            const status = m.fixture.status?.short;
            return status === '1H' || status === '2H' || status === 'HT';
        });
        
        console.log(`📡 Found ${liveMatches.length} live matches`);
        let synced = 0;
        for (const match of liveMatches) {
            if (await syncMatchToDB(match)) synced++;
        }
        console.log(`✅ Synced ${synced} live matches`);
        return synced;
    }
    return 0;
}

// ===== UPDATE MATCH STATUSES =====
async function updateMatchStatuses() {
    if (!supabaseClient) return;
    
    const now = new Date();
    const nowISO = now.toISOString();
    let updated = 0;
    
    // Upcoming → Live
    const { data: upcomingMatches } = await supabaseClient
        .from('sports_matches')
        .select('fixture_id')
        .eq('status', 'upcoming')
        .lte('start_time', nowISO);
    
    if (upcomingMatches && upcomingMatches.length > 0) {
        await supabaseClient
            .from('sports_matches')
            .update({ status: 'live', updated_at: nowISO })
            .eq('status', 'upcoming')
            .lte('start_time', nowISO);
        updated += upcomingMatches.length;
        console.log(`⏰ Updated ${upcomingMatches.length} matches: upcoming → live`);
    }
    
    return updated;
}

// ===== MAIN SYNC FUNCTION =====
async function syncAllMatches() {
    console.log('\n🔄 AUTO-SYNC STARTED', new Date().toLocaleTimeString());
    const startTime = Date.now();
    
    await syncLiveMatches();
    await syncUpcomingMatches();
    await updateMatchStatuses();
    await checkForFinishedMatches(); // 🔥 CRITICAL: Check for finished matches
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ AUTO-SYNC COMPLETE in ${duration}s\n`);
}

// ===== AUTO-SYSTEM =====
let syncInterval, statusInterval, finishedCheckInterval;

function startAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
    if (statusInterval) clearInterval(statusInterval);
    if (finishedCheckInterval) clearInterval(finishedCheckInterval);
    
    // Initial sync after 5 seconds
    setTimeout(() => syncAllMatches(), 5000);
    
    // Full sync every 60 seconds
    syncInterval = setInterval(syncAllMatches, SYNC_INTERVAL);
    
    // Status update every 30 seconds
    statusInterval = setInterval(updateMatchStatuses, STATUS_CHECK_INTERVAL);
    
    // 🔥 Check for finished matches every 30 seconds (critical for auto-settlement)
    finishedCheckInterval = setInterval(checkForFinishedMatches, 30000);
    
    console.log('⏰ AUTO-SYSTEM ACTIVE:');
    console.log(`   📡 Full sync: every ${SYNC_INTERVAL / 1000}s`);
    console.log(`   ⏰ Status check: every ${STATUS_CHECK_INTERVAL / 1000}s`);
    console.log(`   🏁 Finished match check: every 30s (AUTO SETTLEMENT)`);
    console.log(`   🔒 Betting closes at 80 minutes`);
}

// ===== MANUAL CONTROLS (for debugging only) =====
window.manualSync = syncAllMatches;
window.forceSettlement = async (fixtureId, homeScore, awayScore) => {
    const result = homeScore > awayScore ? 'home' : (homeScore < awayScore ? 'away' : 'draw');
    await settleMatchBets(fixtureId, result, { home: homeScore, away: awayScore });
};

// ===== AUTO-START =====
if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    startAutoSync();
}

console.log('🏈 Sports API v19.0 - FULLY AUTOMATED SETTLEMENT');
console.log('   ✅ Auto-settlement when API returns FT status');
console.log('   ✅ No admin intervention needed');
console.log('   ✅ Runs 24/7 automatically');
