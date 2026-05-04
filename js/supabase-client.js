// ============================================
// supabase-client.js - v8.1 (No league_logo)
// ✅ Fixed: Removed league_logo column
// ============================================

const SUPABASE_URL = 'https://jnazybaeajyynpyoszmy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WWHC2XIWlnDR9DsDpg52Vw_UIn2KopQ';

let supaClient = null;

if (typeof supabase !== 'undefined') {
    supaClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase Connected');
}

const DEFAULT_ODDS = { home: 2.50, draw: 3.20, away: 2.80 };

function normalizeMatch(match) {
    return {
        fixture_id: match.fixture_id || match.fixtureId,
        status: match.status || 'upcoming',
        result: match.result || null,
        odds: match.odds || DEFAULT_ODDS,
        league_id: match.league_id || match.leagueId || 0,
        league_name: match.league_name || match.leagueName || 'Unknown League',
        // league_logo: removed - column doesn't exist
        home_team: match.home_team || match.homeTeam || { id: 0, name: 'Home', logo: '' },
        away_team: match.away_team || match.awayTeam || { id: 0, name: 'Away', logo: '' },
        start_time: match.start_time || match.startTime || new Date().toISOString(),
        score: match.score || { home: 0, away: 0 },
        updated_at: new Date().toISOString(),
        bets_settled: match.bets_settled || match.betsSettled || false
    };
}

const supaDB = {
    upsertMatch: async function(match) {
        if (!supaClient) return false;
        try {
            const data = normalizeMatch(match);
            if (!data.fixture_id) return false;
            
            const { error } = await supaClient
                .from('sports_matches')
                .upsert(data, { onConflict: 'fixture_id' });
            
            if (error) console.error('Upsert error:', error);
            return !error;
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
                .order('start_time', { ascending: true });
            return (data || []).map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) {
            console.error('getLiveMatches error:', e);
            return [];
        }
    },
    
    getUpcomingMatches: async function() {
        if (!supaClient) return [];
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const nextWeek = new Date(today);
            nextWeek.setDate(today.getDate() + 7);
            
            const { data } = await supaClient
                .from('sports_matches')
                .select('*')
                .in('status', ['upcoming', 'live'])
                .gte('start_time', today.toISOString())
                .lte('start_time', nextWeek.toISOString())
                .order('start_time', { ascending: true });
            
            return (data || []).map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) {
            console.error('getUpcomingMatches error:', e);
            return [];
        }
    },
    
    getFinishedMatches: async function() {
        if (!supaClient) return [];
        try {
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
            
            const { data } = await supaClient
                .from('sports_matches')
                .select('*')
                .eq('status', 'finished')
                .gte('start_time', twoDaysAgo.toISOString())
                .order('start_time', { ascending: false });
            return data || [];
        } catch(e) {
            return [];
        }
    },
    
    getMatch: async function(fixtureId) {
        if (!supaClient) return null;
        try {
            const { data } = await supaClient
                .from('sports_matches')
                .select('*')
                .eq('fixture_id', fixtureId)
                .single();
            return data ? { ...data, odds: data.odds || DEFAULT_ODDS } : null;
        } catch(e) {
            return null;
        }
    },
    
    insertBet: async function(bet) {
        if (!supaClient) return { success: false };
        try {
            const { data, error } = await supaClient
                .from('bets')
                .insert({
                    user_id: bet.userId,
                    fixture_id: bet.fixtureId,
                    bet_type: bet.betType,
                    bet_name: bet.betName,
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
            return false;
        }
    },
    
    getUserBets: async function(userId) {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient
                .from('bets')
                .select('*')
                .eq('user_id', userId)
                .order('placed_at', { ascending: false });
            return data || [];
        } catch(e) {
            return [];
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
    }
};

if (typeof window !== 'undefined') {
    window.supabaseClient = supaClient;
    window.supaDB = supaDB;
}

console.log('📦 Supabase Client v8.1 - Ready (league_logo removed)');
