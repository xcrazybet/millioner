// ============================================
// sports-api.js - v21.0 COMPLETE AUTOMATION
// ✅ ALL matches - automatic daily sync
// ✅ ALL live matches - real-time updates
// ✅ Betting activation - automatic when live
// ✅ Firebase wallet integration - FIXED
// ✅ Authentication integration - FIXED
// ✅ Balance updates - automatic
// ============================================

// ===== FIREBASE INITIALIZATION (FIXED) =====
let db, auth;

function initFirebase() {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            const firebaseConfig = {
                apiKey: "AIzaSyA72Yo_YGqno9PX25p3yQBvyflcaM-NqEM",
                authDomain: "x-bet-prod-jd.firebaseapp.com",
                projectId: "x-bet-prod-jd",
                storageBucket: "x-bet-prod-jd.firebasestorage.app",
                messagingSenderId: "499334334535",
                appId: "1:499334334535:web:bebc1bf817e24d9e3c4962"
            };
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        auth = firebase.auth();
        console.log('🔥 Firebase initialized with auth & wallet support');
    } else {
        console.warn('Firebase not loaded, wallet features delayed');
    }
}

// ===== WALLET & BALANCE MANAGEMENT (FIXED) =====
const WalletManager = {
    async getBalance(userId) {
        if (!db) await initFirebase();
        try {
            const walletDoc = await db.collection('wallets').doc(userId).get();
            if (walletDoc.exists) {
                return walletDoc.data().balance || 0;
            } else {
                // Create wallet for new user
                await db.collection('wallets').doc(userId).set({
                    balance: 1000, // Starting balance
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    currency: 'USD'
                });
                return 1000;
            }
        } catch(e) {
            console.error('Error getting balance:', e);
            return 0;
        }
    },

    async updateBalance(userId, amount, transactionType, referenceId) {
        if (!db) await initFirebase();
        try {
            const walletRef = db.collection('wallets').doc(userId);
            
            // Run as transaction to prevent race conditions
            const result = await db.runTransaction(async (transaction) => {
                const walletDoc = await transaction.get(walletRef);
                const currentBalance = walletDoc.exists ? walletDoc.data().balance : 0;
                const newBalance = currentBalance + amount;
                
                if (newBalance < 0) {
                    throw new Error('Insufficient balance');
                }
                
                transaction.set(walletRef, {
                    balance: newBalance,
                    updated_at: new Date().toISOString()
                }, { merge: true });
                
                // Log transaction
                const transactionRef = db.collection('wallet_transactions').doc();
                transaction.set(transactionRef, {
                    user_id: userId,
                    amount: amount,
                    type: transactionType, // 'bet_place', 'bet_win', 'bet_refund', 'deposit'
                    reference_id: referenceId,
                    balance_after: newBalance,
                    timestamp: new Date().toISOString()
                });
                
                return newBalance;
            });
            
            console.log(`💰 Balance updated for ${userId}: ${amount > 0 ? '+' : ''}${amount}, new balance: ${result}`);
            return result;
        } catch(e) {
            console.error('Error updating balance:', e);
            throw e;
        }
    },

    async deductForBet(userId, amount, betId) {
        return await this.updateBalance(userId, -amount, 'bet_place', betId);
    },

    async addWinnings(userId, amount, betId) {
        return await this.updateBalance(userId, amount, 'bet_win', betId);
    },

    async refundBet(userId, amount, betId) {
        return await this.updateBalance(userId, amount, 'bet_refund', betId);
    }
};

// ===== AUTHENTICATION INTEGRATION =====
function getCurrentUserId() {
    if (auth && auth.currentUser) {
        return auth.currentUser.uid;
    }
    // Check for localStorage token (fallback)
    const storedUser = localStorage.getItem('xbet_user');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            return user.uid || user.id;
        } catch(e) {}
    }
    return null;
}

// ===== CONFIGURATION =====
const API_BASE = 'https://millioner.onrender.com';
const BATCH_SIZE = 50;
const SYNC_INTERVAL = 60000; // 60 seconds
const LIVE_UPDATE_INTERVAL = 15000; // 15 seconds for live matches
const BETTING_CLOSE_MINUTE = 80; // Close betting at 80th minute

