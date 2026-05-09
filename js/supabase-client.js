// ============================================
// supabase-client.js - v13.0 COMPLETE
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
    // Get upcoming matches (today + 7 days)
    getUpcomingMatches: async function() {
        if (!supaClient) return [];
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const nextWeek = new Date(today);
            nextWeek.setDate(today.getDate() + 7);
            
            const { data, error } = await supaClient
                .from('sports_matches')
                .select('*')
                .in('status', ['upcoming', 'live'])
                .gte('start_time', today.toISOString())
                .lte('start_time', nextWeek.toISOString())
                .order('start_time', { ascending: true });
            
            return (data || []).map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) {
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
            return (data || []).map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) {
            return [];
        }
    },
    
    // Get finished matches
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
            return data || [];
        } catch(e) {
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
            return data ? { ...data, odds: data.odds || DEFAULT_ODDS } : null;
        } catch(e) {
            return null;
        }
    },
    
    // Insert bet
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
            return { success: !error, data: data?.[0] };
        } catch(e) {
            return { success: false, error: e.message };
        }
    },
    
    // Update bet
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
    
    // Get user bets
    getUserBets: async function(userId) {
        if (!supaClient) return [];
        try {
            const { data, error } = await supaClient
                .from('bets')
                .select('*')
                .eq('user_id', userId)
                .order('placed_at', { ascending: false });
            return data || [];
        } catch(e) {
            return [];
        }
    },
    
    // Get active bets for a fixture
    getActiveBets: async function(fixtureId) {
        if (!supaClient) return [];
        try {
            const { data, error } = await supaClient
                .from('bets')
                .select('*')
                .eq('fixture_id', fixtureId)
                .eq('status', 'active');
            return data || [];
        } catch(e) {
            return [];
        }
    },
    
    // Upsert match
    upsertMatch: async function(match) {
        if (!supaClient) return false;
        try {
            const { error } = await supaClient
                .from('sports_matches')
                .upsert({
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
                }, { onConflict: 'fixture_id' });
            return !error;
        } catch(e) {
            return false;
        }
    }
};

if (typeof window !== 'undefined') {
    window.supabaseClient = supaClient;
    window.supaDB = supaDB;
}

console.log('📦 Supabase Client v13.0 - Ready');
