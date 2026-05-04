// ============================================
// supabase-client.js - v6.0 COMPLETE
// ✅ Full CRUD operations
// ✅ Auto-default odds for all matches
// ✅ Works with Node.js and Browser
// ============================================

const SUPABASE_URL = 'https://jnazybaeajyynpyoszmy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WWHC2XIWlnDR9DsDpg52Vw_UIn2KopQ';

// Initialize Supabase client (works in both browser and Node.js)
let supaClient = null;

if (typeof window !== 'undefined' && window.supabase) {
    // Browser environment
    supaClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase Connected (Browser)');
} else if (typeof supabase !== 'undefined') {
    // Node.js environment (for server-side)
    supaClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase Connected (Node.js)');
} else {
    console.error('❌ Supabase SDK not loaded');
}

// Default odds for matches without odds
const DEFAULT_ODDS = { home: 2.50, draw: 3.20, away: 2.80 };

// Helper: Ensure match has valid data structure
function normalizeMatch(match) {
    return {
        fixture_id: match.fixture_id || match.fixtureId,
        status: match.status || 'upcoming',
        result: match.result || null,
        odds: match.odds || DEFAULT_ODDS,
        expires_at: match.expiresAt || match.expires_at || null,
        league_id: match.league_id || match.leagueId || 0,
        league_name: match.league_name || match.leagueName || 'Unknown League',
        league_logo: match.league_logo || match.leagueLogo || '',
        home_team: match.home_team || match.homeTeam || { id: 0, name: 'Home', logo: '' },
        away_team: match.away_team || match.awayTeam || { id: 0, name: 'Away', logo: '' },
        start_time: match.start_time || match.startTime || new Date().toISOString(),
        score: match.score || { home: 0, away: 0 },
        updated_at: new Date().toISOString(),
        bets_settled: match.bets_settled || match.betsSettled || false
    };
}