// ===== SUPABASE BET FUNCTIONS =====
const BetManager = {
    async placeBet(betData) {
        const userId = getCurrentUserId();
        if (!userId) {
            throw new Error('User not authenticated');
        }
        
        try {
            // Check if match exists and is live
            const { data: match, error: matchError } = await supabaseClient
                .from('sports_matches')
                .select('status, score, elapsed, bets_closed')
                .eq('fixture_id', betData.fixture_id)
                .single();
            
            if (matchError || !match) {
                throw new Error('Match not found');
            }
            
            // Betting rules
            if (match.status !== 'live') {
                throw new Error('Betting only available for live matches');
            }
            
            if (match.bets_closed) {
                throw new Error('Betting is closed for this match');
            }
            
            if (match.elapsed >= BETTING_CLOSE_MINUTE) {
                throw new Error(`Betting closes at ${BETTING_CLOSE_MINUTE}th minute`);
            }
            
            // Check balance
            const balance = await WalletManager.getBalance(userId);
            if (balance < betData.amount) {
                throw new Error('Insufficient balance');
            }
            
            // Create bet
            const bet = {
                id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                user_id: userId,
                fixture_id: betData.fixture_id,
                bet_type: betData.bet_type,
                odds: betData.odds,
                amount: betData.amount,
                potential_win: betData.amount * betData.odds,
                status: 'active',
                placed_at: new Date().toISOString(),
                match_status_at_bet: match.status,
                match_score_at_bet: match.score,
                match_elapsed_at_bet: match.elapsed
            };
            
            // Deduct balance
            await WalletManager.deductForBet(userId, betData.amount, bet.id);
            
            // Save bet to Supabase
            const { error: saveError } = await supabaseClient
                .from('bets')
                .insert(bet);
            
            if (saveError) throw saveError;
            
            console.log(`✅ Bet placed: ${bet.bet_type} @ ${bet.odds} for $${betData.amount}`);
            
            // Dispatch event for UI update
            window.dispatchEvent(new CustomEvent('betPlaced', { detail: bet }));
            
            return bet;
        } catch(e) {
            console.error('Bet placement error:', e);
            throw e;
        }
    },
    
    async getActiveBets(fixtureId = null) {
        const userId = getCurrentUserId();
        if (!userId) return [];
        
        let query = supabaseClient
            .from('bets')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active');
        
        if (fixtureId) {
            query = query.eq('fixture_id', fixtureId);
        }
        
        const { data, error } = await query;
        if (error) {
            console.error('Error getting active bets:', error);
            return [];
        }
        return data || [];
    },
    
    async updateBet(betId, updateData) {
        const { error } = await supabaseClient
            .from('bets')
            .update(updateData)
            .eq('id', betId);
        
        if (error) console.error('Error updating bet:', error);
        return !error;
    },
    
    async getUserBetHistory(limit = 50) {
        const userId = getCurrentUserId();
        if (!userId) return [];
        
        const { data, error } = await supabaseClient
            .from('bets')
            .select('*')
            .eq('user_id', userId)
            .order('placed_at', { ascending: false })
            .limit(limit);
        
        if (error) return [];
        return data || [];
    }
};

// Make available globally
window.BetManager = BetManager;
window.WalletManager = WalletManager;

// ===== FETCH FROM API WITH CACHE =====
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

async function fetchAPI(endpoint, skipCache = false) {
    const cacheKey = endpoint;
    
    if (!skipCache && cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
    }
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${API_BASE}${endpoint}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
    } catch(e) {
        console.error(`API fetch error ${endpoint}:`, e.message);
        return { success: false, data: [] };
    }
}

