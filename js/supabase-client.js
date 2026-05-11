// ============================================
// supabase-client.js - v16.0 WORKING
// ✅ Correct table schema
// ✅ All CRUD operations
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
    
    getUpcomingMatches: async function() {
        if (!supaClient) return [];
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const ninetyDaysLater = new Date(today);
            ninetyDaysLater.setDate(today.getDate() + 90);
            
            const { data, error } = await supaClient
                .from('sports_matches')
                .select('*')
                .in('status', ['upcoming', 'live'])
                .gte('start_time', today.toISOString())
                .lte('start_time', ninetyDaysLater.toISOString())
                .order('start_time', { ascending: true });
            
            if (error) throw error;
            return (data || []).map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) {
            console.error('getUpcomingMatches error:', e);
            return [];
        }
    },
    
    getLiveMatches: async function() {
        if (!supaClient) return [];
        try {
            const { data, error } = await supaClient
                .from('sports_matches')
                .select('*')
                .eq('status', 'live')
                .order('start_time', { ascending: true });
            
            if (error) throw error;
            return (data || []).map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) {
            console.error('getLiveMatches error:', e);
            return [];
        }
    },
    
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
            
            if (error) throw error;
            return data || [];
        } catch(e) {
            console.error('getFinishedMatches error:', e);
            return [];
        }
    },
    
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
    
    getAllMatches: async function() {
        if (!supaClient) return [];
        try {
            const { data, error } = await supaClient
                .from('sports_matches')
                .select('*')
                .order('start_time', { ascending: true });
            
            if (error) throw error;
            return (data || []).map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) {
            console.error('getAllMatches error:', e);
            return [];
        }
    },
    
    upsertMatch: async function(match) {
        if (!supaClient) return false;
        try {
            const matchData = {
                fixture_id: match.fixture_id,
                status: match.status,
                result: match.result,
                odds: match.odds,
                league_id: match.league_id,
                league_name: match.league_name,
                home_team: match.home_team,
                away_team: match.away_team,
                start_time: match.start_time,
                score: match.score,
                updated_at: new Date().toISOString()
            };
            
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
    
    deleteOldMatches: async function() {
        if (!supaClient) return;
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            const { error } = await supaClient
                .from('sports_matches')
                .delete()
                .eq('status', 'finished')
                .lt('start_time', sevenDaysAgo.toISOString());
            
            if (!error) console.log('🗑️ Cleaned old finished matches');
        } catch(e) {
            console.error('Clean error:', e);
        }
    },
    
    // ============ BETS ============
    
    insertBet: async function(bet) {
        if (!supaClient) return { success: false };
        try {
            const betData = {
                user_id: bet.userId,
                fixture_id: bet.fixtureId,
                bet_type: bet.betType,
                amount: bet.amount,
                odds: bet.odds,
                potential_win: bet.potentialWin,
                match_name: bet.matchName,
                kickoff_time: bet.kickoffTime,
                bet_category: bet.betCategory || 'single',
                status: 'active',
                placed_at: new Date().toISOString()
            };
            
            if (bet.selections) betData.selections = bet.selections;
            if (bet.totalOdds) betData.total_odds = bet.totalOdds;
            
            const { data, error } = await supaClient
                .from('bets')
                .insert(betData)
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
    }
};

if (typeof window !== 'undefined') {
    window.supabaseClient = supaClient;
    window.supaDB = supaDB;
}

console.log('📦 Supabase Client v16.0 - Ready');
