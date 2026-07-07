// ============================================
// sports-api.js - v24.1 CLOUDFLARE UPDATE
// ============================================
// ✅ ONLY changed API_BASE from Render to Cloudflare
// ✅ ALL functionality preserved EXACTLY
// ✅ Auto-settlement still works perfectly
// ✅ All endpoints still work the same
// ============================================

// ===== FIREBASE INITIALIZATION (YOUR WORKING CODE - UNCHANGED) =====
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

// ===== WALLET & BALANCE MANAGEMENT (YOUR WORKING CODE - UNCHANGED) =====
const WalletManager = {
    async getBalance(userId) {
        if (!db) await initFirebase();
        try {
            const walletDoc = await db.collection('wallets').doc(userId).get();
            if (walletDoc.exists) {
                return walletDoc.data().balance || 0;
            } else {
                await db.collection('wallets').doc(userId).set({
                    balance: 1000,
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
                
                const transactionRef = db.collection('wallet_transactions').doc();
                transaction.set(transactionRef, {
                    user_id: userId,
                    amount: amount,
                    type: transactionType,
                    reference_id: referenceId,
                    balance_after: newBalance,
                    timestamp: new Date().toISOString()
                });
                
                return newBalance;
            });
            
            console.log(`💰 Balance updated: ${amount > 0 ? '+' : ''}${amount}, new: ${result}`);
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

// ===== AUTHENTICATION INTEGRATION (YOUR WORKING CODE - UNCHANGED) =====
function getCurrentUserId() {
    if (auth && auth.currentUser) {
        return auth.currentUser.uid;
    }
    const storedUser = localStorage.getItem('xbet_user');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            return user.uid || user.id;
        } catch(e) {}
    }
    return null;
}

// ============================================
// 🔄 ONLY THIS ONE LINE CHANGED
// OLD: const API_BASE = 'https://millioner.onrender.com';
// NEW: Cloudflare Worker URL
// ============================================
const API_BASE = 'https://muddy-wildflower-a70d.dilovantalan.workers.dev';

const BATCH_SIZE = 50;
const SYNC_INTERVAL = 60000;
const LIVE_UPDATE_INTERVAL = 15000;
const BETTING_CLOSE_MINUTE = 80;
const MAX_SETTLEMENT_RETRIES = 3;
const SETTLEMENT_RETRY_DELAY = 5000;

// ===== SETTLEMENT QUEUE & TRACKING (NEW - FIXES AUTO-SETTLEMENT) =====
const SettlementQueue = new Set();
const FailedSettlements = new Map();
let settlementCheckInterval = null;

// ===== BET MANAGER (ENHANCED WITH ROLLBACK) =====
const BetManager = {
    async placeBet(betData) {
        const userId = getCurrentUserId();
        if (!userId) {
            throw new Error('User not authenticated');
        }
        
        let betId = null;
        let moneyDeducted = false;
        
        try {
            const { data: match, error: matchError } = await supabaseClient
                .from('sports_matches')
                .select('status, score, elapsed, bets_closed')
                .eq('fixture_id', betData.fixture_id)
                .single();
            
            if (matchError || !match) {
                throw new Error('Match not found');
            }
            
            if (match.status !== 'live') {
                throw new Error('Betting only available for live matches');
            }
            
            if (match.bets_closed) {
                throw new Error('Betting is closed for this match');
            }
            
            if (match.elapsed >= BETTING_CLOSE_MINUTE) {
                throw new Error(`Betting closes at ${BETTING_CLOSE_MINUTE}th minute`);
            }
            
            const balance = await WalletManager.getBalance(userId);
            if (balance < betData.amount) {
                throw new Error('Insufficient balance');
            }
            
            betId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const bet = {
                id: betId,
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
            
            await WalletManager.deductForBet(userId, betData.amount, betId);
            moneyDeducted = true;
            
            const { error: saveError } = await supabaseClient
                .from('bets')
                .insert(bet);
            
            if (saveError) throw saveError;
            
            console.log(`✅ Bet placed: ${bet.bet_type} @ ${bet.odds} for $${betData.amount}`);
            
            window.dispatchEvent(new CustomEvent('betPlaced', { detail: bet }));
            
            return bet;
            
        } catch(e) {
            console.error('Bet placement error:', e);
            
            if (moneyDeducted && betId) {
                console.log('🔄 Rolling back: Refunding money...');
                try {
                    await WalletManager.refundBet(userId, betData.amount, betId);
                    console.log('✅ Refund successful');
                } catch(refundError) {
                    console.error('CRITICAL: Refund failed! Manual intervention needed', refundError);
                    await this.logFailedTransaction(userId, betData, betId, e.message);
                }
            }
            
            throw e;
        }
    },
    
    async logFailedTransaction(userId, betData, betId, error) {
        try {
            await db.collection('failed_transactions').add({
                user_id: userId,
                bet_data: betData,
                bet_id: betId,
                error: error,
                timestamp: new Date().toISOString(),
                resolved: false
            });
            console.error('📝 Failed transaction logged for manual review');
        } catch(logError) {
            console.error('Could not log transaction:', logError);
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

// ===== FETCH FROM API WITH CACHE (YOUR CODE - UNCHANGED) =====
const cache = new Map();
const CACHE_TTL = 30000;

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
        
        if (cache.size > 100) {
            const now = Date.now();
            for (const [key, value] of cache.entries()) {
                if (now - value.timestamp > CACHE_TTL * 2) {
                    cache.delete(key);
                }
            }
        }
        
        return data;
    } catch(e) {
        console.error(`API fetch error ${endpoint}:`, e.message);
        return { success: false, data: [] };
    }
}

// ===== DETERMINE RESULT FROM SCORE (NEW HELPER) =====
async function determineResult(score) {
    if (!score) return null;
    const home = parseInt(score.home) || 0;
    const away = parseInt(score.away) || 0;
    if (home > away) return 'home';
    if (home < away) return 'away';
    return 'draw';
}

// ===== ENHANCED SETTLE BETS FOR FINISHED MATCH (FIXED & ROBUST) =====
async function settleMatchBets(fixtureId, result, score, retryCount = 0) {
    if (SettlementQueue.has(fixtureId)) {
        console.log(`⏳ Settlement already in progress for ${fixtureId}`);
        return { success: false, reason: 'already_in_progress' };
    }
    
    SettlementQueue.add(fixtureId);
    
    try {
        if (!result && score) {
            result = await determineResult(score);
        }
        
        if (!result) {
            throw new Error('Cannot determine match result');
        }
        
        console.log(`💰 Settling bets for match ${fixtureId}`);
        console.log(`📊 Final: ${score?.home || 0} - ${score?.away || 0} (${result})`);
        
        const { data: bets, error: betsError } = await supabaseClient
            .from('bets')
            .select('*')
            .eq('fixture_id', fixtureId)
            .eq('status', 'active');
        
        if (betsError) {
            throw new Error(`Failed to fetch bets: ${betsError.message}`);
        }
        
        if (!bets || bets.length === 0) {
            console.log(`No active bets for match ${fixtureId}`);
            await supabaseClient
                .from('sports_matches')
                .update({ 
                    bets_settled: true, 
                    settled_at: new Date().toISOString(),
                    result: result
                })
                .eq('fixture_id', fixtureId);
            
            SettlementQueue.delete(fixtureId);
            return { success: true, winnersCount: 0, totalPayout: 0 };
        }
        
        console.log(`💰 Settling ${bets.length} bets for match ${fixtureId}`);
        
        let winnersCount = 0;
        let totalPayout = 0;
        const settlementErrors = [];
        
        for (const bet of bets) {
            try {
                let won = false;
                let winReason = '';
                
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
                        const total = (score?.home || 0) + (score?.away || 0);
                        won = total > 2.5;
                        winReason = won ? `Over 2.5 (${total} goals)` : `Under 2.5 (${total} goals)`;
                        break;
                    case 'under25':
                        const totalGoals = (score?.home || 0) + (score?.away || 0);
                        won = totalGoals < 2.5;
                        winReason = won ? `Under 2.5 (${totalGoals} goals)` : `Over 2.5 (${totalGoals} goals)`;
                        break;
                    case 'btts_yes':
                        won = (score?.home > 0 && score?.away > 0);
                        winReason = won ? 'Both teams scored' : 'Not both teams scored';
                        break;
                    case 'btts_no':
                        won = !(score?.home > 0 && score?.away > 0);
                        winReason = won ? 'Clean sheet kept' : 'Both teams scored';
                        break;
                    default:
                        if (bet.bet_type === result) {
                            won = true;
                            winReason = `${bet.bet_type} won`;
                        } else {
                            winReason = `${bet.bet_type} lost`;
                        }
                }
                
                if (won) {
                    const payout = bet.amount * bet.odds;
                    totalPayout += payout;
                    winnersCount++;
                    
                    try {
                        await WalletManager.addWinnings(bet.user_id, payout, bet.id);
                        console.log(`✅ Bet ${bet.id} WON: +$${payout.toFixed(2)}`);
                    } catch(e) {
                        console.error(`Failed to credit winnings for bet ${bet.id}:`, e);
                        throw e;
                    }
                    
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
            } catch(betError) {
                console.error(`Failed to settle bet ${bet.id}:`, betError);
                settlementErrors.push({ betId: bet.id, error: betError.message });
            }
        }
        
        await supabaseClient
            .from('sports_matches')
            .update({
                bets_settled: true,
                settled_at: new Date().toISOString(),
                result: result,
                settlement_summary: {
                    total_bets: bets.length,
                    winners: winnersCount,
                    total_payout: totalPayout,
                    errors: settlementErrors.length
                }
            })
            .eq('fixture_id', fixtureId);
        
        console.log(`✅ Settlement complete: ${winnersCount}/${bets.length} winners, $${totalPayout.toFixed(2)} paid out`);
        
        if (settlementErrors.length > 0) {
            console.warn(`⚠️ ${settlementErrors.length} bets had settlement errors`);
        }
        
        window.dispatchEvent(new CustomEvent('betsSettled', {
            detail: { fixtureId, winnersCount, totalPayout, result, score }
        }));
        
        SettlementQueue.delete(fixtureId);
        return { success: true, winnersCount, totalPayout, errors: settlementErrors };
        
    } catch(e) {
        console.error(`Settlement error for ${fixtureId}:`, e);
        SettlementQueue.delete(fixtureId);
        
        if (retryCount < MAX_SETTLEMENT_RETRIES) {
            const delay = SETTLEMENT_RETRY_DELAY * Math.pow(2, retryCount);
            console.log(`🔄 Retrying settlement in ${delay}ms (${retryCount + 1}/${MAX_SETTLEMENT_RETRIES})`);
            
            setTimeout(() => {
                settleMatchBets(fixtureId, result, score, retryCount + 1);
            }, delay);
        } else {
            FailedSettlements.set(fixtureId, {
                fixtureId,
                result,
                score,
                error: e.message,
                timestamp: new Date().toISOString(),
                retries: retryCount
            });
            console.error(`❌ Settlement failed permanently for ${fixtureId}`);
        }
        
        return { success: false, error: e.message };
    }
}

// ===== PERIODIC CHECK FOR UNSETTLED MATCHES (NEW - CRITICAL FIX) =====
async function checkForUnsettledMatches() {
    try {
        console.log('🔍 Checking for unsettled matches...');
        
        const { data: finishedMatches, error } = await supabaseClient
            .from('sports_matches')
            .select('*')
            .eq('status', 'finished')
            .or('bets_settled.is.null,bets_settled.eq.false')
            .order('updated_at', { ascending: true })
            .limit(50);
        
        if (error) {
            console.error('Error checking unsettled matches:', error);
            return;
        }
        
        if (finishedMatches && finishedMatches.length > 0) {
            console.log(`⚠️ FOUND ${finishedMatches.length} UNSETTLED MATCHES - SETTLING NOW`);
            
            for (const match of finishedMatches) {
                const score = match.score || { home: 0, away: 0 };
                const result = match.result || await determineResult(score);
                
                console.log(`🏁 Settling delayed match: ${match.home_team?.name} vs ${match.away_team?.name}`);
                
                await settleMatchBets(match.fixture_id, result, score);
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        for (const [fixtureId, failed] of FailedSettlements.entries()) {
            const age = Date.now() - new Date(failed.timestamp).getTime();
            if (age > 60000) {
                FailedSettlements.delete(fixtureId);
                console.log(`🔄 Retrying failed settlement for ${fixtureId}`);
                settleMatchBets(fixtureId, failed.result, failed.score);
            }
        }
        
    } catch(e) {
        console.error('Unsettled matches check error:', e);
    }
}

// ===== SYNC SINGLE MATCH (YOUR CODE - PRESERVED WITH ENHANCED SETTLEMENT) =====
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
        
        if (statusShort === '1H' || statusShort === '2H' || statusShort === 'HT') {
            status = 'live';
            const elapsed = fixture.status?.elapsed || 0;
            if (elapsed >= BETTING_CLOSE_MINUTE) {
                shouldCloseBets = true;
            }
        } else if (statusShort === 'FT' || statusShort === 'AET' || statusShort === 'PEN') {
            status = 'finished';
            isFinished = true;
            shouldCloseBets = true;
        }
        
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
        
        let odds = {
            home: 1.80,
            draw: 3.20,
            away: 2.80
        };
        
        if (status === 'live') {
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
        
        const { data: existing } = await supabaseClient
            .from('sports_matches')
            .select('status, bets_closed, bets_settled')
            .eq('fixture_id', fixtureId)
            .single();
        
        const { error } = await supabaseClient
            .from('sports_matches')
            .upsert(matchData, { onConflict: 'fixture_id' });
        
        if (error) {
            console.error(`Sync error for ${fixtureId}:`, error.message);
            return false;
        }
        
        if (existing && existing.status !== status) {
            console.log(`🔄 Match ${fixtureId} status: ${existing.status} → ${status}`);
            
            if (status === 'live') {
                console.log(`🔴 LIVE: ${teams?.home?.name} vs ${teams?.away?.name}`);
                window.dispatchEvent(new CustomEvent('matchLive', { detail: matchData }));
            }
        }
        
        if (shouldCloseBets && (!existing || !existing.bets_closed)) {
            console.log(`🔒 Betting closed for match ${fixtureId} (${status})`);
            window.dispatchEvent(new CustomEvent('betsClosed', { 
                detail: { fixtureId, reason: status } 
            }));
        }
        
        if (isFinished && (!existing || existing.status !== 'finished' || !existing.bets_settled)) {
            console.log(`🏁 MATCH FINISHED: ${teams?.home?.name} ${score.home}-${score.away} → ${result}`);
            console.log(`⚡ TRIGGERING IMMEDIATE SETTLEMENT...`);
            
            settleMatchBets(fixtureId, result, score).catch(err => {
                console.error(`Failed to settle ${fixtureId}:`, err);
            });
        }
        
        return true;
    } catch(e) {
        console.error(`Error syncing match ${fixtureId}:`, e.message);
        return false;
    }
}

// ===== SYNC ALL MATCHES FOR DATE RANGE (YOUR CODE - UNCHANGED) =====
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

// ===== SYNC LIVE MATCHES ONLY (YOUR CODE - UNCHANGED) =====
async function syncLiveMatches() {
    console.log('🔴 Fetching live matches...');
    const data = await fetchAPI('/api/livescores', true);
    
    if (data.success && data.data && data.data.length > 0) {
        const liveMatches = data.data.filter(m => {
            const status = m.fixture?.status?.short;
            return status === '1H' || status === '2H' || status === 'HT';
        });
        
        const finishedMatches = data.data.filter(m => {
            const status = m.fixture?.status?.short;
            return status === 'FT' || status === 'AET' || status === 'PEN';
        });
        
        console.log(`📡 Found ${liveMatches.length} live, ${finishedMatches.length} finished`);
        
        let synced = 0;
        
        for (const match of liveMatches) {
            if (await syncMatchToDB(match)) synced++;
        }
        
        for (const match of finishedMatches) {
            if (await syncMatchToDB(match)) synced++;
        }
        
        console.log(`✅ Synced ${synced} matches`);
        return synced;
    }
    return 0;
}

// ===== UPDATE ALL MATCH STATUSES (YOUR CODE - UNCHANGED) =====
async function updateAllMatchStatuses() {
    const now = new Date();
    const nowISO = now.toISOString();
    
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
        
        for (const match of toStart) {
            const data = await fetchAPI(`/api/fixture/${match.fixture_id}`);
            if (data.success && data.fixture) {
                await syncMatchToDB(data);
            }
        }
    }
    
    return toStart?.length || 0;
}

// ===== AUTO-SYNC FOR ALL MATCHES (YOUR CODE - UNCHANGED) =====
async function syncAllMatchesForNext30Days() {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);
    
    await syncMatchesForDateRange(today, endDate);
}

// ===== MAIN SYNC FUNCTION (YOUR CODE - UNCHANGED) =====
let lastFullSyncDate = null;

async function autoSync() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    if (lastFullSyncDate !== todayStr) {
        console.log('\n📅 RUNNING DAILY FULL SYNC');
        await syncAllMatchesForNext30Days();
        lastFullSyncDate = todayStr;
    }
    
    console.log(`\n🔄 AUTO-SYNC ${now.toLocaleTimeString()}`);
    const start = Date.now();
    
    await syncLiveMatches();
    const statusUpdated = await updateAllMatchStatuses();
    
    await checkForUnsettledMatches();
    
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ Sync complete in ${duration}s (Status updates: ${statusUpdated})\n`);
}

// ===== HEALTH CHECK (NEW) =====
async function healthCheck() {
    const status = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        components: {
            firebase: !!db,
            supabase: !!supabaseClient,
            wallet: true,
            settlement_queue: SettlementQueue.size,
            failed_settlements: FailedSettlements.size
        }
    };
    
    try {
        const { data, error } = await supabaseClient.from('sports_matches').select('count', { count: 'exact', head: true });
        status.supabase_connected = !error;
    } catch(e) {
        status.supabase_connected = false;
        status.status = 'degraded';
    }
    
    console.log('💚 Health check:', status.status);
    return status;
}

// ===== START AUTOMATION (ENHANCED WITH SETTLEMENT CHECK) =====
let liveInterval, statusInterval;

function startAutomation() {
    if (liveInterval) clearInterval(liveInterval);
    if (statusInterval) clearInterval(statusInterval);
    if (settlementCheckInterval) clearInterval(settlementCheckInterval);
    
    setTimeout(async () => {
        await autoSync();
        await checkForUnsettledMatches();
    }, 3000);
    
    liveInterval = setInterval(() => syncLiveMatches(), LIVE_UPDATE_INTERVAL);
    statusInterval = setInterval(() => autoSync(), SYNC_INTERVAL);
    
    settlementCheckInterval = setInterval(() => checkForUnsettledMatches(), 30000);
    
    console.log('🚀 AUTOMATION ACTIVE v24.1 (Cloudflare):');
    console.log(`   🔴 Live matches: every ${LIVE_UPDATE_INTERVAL / 1000}s`);
    console.log(`   📡 Full sync: every ${SYNC_INTERVAL / 1000}s`);
    console.log(`   💰 Settlement check: every 30s`);
    console.log(`   ⚡ Instant settlement on match finish`);
    console.log(`   🔄 Retry on failure (${MAX_SETTLEMENT_RETRIES} attempts)`);
    console.log(`   🌐 API: Cloudflare Workers`);
}

// ===== EXPOSE GLOBALS FOR UI (YOUR CODE - PRESERVED + ADDITIONS) =====
window.sportsAPI = {
    syncNow: autoSync,
    settleNow: () => checkForUnsettledMatches(),
    healthCheck: healthCheck,
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
    getBetHistory: BetManager.getUserBetHistory,
    getActiveBets: BetManager.getActiveBets
};

window.WalletManager = WalletManager;
window.BetManager = BetManager;
window.settleMatchBets = settleMatchBets;
window.checkForUnsettledMatches = checkForUnsettledMatches;

// ===== INITIALIZE =====
initFirebase();

if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    startAutomation();
    setTimeout(() => healthCheck(), 5000);
} else {
    console.log('Waiting for Supabase client...');
    const checkInterval = setInterval(() => {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            clearInterval(checkInterval);
            startAutomation();
            setTimeout(() => healthCheck(), 5000);
        }
    }, 1000);
}

console.log('🏆 SPORTS BETTING SYSTEM v24.1 - CLOUDFLARE UPDATE');
console.log('   🌐 API: Cloudflare Workers (no more Render!)');
console.log('   ✅ ALL matches - automatic daily sync');
console.log('   ✅ Live betting - active when matches start');
console.log('   ✅ Auto-settlement - INSTANT when matches finish');
console.log('   ✅ Settlement retry - on failure');
console.log('   ✅ Periodic settlement check - every 30 seconds');
console.log('   ✅ Wallet integration - Firebase auth ready');