// ===== SYNC SINGLE MATCH =====
async function syncMatchToDB(match) {
    if (!match || !match.fixture) return false;
    
    const fixture = match.fixture;
    const teams = match.teams;
    const league = match.league;
    const fixtureId = fixture.id;
    
    if (!fixtureId) return false;
    
    try {
        const statusShort = fixture.status?.short;
        let status = 'upcoming';
        let isFinished = false;
        let shouldCloseBets = false;
        
        // Determine match status
        if (statusShort === '1H' || statusShort === '2H' || statusShort === 'HT') {
            status = 'live';
            // Close bets at 80th minute
            const elapsed = fixture.status?.elapsed || 0;
            if (elapsed >= BETTING_CLOSE_MINUTE) {
                shouldCloseBets = true;
            }
        } else if (statusShort === 'FT' || statusShort === 'AET' || statusShort === 'PEN') {
            status = 'finished';
            isFinished = true;
            shouldCloseBets = true;
        }
        
        // Get scores
        const score = {
            home: match.goals?.home || 0,
            away: match.goals?.away || 0
        };
        
        let result = null;
        if (isFinished) {
            if (score.home > score.away) result = 'home';
            else if (score.home < score.away) result = 'away';
            else result = 'draw';
        }
        
        // Calculate odds (dynamic based on live score)
        let odds = {
            home: 1.80,
            draw: 3.20,
            away: 2.80
        };
        
        if (status === 'live') {
            // Adjust odds based on current score
            const goalDiff = score.home - score.away;
            if (goalDiff > 0) {
                odds.home = Math.max(1.20, 1.80 - (goalDiff * 0.3));
                odds.away = Math.min(5.00, 2.80 + (goalDiff * 0.5));
                odds.draw = Math.min(4.00, 3.20 + (goalDiff * 0.2));
            } else if (goalDiff < 0) {
                odds.home = Math.min(5.00, 1.80 + (Math.abs(goalDiff) * 0.5));
                odds.away = Math.max(1.20, 2.80 - (Math.abs(goalDiff) * 0.3));
                odds.draw = Math.min(4.00, 3.20 + (Math.abs(goalDiff) * 0.2));
            }
        }
        
        const matchData = {
            fixture_id: fixtureId,
            status: status,
            result: result,
            odds: odds,
            league_id: league?.id || 0,
            league_name: league?.name || 'Unknown League',
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
            start_time: fixture.date,
            score: score,
            elapsed: fixture.status?.elapsed || 0,
            bets_closed: shouldCloseBets,
            updated_at: new Date().toISOString()
        };
        
        // Get existing match
        const { data: existing } = await supabaseClient
            .from('sports_matches')
            .select('status, bets_closed')
            .eq('fixture_id', fixtureId)
            .single();
        
        const { error } = await supabaseClient
            .from('sports_matches')
            .upsert(matchData, { onConflict: 'fixture_id' });
        
        if (error) {
            console.error(`Sync error for ${fixtureId}:`, error.message);
            return false;
        }
        
        // Log status changes
        if (existing && existing.status !== status) {
            console.log(`🔄 Match ${fixtureId} status changed: ${existing.status} → ${status}`);
            
            if (status === 'live') {
                console.log(`🔴 LIVE NOW: ${teams?.home?.name} vs ${teams?.away?.name}`);
                // Notify UI that betting is open
                window.dispatchEvent(new CustomEvent('matchLive', { detail: matchData }));
            }
        }
        
        // Close bets if needed
        if (shouldCloseBets && (!existing || !existing.bets_closed)) {
            console.log(`🔒 Betting closed for match ${fixtureId} (${status})`);
            window.dispatchEvent(new CustomEvent('betsClosed', { detail: { fixtureId, reason: status } }));
        }
        
        // Auto-settle if finished
        if (isFinished && (!existing || existing.status !== 'finished')) {
            console.log(`🏁 Match ${fixtureId} finished! Settling bets...`);
            await settleMatchBets(fixtureId, result, score);
        }
        
        return true;
    } catch(e) {
        console.error(`Error syncing match ${fixtureId}:`, e.message);
        return false;
    }
}

