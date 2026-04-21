// ============================================
// js/sports-api.js - COMPLETE v17.0
// X Lodon Sports - API-Football Integration
// Auto-settlement, Cleanup, Caching, Full Functions
// ============================================

const BACKEND_URL = 'https://millioner.onrender.com';

// ===== FETCH FROM BACKEND =====
async function fetchFromBackend(endpoint) {
    try {
        const url = `${BACKEND_URL}${endpoint}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`❌ ${endpoint}:`, error.message);
        return { success: false, data: [] };
    }
}

// ===== FETCH FUNCTIONS =====
async function fetchLiveMatches() {
    return await fetchFromBackend('/api/livescores');
}

async function fetchUpcomingWeek() {
    return await fetchFromBackend('/api/fixtures/week');
}

async function fetchTodayMatches() {
    return await fetchFromBackend('/api/fixtures/today');
}

async function fetchFixturesByDate(date) {
    return await fetchFromBackend(`/api/fixtures/date/${date}`);
}

async function fetchFixturesBetween(from, to) {
    return await fetchFromBackend(`/api/fixtures/between/${from}/${to}`);
}

async function fetchFixtureById(fixtureId) {
    return await fetchFromBackend(`/api/fixtures/${fixtureId}`);
}

async function fetchLeagues() {
    return await fetchFromBackend('/api/leagues');
}

async function fetchOdds(fixtureId) {
    return await fetchFromBackend(`/api/odds/${fixtureId}`);
}

// ===== TEST CONNECTION =====
async function testAPIConnection() {
    console.log('🔍 Testing API connection...');
    const result = await fetchFromBackend('/api/debug');
    console.log('API Status:', result);
    return result;
}

// ===== STATUS MAPPING (API-Football) =====
function getMatchStatus(match) {
    const status = match.fixture?.status?.short;
    
    if (!status || status === 'TBD' || status === 'NS') return 'upcoming';
    if (status === '1H' || status === 'HT' || status === '2H' || 
        status === 'ET' || status === 'P' || status === 'LIVE') return 'live';
    if (status === 'FT' || status === 'AET' || status === 'PEN') return 'finished';
    if (status === 'CANC') return 'cancelled';
    if (status === 'PST') return 'postponed';
    if (status === 'SUSP') return 'suspended';
    if (status === 'INT') return 'interrupted';
    if (status === 'ABD') return 'abandoned';
    
    const now = new Date();
    const start = new Date(match.fixture?.date);
    if (now < start) return 'upcoming';
    if (now > start && now < new Date(start.getTime() + 3 * 60 * 60 * 1000)) return 'live';
    return 'finished';
}

function getMatchResult(match) {
    const goals = match.goals;
    if (!goals) return null;
    
    const home = goals.home || 0;
    const away = goals.away || 0;
    const status = match.fixture?.status?.short;
    
    if (status === 'FT' || status === 'AET' || status === 'PEN') {
        if (home > away) return 'home';
        if (home < away) return 'away';
        return 'draw';
    }
    return null;
}

function calculateOdds(homeName, awayName) {
    const hash = (homeName + awayName).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return {
        home: +(1.80 + (hash % 20) / 100).toFixed(2),
        draw: +(3.20 + (hash % 15) / 100).toFixed(2),
        away: +(2.80 + (hash % 25) / 100).toFixed(2)
    };
}

// ===== FORMAT DATE HELPERS =====
function formatMatchDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}

function formatMatchTime(date) {
    return new Date(date).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getMinutesUntilKickoff(startTime) {
    const now = new Date();
    const kickoff = startTime.toDate ? startTime.toDate() : new Date(startTime);
    return Math.floor((kickoff - now) / 60000);
}

function getMatchMinute(startTime) {
    if (!startTime) return 45;
    try {
        const now = new Date();
        const start = startTime.toDate ? startTime.toDate() : new Date(startTime);
        const diff = Math.floor((now - start) / 60000);
        if (diff < 1) return 1;
        if (diff > 90) return 90;
        return diff;
    } catch (e) {
        return 45;
    }
}

// ===== CLEANUP OLD MATCHES =====
async function cleanupOldMatches() {
    if (!firebase?.firestore) return 0;
    
    const db = firebase.firestore();
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    let deleted = 0;
    
    try {
        const snapshot = await db.collection('sports_matches').get();
        const toDelete = [];
        
        snapshot.forEach(doc => {
            const m = doc.data();
            
            // Delete sample/placeholder matches
            if (m.fixtureId >= 1000000) {
                toDelete.push(doc.ref);
                return;
            }
            
            // Delete matches with placeholder teams
            if (m.homeTeam?.name === 'Home' || m.awayTeam?.name === 'Away') {
                toDelete.push(doc.ref);
                return;
            }
            
            // Delete old upcoming matches
            if (m.status === 'upcoming') {
                const matchTime = m.startTime?.toDate();
                if (matchTime && matchTime < sixHoursAgo) {
                    toDelete.push(doc.ref);
                }
            }
            
            // Delete expired finished matches
            if (m.status === 'finished' && m.expiresAt) {
                const expiresAt = m.expiresAt.toDate ? m.expiresAt.toDate() : new Date(m.expiresAt);
                if (expiresAt < now) {
                    toDelete.push(doc.ref);
                }
            }
        });
        
        if (toDelete.length > 0) {
            const batch = db.batch();
            toDelete.forEach(ref => batch.delete(ref));
            await batch.commit();
            deleted = toDelete.length;
            console.log(`🧹 Deleted ${deleted} old/sample matches`);
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
    
    return deleted;
}

// ===== SYNC MATCH TO FIRESTORE =====
async function syncMatchToFirestore(match) {
    if (!firebase?.firestore) return false;
    
    const db = firebase.firestore();
    const fixture = match.fixture;
    const teams = match.teams;
    const goals = match.goals;
    const league = match.league;
    
    const fixtureId = fixture?.id;
    if (!fixtureId) return false;
    if (fixtureId >= 1000000) return false;
    if (!teams?.home || !teams?.away) return false;
    
    const status = getMatchStatus(match);
    const result = getMatchResult(match);
    const odds = calculateOdds(teams.home.name, teams.away.name);
    
    let expiresAt = null;
    if (status === 'finished') {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
    }
    
    const matchData = {
        fixtureId: fixtureId,
        status: status,
        result: result,
        odds: odds,
        expiresAt: expiresAt,
        leagueId: league?.id || 0,
        leagueName: league?.name || 'Unknown League',
        homeTeam: {
            id: teams.home.id || 0,
            name: teams.home.name,
            logo: teams.home.logo || ''
        },
        awayTeam: {
            id: teams.away.id || 0,
            name: teams.away.name,
            logo: teams.away.logo || ''
        },
        startTime: fixture.date ? new Date(fixture.date) : new Date(),
        score: {
            home: goals?.home || 0,
            away: goals?.away || 0
        },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        isRealData: true,
        apiProvider: 'api-football'
    };
    
    try {
        const docRef = db.collection('sports_matches').doc(fixtureId.toString());
        const oldDoc = await docRef.get();
        const oldStatus = oldDoc.exists ? oldDoc.data().status : null;
        
        await docRef.set(matchData, { merge: true });
        
        // If match just became finished, settle bets
        if (oldStatus && oldStatus !== 'finished' && status === 'finished') {
            console.log(`🏁 Match finished: ${teams.home.name} vs ${teams.away.name} - Settling bets...`);
            await settleBetsForMatch(fixtureId, result);
        }
        
        console.log(`📝 ${teams.home.name} vs ${teams.away.name} (${status})`);
        return true;
    } catch (error) {
        console.error(`Sync error ${fixtureId}:`, error);
        return false;
    }
}

// ===== SETTLE BETS FOR MATCH =====
async function settleBetsForMatch(fixtureId, result) {
    if (!firebase?.firestore) return 0;
    
    const db = firebase.firestore();
    let settled = 0;
    
    try {
        // Settle single bets
        const singleBets = await db.collection('bets')
            .where('fixtureId', '==', fixtureId)
            .where('status', '==', 'active')
            .where('betCategory', '==', 'single')
            .get();
        
        for (const doc of singleBets.docs) {
            const bet = doc.data();
            const won = bet.betType === result;
            
            if (won) {
                const walletRef = db.collection('wallets').doc(bet.userId);
                const walletDoc = await walletRef.get();
                const currentBalance = walletDoc.data()?.balance || 0;
                
                await walletRef.update({
                    balance: currentBalance + bet.potentialWin,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                await walletRef.collection('transactions').add({
                    type: 'sports_win',
                    amount: bet.potentialWin,
                    description: `Won bet on ${bet.matchName}`,
                    fixtureId: fixtureId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                await doc.ref.update({
                    status: 'won',
                    result: result,
                    payout: bet.potentialWin,
                    settledAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await doc.ref.update({
                    status: 'lost',
                    result: result,
                    payout: 0,
                    settledAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            settled++;
        }
        
        // Settle accumulator bets containing this match
        const accBets = await db.collection('bets')
            .where('status', '==', 'active')
            .where('betCategory', '==', 'accumulator')
            .get();
        
        for (const doc of accBets.docs) {
            const bet = doc.data();
            const hasThisMatch = bet.selections?.some(s => s.fixtureId === fixtureId);
            if (!hasThisMatch) continue;
            
            let allFinished = true;
            let allWon = true;
            
            for (const sel of bet.selections) {
                const m = await db.collection('sports_matches').doc(sel.fixtureId.toString()).get();
                if (!m.exists || m.data().status !== 'finished') {
                    allFinished = false;
                    break;
                }
                if (m.data().result !== sel.betType) {
                    allWon = false;
                }
            }
            
            if (allFinished) {
                if (allWon) {
                    const walletRef = db.collection('wallets').doc(bet.userId);
                    const walletDoc = await walletRef.get();
                    const currentBalance = walletDoc.data()?.balance || 0;
                    
                    await walletRef.update({
                        balance: currentBalance + bet.potentialWin,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    await doc.ref.update({
                        status: 'won',
                        payout: bet.potentialWin,
                        settledAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    await doc.ref.update({
                        status: 'lost',
                        payout: 0,
                        settledAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                settled++;
            }
        }
        
        // Mark match as settled
        await db.collection('sports_matches').doc(fixtureId.toString()).update({
            betsSettled: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`💰 Settled ${settled} bets for fixture ${fixtureId}`);
    } catch (error) {
        console.error('Settlement error:', error);
    }
    
    return settled;
}

// ===== MANUAL SETTLEMENT CHECK =====
async function checkAndSettleAllFinishedMatches() {
    if (!firebase?.firestore) return 0;
    
    const db = firebase.firestore();
    let totalSettled = 0;
    
    try {
        const finishedMatches = await db.collection('sports_matches')
            .where('status', '==', 'finished')
            .where('betsSettled', '==', false)
            .get();
        
        for (const doc of finishedMatches.docs) {
            const match = doc.data();
            let result = match.result;
            
            if (!result) {
                const homeScore = match.score?.home || 0;
                const awayScore = match.score?.away || 0;
                if (homeScore > awayScore) result = 'home';
                else if (homeScore < awayScore) result = 'away';
                else result = 'draw';
            }
            
            const settled = await settleBetsForMatch(match.fixtureId, result);
            totalSettled += settled;
        }
    } catch (error) {
        console.error('Manual settlement error:', error);
    }
    
    return totalSettled;
}

// ===== SYNC ALL MATCHES =====
async function syncLiveMatches() {
    const data = await fetchLiveMatches();
    if (!data?.success || !data.data) return 0;
    
    console.log(`🎯 Processing ${data.data.length} live matches`);
    let synced = 0;
    for (const m of data.data) {
        if (await syncMatchToFirestore(m)) synced++;
    }
    return synced;
}

async function syncUpcomingWeekMatches() {
    const data = await fetchUpcomingWeek();
    if (!data?.success || !data.data) return 0;
    
    // Limit to 50 matches for performance
    const matches = data.data.slice(0, 50);
    console.log(`📅 Processing ${matches.length} upcoming matches`);
    
    let synced = 0;
    for (const m of matches) {
        if (await syncMatchToFirestore(m)) synced++;
    }
    return synced;
}

async function syncAllMatches() {
    console.log('🚀 Starting full sync...');
    
    // Clean old matches first
    await cleanupOldMatches();
    
    // Sync live and upcoming
    const live = await syncLiveMatches();
    const upcoming = await syncUpcomingWeekMatches();
    
    // Check for settlements
    const settled = await checkAndSettleAllFinishedMatches();
    
    console.log(`✅ Sync complete: ${live} live, ${upcoming} upcoming, ${settled} bets settled`);
    return { live, upcoming, settled };
}

// ===== GET MATCHES BY DATE RANGE =====
async function getMatchesByDateRange(startDate, endDate) {
    if (!firebase?.firestore) return [];
    
    const db = firebase.firestore();
    const matches = [];
    
    try {
        const snapshot = await db.collection('sports_matches')
            .where('status', '==', 'upcoming')
            .where('startTime', '>=', startDate)
            .where('startTime', '<=', endDate)
            .orderBy('startTime', 'asc')
            .get();
        
        snapshot.forEach(doc => matches.push(doc.data()));
    } catch (error) {
        console.error('Error getting matches by date:', error);
    }
    
    return matches;
}

// ===== GET MATCHES BY LEAGUE =====
async function getMatchesByLeague(leagueId) {
    if (!firebase?.firestore) return [];
    
    const db = firebase.firestore();
    const matches = [];
    
    try {
        const snapshot = await db.collection('sports_matches')
            .where('leagueId', '==', leagueId)
            .where('status', 'in', ['upcoming', 'live'])
            .orderBy('startTime', 'asc')
            .limit(50)
            .get();
        
        snapshot.forEach(doc => matches.push(doc.data()));
    } catch (error) {
        console.error('Error getting matches by league:', error);
    }
    
    return matches;
}

// ===== GET USER ACTIVE BETS =====
async function getUserActiveBets(userId) {
    if (!firebase?.firestore) return [];
    
    const db = firebase.firestore();
    const bets = [];
    
    try {
        const snapshot = await db.collection('bets')
            .where('userId', '==', userId)
            .where('status', '==', 'active')
            .orderBy('placedAt', 'desc')
            .get();
        
        snapshot.forEach(doc => bets.push({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error getting user bets:', error);
    }
    
    return bets;
}

// ===== GET USER BET HISTORY =====
async function getUserBetHistory(userId, limit = 50) {
    if (!firebase?.firestore) return [];
    
    const db = firebase.firestore();
    const bets = [];
    
    try {
        const snapshot = await db.collection('bets')
            .where('userId', '==', userId)
            .orderBy('placedAt', 'desc')
            .limit(limit)
            .get();
        
        snapshot.forEach(doc => bets.push({ id: doc.id, ...doc.data()));
    } catch (error) {
        console.error('Error getting user bet history:', error);
    }
    
    return bets;
}

// ===== GET BETTING STATS =====
async function getUserBettingStats(userId) {
    if (!firebase?.firestore) return { total: 0, won: 0, lost: 0, active: 0, totalStaked: 0, totalReturns: 0 };
    
    const db = firebase.firestore();
    
    try {
        const snapshot = await db.collection('bets')
            .where('userId', '==', userId)
            .get();
        
        const stats = { total: 0, won: 0, lost: 0, active: 0, cancelled: 0, totalStaked: 0, totalReturns: 0 };
        
        snapshot.forEach(doc => {
            const bet = doc.data();
            stats.total++;
            stats.totalStaked += bet.amount || 0;
            
            if (bet.status === 'won') {
                stats.won++;
                stats.totalReturns += bet.payout || bet.potentialWin || 0;
            } else if (bet.status === 'lost') {
                stats.lost++;
            } else if (bet.status === 'active') {
                stats.active++;
            } else if (bet.status === 'cancelled') {
                stats.cancelled++;
            }
        });
        
        return stats;
    } catch (error) {
        console.error('Error getting betting stats:', error);
        return { total: 0, won: 0, lost: 0, active: 0, totalStaked: 0, totalReturns: 0 };
    }
}

// ===== AUTO SYNC =====
let syncInterval = null;

function startAutoSync(seconds = 60) {
    if (syncInterval) clearInterval(syncInterval);
    
    // Run immediately
    syncAllMatches();
    
    // Then run periodically
    syncInterval = setInterval(() => syncAllMatches(), seconds * 1000);
    console.log(`⏰ Auto-sync started (every ${seconds}s)`);
}

function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('⏸️ Auto-sync stopped');
    }
}

// ===== FORCE SYNC =====
async function forceSync() {
    console.log('💪 Force sync triggered...');
    return await syncAllMatches();
}

// ===== CLEAR CACHE =====
function clearLocalCache() {
    localStorage.removeItem('cachedLeagues');
    localStorage.removeItem('cachedMatches');
    console.log('🧹 Local cache cleared');
}

// ===== EXPORT TO WINDOW =====
window.syncNow = forceSync;
window.testAPI = testAPIConnection;
window.cleanupNow = cleanupOldMatches;
window.settleNow = checkAndSettleAllFinishedMatches;
window.settleBetsForMatch = settleBetsForMatch;
window.clearCache = clearLocalCache;

window.getMatchesByDateRange = getMatchesByDateRange;
window.getMatchesByLeague = getMatchesByLeague;
window.getUserActiveBets = getUserActiveBets;
window.getUserBetHistory = getUserBetHistory;
window.getUserBettingStats = getUserBettingStats;

window.formatMatchDate = formatMatchDate;
window.formatMatchTime = formatMatchTime;
window.getMinutesUntilKickoff = getMinutesUntilKickoff;
window.getMatchMinute = getMatchMinute;

// ===== AUTO-START =====
if (document.readyState === 'complete') {
    startAutoSync(60);
} else {
    window.addEventListener('load', () => startAutoSync(60));
}

console.log('🏈 Sports API v17.0 Loaded | Full Functions | Auto-sync: 60s');
console.log('💡 Commands: syncNow(), testAPI(), cleanupNow(), settleNow(), clearCache()');
console.log('📊 Stats: getUserBettingStats(userId)');
console.log('📋 History: getUserBetHistory(userId, limit)');
