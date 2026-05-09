// ============================================
// supabase-client.js - v14.0 FIXED 7 DAYS
// ✅ Correctly fetches today + next 7 days
// ✅ Full CRUD operations
// ============================================

const SUPABASE_URL = 'https://jnazybaeajyynpyoszmy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WWHC2XIWlnDR9DsDpg52Vw_UIn2KopQ';

let supaClient = null;

if (typeof supabase !== 'undefined') {
    supaClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase Connected');
}

const DEFAULT_ODDS = { home: 2.50, draw: 3.20, away: 2.80 };

const supaDB = {
    
    // ============ MATCHES ============
    
    // Get upcoming matches (today + next 7 days)
    getUpcomingMatches: async function() {
        if (!supaClient) return [];
        try {
            // IMPORTANT: Get today at 00:00:00 UTC
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            
            // Calculate 7 days from today (today + 7 days = 8 days total from midnight)
            const nextWeek = new Date(today);
            nextWeek.setUTCDate(today.getUTCDate() + 7);
            nextWeek.setUTCHours(23, 59, 59, 999);
            
            console.log(`📅 Querying matches from ${today.toISOString()} to ${nextWeek.toISOString()}`);
            
            const { data, error } = await supaClient
                .from('sports_matches')
                .select('*')
                .in('status', ['upcoming', 'live'])
                .gte('start_time', today.toISOString())
                .lte('start_time', nextWeek.toISOString())
                .order('start_time', { ascending: true });
            
            if (error) {
                console.error('getUpcomingMatches error:', error);
                return [];
            }
            
            // Log date distribution for debugging
            const dateDist = {};
            for (const match of data || []) {
                const date = new Date(match.start_time).toDateString();
                dateDist[date] = (dateDist[date] || 0) + 1;
            }
            console.log('📅 getUpcomingMatches date distribution:', dateDist);
            
            return (data || []).map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) {
            console.error('getUpcomingMatches error:', e);
            return [];
        }
    },
    
    // Get live matches
    getLiveMatches: async function() {
        if (!supaClient) return [];
        try {
            const { data, error } = await supaClient
                .from('sports_matches')
                .select('*')
                .eq('status', 'live')
                .order('start_time', { ascending: true });
            
            if (error) return [];
            return (data || []).map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) {
            console.error('getLiveMatches error:', e);
            return [];
        }
    },
    
    // Get finished matches (last 48 hours)
    getFinishedMatches: async function() {
        if (!supaClient) return [];
        try {
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
            
            const { data, error } = await supaClient
                .from('sports_matches')
                .select('*')
                .eq('status', 'finished')
                .gte('start_time', twoDaysAgo.toISOString())
                .order('start_time', { ascending: false });
            
            if (error) return [];
            return data || [];
        } catch(e) {
            console.error('getFinishedMatches error:', e);
            return [];
        }
    },
    
    // Get single match
    getMatch: async function(fixtureId) {
        if (!supaClient) return null;
        try {
            const { data, error } = await supaClient
                .from('sports_matches')
                .select('*')
                .eq('fixture_id', fixtureId)
                .single();
            
            if (error) return null;
            return { ...data, odds: data.odds || DEFAULT_ODDS };
        } catch(e) {
            console.error('getMatch error:', e);
            return null;
        }
    },
    
    // Get all matches (for admin/debug)
    getAllMatches: async function() {
        if (!supaClient) return [];
        try {
            const { data, error } = await supaClient
                .from('sports_matches')
                .select('*')
                .order('start_time', { ascending: true });
            
            if (error) return [];
            return (data || []).map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) {
            console.error('getAllMatches error:', e);
            return [];
        }
    },
    
    // Upsert match (insert or update)
    upsertMatch: async function(match) {
        if (!supaClient) return false;
        try {
            const matchData = {
                fixture_id: match.fixture_id || match.fixtureId,
                status: match.status || 'upcoming',
                result: match.result || null,
                odds: match.odds || DEFAULT_ODDS,
                league_id: match.league_id || match.leagueId || 0,
                league_name: match.league_name || match.leagueName || 'Unknown League',
                home_team: match.home_team || match.homeTeam || { id: 0, name: 'Home', logo: '' },
                away_team: match.away_team || match.awayTeam || { id: 0, name: 'Away', logo: '' },
                start_time: match.start_time || match.startTime || new Date().toISOString(),
                score: match.score || { home: 0, away: 0 },
                updated_at: new Date().toISOString()
            };
            
            if (!matchData.fixture_id) return false;
            
            const { error } = await supaClient
                .from('sports_matches')
                .upsert(matchData, { onConflict: 'fixture_id' });
            
            if (error) console.error('Upsert error:', error);
            return !error;
        } catch(e) {
            console.error('Upsert error:', e);
            return false;
        }
    },
    
    // ============ BETS ============
    
    insertBet: async function(bet) {
        if (!supaClient) return { success: false };
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
                    match_name: bet.matchName,
                    kickoff_time: bet.kickoffTime,
                    bet_category: bet.betCategory || 'single',
                    selections: bet.selections || null,
                    total_odds: bet.totalOdds || null,
                    status: 'active',
                    placed_at: new Date().toISOString()
                })
                .select();
            
            return { success: !error, data: data?.[0], error: error?.message };
        } catch(e) {
            console.error('insertBet error:', e);
            return { success: false, error: e.message };
        }
    },
    
    updateBet: async function(id, updates) {
        if (!supaClient) return false;
        try {
            const { error } = await supaClient
                .from('bets')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id);
            return !error;
        } catch(e) {
            console.error('updateBet error:', e);
            return false;
        }
    },
    
    getUserBets: async function(userId) {
        if (!supaClient) return [];
        try {
            const { data, error } = await supaClient
                .from('bets')
                .select('*')
                .eq('user_id', userId)
                .order('placed_at', { ascending: false });
            
            if (error) return [];
            return data || [];
        } catch(e) {
            console.error('getUserBets error:', e);
            return [];
        }
    },
    
    getActiveBets: async function(fixtureId) {
        if (!supaClient) return [];
        try {
            const { data, error } = await supaClient
                .from('bets')
                .select('*')
                .eq('fixture_id', fixtureId)
                .eq('status', 'active');
            
            if (error) return [];
            return data || [];
        } catch(e) {
            console.error('getActiveBets error:', e);
            return [];
        }
    },
    
    getBetById: async function(betId) {
        if (!supaClient) return null;
        try {
            const { data, error } = await supaClient
                .from('bets')
                .select('*')
                .eq('id', betId)
                .single();
            
            if (error) return null;
            return data;
        } catch(e) {
            console.error('getBetById error:', e);
            return null;
        }
    },
    
    getUserBetCounts: async function(userId) {
        if (!supaClient) return { total: 0, active: 0, won: 0, lost: 0 };
        try {
            const { data, error } = await supaClient
                .from('bets')
                .select('status')
                .eq('user_id', userId);
            
            if (error || !data) return { total: 0, active: 0, won: 0, lost: 0 };
            
            return {
                total: data.length,
                active: data.filter(b => b.status === 'active').length,
                won: data.filter(b => b.status === 'won').length,
                lost: data.filter(b => b.status === 'lost').length
            };
        } catch(e) {
            console.error('getUserBetCounts error:', e);
            return { total: 0, active: 0, won: 0, lost: 0 };
        }
    },
    
    // ============ UTILITIES ============
    
    // Force refresh data from API
    refreshData: async function() {
        if (typeof manualSync !== 'undefined') {
            await manualSync();
            return true;
        }
        return false;
    },
    
    // Clean old finished matches (older than 48 hours)
    cleanOldMatches: async function() {
        if (!supaClient) return;
        try {
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
            
            const { error } = await supaClient
                .from('sports_matches')
                .delete()
                .eq('status', 'finished')
                .lt('start_time', twoDaysAgo.toISOString());
            
            if (!error) console.log('🗑️ Cleaned old finished matches');
        } catch(e) {
            console.error('Clean error:', e);
        }
    }
};

if (typeof window !== 'undefined') {
    window.supabaseClient = supaClient;
    window.supaDB = supaDB;
    window.refreshSportsData = () => supaDB.refreshData();
}

console.log('📦 Supabase Client v14.0 - Ready');
console.log('   getUpcomingMatches() - Returns today + next 7 days');