// Supabase DB Interface
const supaDB = {
    
    // ============ MATCHES ============
    
    upsertMatch: async function(match) {
        if (!supaClient) return false;
        try {
            const normalizedMatch = normalizeMatch(match);
            
            if (!normalizedMatch.fixture_id) {
                console.error('❌ Cannot upsert: missing fixture_id');
                return false;
            }
            
            const { error } = await supaClient
                .from('sports_matches')
                .upsert(normalizedMatch, { onConflict: 'fixture_id' });
            
            if (error) {
                console.error('Upsert error:', error);
                return false;
            }
            return true;
        } catch(e) { 
            console.error('Upsert error:', e); 
            return false; 
        }
    },
    
    getLiveMatches: async function() {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient
                .from('sports_matches')
                .select('*')
                .eq('status', 'live')
                .order('start_time', { ascending: false });
            
            if (!data) return [];
            return data.map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) { 
            console.error('getLiveMatches error:', e);
            return []; 
        }
    },
    
    getUpcomingMatches: async function() {
        if (!supaClient) return [];
        try {
            const now = new Date().toISOString();
            const { data } = await supaClient
                .from('sports_matches')
                .select('*')
                .in('status', ['upcoming'])
                .gte('start_time', now)
                .order('start_time', { ascending: true });
            
            if (!data) return [];
            return data.map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) { 
            console.error('getUpcomingMatches error:', e);
            return []; 
        }
    },
    
    getUpcomingByDate: async function(startDate, endDate) {
        if (!supaClient) return [];
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            const { data } = await supaClient
                .from('sports_matches')
                .select('*')
                .in('status', ['upcoming', 'live'])
                .gte('start_time', start.toISOString())
                .lte('start_time', end.toISOString())
                .order('start_time', { ascending: true });
            
            if (!data) return [];
            return data.map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) { 
            console.error('getUpcomingByDate error:', e);
            return []; 
        }
    },
    
    getTodayMatches: async function() {
        if (!supaClient) return [];
        try {
            const todayStart = new Date(); 
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(); 
            todayEnd.setHours(23, 59, 59, 999);
            
            const { data } = await supaClient
                .from('sports_matches')
                .select('*')
                .in('status', ['upcoming', 'live'])
                .gte('start_time', todayStart.toISOString())
                .lte('start_time', todayEnd.toISOString())
                .order('start_time', { ascending: true });
            
            if (!data) return [];
            return data.map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) { 
            console.error('getTodayMatches error:', e);
            return []; 
        }
    },
    
    getFinishedMatches: async function() {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient
                .from('sports_matches')
                .select('*')
                .eq('status', 'finished')
                .order('start_time', { ascending: false });
            return data || [];
        } catch(e) { 
            console.error('getFinishedMatches error:', e);
            return []; 
        }
    },
    
    getMatchByFixtureId: async function(fixtureId) {
        if (!supaClient) return null;
        try {
            const { data } = await supaClient
                .from('sports_matches')
                .select('*')
                .eq('fixture_id', fixtureId)
                .single();
            
            if (!data) return null;
            return { ...data, odds: data.odds || DEFAULT_ODDS };
        } catch(e) { 
            console.error('getMatchByFixtureId error:', e);
            return null; 
        }
    },
    
    getAllMatches: async function() {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient
                .from('sports_matches')
                .select('*')
                .order('start_time', { ascending: true });
            
            if (!data) return [];
            return data.map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) { 
            console.error('getAllMatches error:', e);
            return []; 
        }
    },
    
    getMatchCounts: async function() {
        if (!supaClient) return { live: 0, upcoming: 0, finished: 0, total: 0 };
        try {
            const { data } = await supaClient
                .from('sports_matches')
                .select('status');
            if (!data) return { live: 0, upcoming: 0, finished: 0, total: 0 };
            return {
                live: data.filter(m => m.status === 'live').length,
                upcoming: data.filter(m => m.status === 'upcoming').length,
                finished: data.filter(m => m.status === 'finished').length,
                total: data.length
            };
        } catch(e) { 
            return { live: 0, upcoming: 0, finished: 0, total: 0 }; 
        }
    },
    
    // ============ BETS ============
    
    insertBet: async function(bet) {
        if (!supaClient) return { success: false, data: null };
        try {
            const { data, error } = await supaClient
                .from('bets')
                .insert({
                    user_id: bet.userId,
                    fixture_id: bet.fixtureId,
                    bet_type: bet.betType,
                    amount: bet.amount,
                    odds: bet.odds,
                    potential_win: bet.potentialWin,
                    match_name: bet.matchName || '',
                    kickoff_time: bet.kickoffTime || null,
                    bet_category: bet.betCategory || 'single',
                    selections: bet.selections || null,
                    total_odds: bet.totalOdds || null,
                    status: 'active',
                    placed_at: new Date().toISOString()
                })
                .select();
            return { success: !error, data: data?.[0], error: error?.message };
        } catch(e) { 
            return { success: false, error: e.message }; 
        }
    },
    
    updateBet: async function(id, updates) {
        if (!supaClient) return false;
        try {
            const { error } = await supaClient
                .from('bets')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);
            return !error;
        } catch(e) { 
            return false; 
        }
    },
    
    getActiveBets: async function(fixtureId) {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient
                .from('bets')
                .select('*')
                .eq('fixture_id', fixtureId)
                .eq('status', 'active');
            return data || [];
        } catch(e) { 
            return []; 
        }
    },
    
    getUserBets: async function(userId) {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient
                .from('bets')
                .select('*')
                .eq('user_id', userId)
                .order('placed_at', { ascending: false })
                .limit(100);
            return data || [];
        } catch(e) { 
            return []; 
        }
    },
    
    getActiveAccumulatorBets: async function() {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient
                .from('bets')
                .select('*')
                .eq('status', 'active')
                .eq('bet_category', 'accumulator');
            return data || [];
        } catch(e) { 
            return []; 
        }
    },
    
    getBetById: async function(betId) {
        if (!supaClient) return null;
        try {
            const { data } = await supaClient
                .from('bets')
                .select('*')
                .eq('id', betId)
                .single();
            return data || null;
        } catch(e) { 
            return null; 
        }
    },
    
    getUserBetCounts: async function(userId) {
        if (!supaClient) return { total: 0, active: 0, won: 0, lost: 0 };
        try {
            const { data } = await supaClient
                .from('bets')
                .select('status')
                .eq('user_id', userId);
            if (!data) return { total: 0, active: 0, won: 0, lost: 0 };
            return {
                total: data.length,
                active: data.filter(b => b.status === 'active').length,
                won: data.filter(b => b.status === 'won').length,
                lost: data.filter(b => b.status === 'lost').length
            };
        } catch(e) { 
            return { total: 0, active: 0, won: 0, lost: 0 }; 
        }
    }
};

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { supaClient, supaDB, DEFAULT_ODDS };
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.supabaseClient = supaClient;
    window.supaDB = supaDB;
}

console.log('📦 Supabase DB Client v6.0 - Ready');
console.log('   Methods: upsertMatch, getLiveMatches, getUpcomingMatches, insertBet, etc.');
