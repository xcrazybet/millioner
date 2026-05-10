// ============================================
// sports-api.js - v13.0 FIXED
// ✅ Firebase initialized
// ✅ All bet types settlement
// ✅ Auto-sync working
// ============================================

// ===== FIREBASE INITIALIZATION - FIXED =====
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
    console.log('🔥 Firebase initialized in sports-api.js');
}

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
    if (!window.supaDB) {
        console.warn('supaDB not available');
        return;
    }
    
    // Check if Firebase is initialized
    if (!firebase || !firebase.firestore) {
        console.warn('Firebase not initialized yet');
        return;
    }
    
    try {
        const bets = await window.supaDB.getActiveBets(fixtureId);
        
        if (!bets || bets.length === 0) {
            return;
        }
        
        const db = firebase.firestore();
        
        for (const bet of bets) {
            let won = false;
            let payout = 0;
            
            // 1X2 BETS
            if (bet.bet_type === 'home') won = (result === 'home');
            else if (bet.bet_type === 'draw') won = (result === 'draw');
            else if (bet.bet_type === 'away') won = (result === 'away');
            
            // DOUBLE CHANCE BETS
            else if (bet.bet_type === '1X') won = (result === 'home' || result === 'draw');
            else if (bet.bet_type === '12') won = (result === 'home' || result === 'away');
            else if (bet.bet_type === 'X2') won = (result === 'draw' || result === 'away');
            
            // OVER/UNDER BETS
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
            
            // BTTS
            else if (bet.bet_type === 'btts_yes') {
                const match = await window.supaDB.getMatch(fixtureId);
                won = (match?.score?.home > 0 && match?.score?.away > 0);
            }
            else if (bet.bet_type === 'btts_no') {
                const match = await window.supaDB.getMatch(fixtureId);
                won = !(match?.score?.home > 0 && match?.score?.away > 0);
            }
            
            if (won) {
                payout = bet.amount * bet.odds;
                try {
                    const wallet = await db.collection('wallets').doc(bet.user_id).get();
                    const newBalance = (wallet.data()?.balance || 0) + payout;
                    await db.collection('wallets').doc(bet.user_id).update({ balance: newBalance });
                    console.log(`💰 Bet ${bet.id} WON - User ${bet.user_id} +$${payout.toFixed(2)}`);
                } catch(e) {
                    console.error(`Failed to update wallet for bet ${bet.id}:`, e);
                }
                
                await window.supaDB.updateBet(bet.id, {
                    status: 'won',
                    result: result,
                    payout: payout,
                    settled_at: new Date().toISOString()
                });
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

async function syncUpcomingMatches() {
    console.log('📅 Syncing matches for 90 days...');
    const data = await fetchAPI('/api/fixtures/week');
    
    if (data.success && data.data && data.data.length > 0) {
        console.log(`📡 Found ${data.data.length} matches from API`);
        let synced = 0;
        for (const match of data.data) {
            if (await syncMatchToDB(match)) synced++;
            if (synced % 50 === 0) console.log(`   Synced ${synced}/${data.data.length}`);
        }
        console.log(`✅ Synced ${synced} matches to Supabase`);
        return synced;
    }
    return 0;
}

async function syncLiveMatches() {
    console.log('🔴 Syncing live matches...');
    const data = await fetchAPI('/api/livescores');
    
    if (data.success && data.data && data.data.length > 0) {
        console.log(`📡 Found ${data.data.length} live matches`);
        let synced = 0;
        for (const match of data.data) {
            if (await syncMatchToDB(match)) synced++;
        }
        console.log(`✅ Synced ${synced} live matches`);
        return synced;
    }
    return 0;
}

async function forceUpdateMatchStatuses() {
    if (!supabaseClient) return 0;
    
    const now = new Date();
    const nowISO = now.toISOString();
    let updated = 0;
    
    // Update upcoming → live
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
    
    // Update live → finished (matches older than 105 minutes)
    const { data: liveMatches } = await supabaseClient
        .from('sports_matches')
        .select('fixture_id, start_time, score')
        .eq('status', 'live');
    
    if (liveMatches && liveMatches.length > 0) {
        for (const match of liveMatches) {
            const matchStart = new Date(match.start_time);
            const elapsedMinutes = (now - matchStart) / 60000;
            if (elapsedMinutes > 105) {
                const result = match.score?.home > match.score?.away ? 'home' :
                              (match.score?.home < match.score?.away ? 'away' : 'draw');
                await supabaseClient
                    .from('sports_matches')
                    .update({ status: 'finished', result: result, updated_at: nowISO })
                    .eq('fixture_id', match.fixture_id);
                updated++;
                console.log(`🏁 Marked match ${match.fixture_id} as finished`);
                await settleMatchBets(match.fixture_id, result);
            }
        }
    }
    
    return updated;
}

async function syncAllMatches() {
    console.log('\n🔄 SYNC STARTED', new Date().toLocaleTimeString());
    const startTime = Date.now();
    
    await syncLiveMatches();
    await syncUpcomingMatches();
    const statusUpdates = await forceUpdateMatchStatuses();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ SYNC COMPLETE in ${duration}s - Status updates: ${statusUpdates}\n`);
}

let syncInterval, statusInterval;

function startAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
    if (statusInterval) clearInterval(statusInterval);
    
    setTimeout(() => syncAllMatches(), 3000);
    syncInterval = setInterval(syncAllMatches, 60000);
    statusInterval = setInterval(forceUpdateMatchStatuses, 15000);
    
    console.log('⏰ Auto-sync active (every 60s)');
}

window.manualSync = syncAllMatches;
window.forceSync = syncAllMatches;
window.updateStatuses = forceUpdateMatchStatuses;

if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    startAutoSync();
}

console.log('🏈 Sports API v13.0 - Fixed (Firebase initialized)');