// ===== SETTLE BETS FOR FINISHED MATCH =====
async function settleMatchBets(fixtureId, result, score) {
    try {
        // Get all active bets for this fixture
        const { data: bets, error: betsError } = await supabaseClient
            .from('bets')
            .select('*')
            .eq('fixture_id', fixtureId)
            .eq('status', 'active');
        
        if (betsError) {
            console.error('Error fetching bets:', betsError);
            return;
        }
        
        if (!bets || bets.length === 0) {
            console.log(`No active bets for match ${fixtureId}`);
            await supabaseClient
                .from('sports_matches')
                .update({ bets_settled: true, settled_at: new Date().toISOString() })
                .eq('fixture_id', fixtureId);
            return;
        }
        
        console.log(`💰 Settling ${bets.length} bets for match ${fixtureId}`);
        console.log(`📊 Final: ${score.home} - ${score.away} (${result})`);
        
        let winnersCount = 0;
        let totalPayout = 0;
        
        for (const bet of bets) {
            let won = false;
            let winReason = '';
            
            // Evaluate bet based on type
            switch(bet.bet_type) {
                case 'home':
                    won = (result === 'home');
                    winReason = won ? 'Home win' : 'Home did not win';
                    break;
                case 'draw':
                    won = (result === 'draw');
                    winReason = won ? 'Draw' : 'Not a draw';
                    break;
                case 'away':
                    won = (result === 'away');
                    winReason = won ? 'Away win' : 'Away did not win';
                    break;
                case '1X':
                    won = (result === 'home' || result === 'draw');
                    winReason = won ? 'Home or Draw' : 'Neither home nor draw';
                    break;
                case '12':
                    won = (result === 'home' || result === 'away');
                    winReason = won ? 'Home or Away' : 'Draw';
                    break;
                case 'X2':
                    won = (result === 'draw' || result === 'away');
                    winReason = won ? 'Draw or Away' : 'Neither draw nor away';
                    break;
                case 'over25':
                    const total = score.home + score.away;
                    won = total > 2.5;
                    winReason = won ? `Over 2.5 (${total} goals)` : `Under 2.5 (${total} goals)`;
                    break;
                case 'under25':
                    const totalGoals = score.home + score.away;
                    won = totalGoals < 2.5;
                    winReason = won ? `Under 2.5 (${totalGoals} goals)` : `Over 2.5 (${totalGoals} goals)`;
                    break;
                case 'btts_yes':
                    won = (score.home > 0 && score.away > 0);
                    winReason = won ? 'Both teams scored' : 'Not both teams scored';
                    break;
                case 'btts_no':
                    won = !(score.home > 0 && score.away > 0);
                    winReason = won ? 'Clean sheet kept' : 'Both teams scored';
                    break;
            }
            
            if (won) {
                const payout = bet.amount * bet.odds;
                totalPayout += payout;
                winnersCount++;
                
                // Add winnings to wallet
                try {
                    await WalletManager.addWinnings(bet.user_id, payout, bet.id);
                    console.log(`✅ Bet ${bet.id} WON: +$${payout.toFixed(2)}`);
                } catch(e) {
                    console.error(`Failed to credit winnings for bet ${bet.id}:`, e);
                }
                
                // Update bet status
                await supabaseClient
                    .from('bets')
                    .update({
                        status: 'won',
                        result: result,
                        payout: payout,
                        settlement_reason: winReason,
                        settled_at: new Date().toISOString()
                    })
                    .eq('id', bet.id);
            } else {
                await supabaseClient
                    .from('bets')
                    .update({
                        status: 'lost',
                        result: result,
                        payout: 0,
                        settlement_reason: winReason,
                        settled_at: new Date().toISOString()
                    })
                    .eq('id', bet.id);
                console.log(`❌ Bet ${bet.id} LOST: ${winReason}`);
            }
        }
        
        // Update match as settled
        await supabaseClient
            .from('sports_matches')
            .update({
                bets_settled: true,
                settled_at: new Date().toISOString(),
                settlement_summary: {
                    total_bets: bets.length,
                    winners: winnersCount,
                    total_payout: totalPayout
                }
            })
            .eq('fixture_id', fixtureId);
        
        console.log(`✅ Settlement complete: ${winnersCount}/${bets.length} winners, $${totalPayout.toFixed(2)} paid out`);
        
        // Notify UI
        window.dispatchEvent(new CustomEvent('betsSettled', {
            detail: { fixtureId, winnersCount, totalPayout }
        }));
        
    } catch(e) {
        console.error('Settlement error:', e);
    }
}

// ===== SYNC ALL MATCHES FOR DATE RANGE =====
async function syncMatchesForDateRange(startDate, endDate) {
    const from = startDate.toISOString().split('T')[0];
    const to = endDate.toISOString().split('T')[0];
    
    console.log(`📅 Syncing matches from ${from} to ${to}`);
    
    const data = await fetchAPI(`/api/fixtures/range/${from}/${to}`);
    
    if (data.success && data.data && data.data.length > 0) {
        console.log(`📡 Found ${data.data.length} total matches`);
        
        let synced = 0;
        for (let i = 0; i < data.data.length; i += BATCH_SIZE) {
            const batch = data.data.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(m => syncMatchToDB(m)));
            synced += results.filter(r => r === true).length;
        }
        
        console.log(`✅ Synced ${synced} matches to database`);
        return synced;
    }
    return 0;
}

// ===== SYNC LIVE MATCHES ONLY =====
async function syncLiveMatches() {
    console.log('🔴 Fetching live matches...');
    const data = await fetchAPI('/api/livescores', true); // Skip cache for live
    
    if (data.success && data.data && data.data.length > 0) {
        const liveMatches = data.data.filter(m => {
            const status = m.fixture?.status?.short;
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

// ===== UPDATE ALL MATCH STATUSES =====
async function updateAllMatchStatuses() {
    const now = new Date();
    const nowISO = now.toISOString();
    
    // Update upcoming to live
    const { data: toStart } = await supabaseClient
        .from('sports_matches')
        .select('fixture_id')
        .eq('status', 'upcoming')
        .lte('start_time', nowISO);
    
    if (toStart && toStart.length > 0) {
        await supabaseClient
            .from('sports_matches')
            .update({ status: 'live', updated_at: nowISO })
            .eq('status', 'upcoming')
            .lte('start_time', nowISO);
        
        console.log(`🎯 ${toStart.length} matches are now LIVE!`);
        
        // Fetch details for newly live matches
        for (const match of toStart) {
            const data = await fetchAPI(`/api/fixture/${match.fixture_id}`);
            if (data.success && data.fixture) {
                await syncMatchToDB(data);
            }
        }
    }
    
    return toStart?.length || 0;
}

// ===== AUTO-SYNC FOR ALL MATCHES (RUNS DAILY) =====
async function syncAllMatchesForNext30Days() {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);
    
    await syncMatchesForDateRange(today, endDate);
}

// ===== MAIN SYNC FUNCTION =====
let lastFullSyncDate = null;

async function autoSync() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Full sync once per day (for upcoming matches)
    if (lastFullSyncDate !== todayStr) {
        console.log('\n📅 RUNNING DAILY FULL SYNC');
        await syncAllMatchesForNext30Days();
        lastFullSyncDate = todayStr;
    }
    
    // Live sync every time
    console.log(`\n🔄 AUTO-SYNC ${now.toLocaleTimeString()}`);
    const start = Date.now();
    
    await syncLiveMatches();
    const statusUpdated = await updateAllMatchStatuses();
    
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ Sync complete in ${duration}s (Status updates: ${statusUpdated})\n`);
}

// ===== START AUTOMATION =====
let liveInterval, statusInterval;

function startAutomation() {
    if (liveInterval) clearInterval(liveInterval);
    if (statusInterval) clearInterval(statusInterval);
    
    // Initial sync
    setTimeout(() => autoSync(), 3000);
    
    // Live matches every 15 seconds
    liveInterval = setInterval(() => syncLiveMatches(), LIVE_UPDATE_INTERVAL);
    
    // Full auto-sync every 60 seconds (includes status updates)
    statusInterval = setInterval(() => autoSync(), SYNC_INTERVAL);
    
    console.log('🚀 AUTOMATION ACTIVE:');
    console.log(`   🔴 Live matches: every ${LIVE_UPDATE_INTERVAL / 1000}s`);
    console.log(`   📡 Full sync: every ${SYNC_INTERVAL / 1000}s`);
    console.log(`   📅 Daily full sync for upcoming matches`);
    console.log(`   💰 Auto-settlement when matches finish`);
    console.log(`   🔒 Bets close at ${BETTING_CLOSE_MINUTE}th minute`);
}

// ===== EXPOSE GLOBALS FOR UI =====
window.sportsAPI = {
    syncNow: autoSync,
    getLiveMatches: async () => {
        const { data } = await supabaseClient
            .from('sports_matches')
            .select('*')
            .eq('status', 'live')
            .order('start_time', { ascending: true });
        return data || [];
    },
    getUpcomingMatches: async () => {
        const { data } = await supabaseClient
            .from('sports_matches')
            .select('*')
            .eq('status', 'upcoming')
            .order('start_time', { ascending: true })
            .limit(50);
        return data || [];
    },
    getFinishedMatches: async (limit = 20) => {
        const { data } = await supabaseClient
            .from('sports_matches')
            .select('*')
            .eq('status', 'finished')
            .order('updated_at', { ascending: false })
            .limit(limit);
        return data || [];
    },
    placeBet: BetManager.placeBet,
    getBalance: () => {
        const userId = getCurrentUserId();
        return userId ? WalletManager.getBalance(userId) : 0;
    },
    getBetHistory: BetManager.getUserBetHistory
};

// ===== INITIALIZE =====
initFirebase();

// Wait for Supabase
if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    startAutomation();
} else {
    console.log('Waiting for Supabase client...');
    const checkInterval = setInterval(() => {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            clearInterval(checkInterval);
            startAutomation();
        }
    }, 1000);
}

console.log('🏆 SPORTS BETTING SYSTEM v21.0 - FULLY AUTOMATED');
console.log('   ✅ ALL matches - automatic daily sync');
console.log('   ✅ Live betting - active when matches start');
console.log('   ✅ Auto-settlement - instant when matches finish');
console.log('   ✅ Wallet integration - Firebase auth ready');
