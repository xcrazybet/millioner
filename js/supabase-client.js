// ============================================
// js/supabase-client.js
// ============================================

const SUPABASE_URL = 'https://jnazybaeajyynpyoszmy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WWHC2XIWlnDR9DsDpg52Vw_UIn2KopQ';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('✅ Supabase Connected');

// ===== HELPER =====
window.supaDB = {
    upsertMatch: async (match) => {
        const { error } = await supabase.from('sports_matches').upsert({
            id: String(match.fixtureId),
            fixture_id: match.fixtureId,
            status: match.status,
            result: match.result || null,
            odds: match.odds || {},
            expires_at: match.expiresAt || null,
            league_id: match.leagueId || 0,
            league_name: match.leagueName || '',
            home_team: match.homeTeam || {},
            away_team: match.awayTeam || {},
            start_time: match.startTime,
            score: match.score || {},
            updated_at: new Date().toISOString()
        });
        return !error;
    },
    
    insertBet: async (bet) => {
        const { data, error } = await supabase.from('bets').insert({
            user_id: bet.userId,
            fixture_id: bet.fixtureId,
            bet_type: bet.betType,
            amount: bet.amount,
            odds: bet.odds,
            potential_win: bet.potentialWin,
            match_name: bet.matchName,
            kickoff_time: bet.kickoffTime,
            bet_category: bet.betCategory || 'single',
            selections: bet.selections,
            total_odds: bet.totalOdds,
            status: 'active'
        }).select();
        return { success: !error, data: data?.[0] };
    },
    
    updateBet: async (id, updates) => {
        const { error } = await supabase.from('bets').update(updates).eq('id', id);
        return !error;
    },
    
    getLiveMatches: async () => {
        const { data } = await supabase.from('sports_matches').select('*').eq('status', 'live');
        return data || [];
    },
    
    getUpcomingByDate: async (startDate, endDate) => {
        const { data } = await supabase.from('sports_matches').select('*')
            .eq('status', 'upcoming')
            .gte('start_time', startDate.toISOString())
            .lte('start_time', endDate.toISOString())
            .order('start_time');
        return data || [];
    },
    
    getUnsettledMatches: async () => {
        const { data } = await supabase.from('sports_matches').select('*')
            .eq('status', 'finished')
            .eq('bets_settled', false);
        return data || [];
    },
    
    getActiveBets: async (fixtureId) => {
        const { data } = await supabase.from('bets').select('*')
            .eq('fixture_id', fixtureId)
            .eq('status', 'active');
        return data || [];
    },
    
    getUserBets: async (userId) => {
        const { data } = await supabase.from('bets').select('*')
            .eq('user_id', userId)
            .order('placed_at', { ascending: false })
            .limit(100);
        return data || [];
    },
    
    getAllMatches: async () => {
        const { data } = await supabase.from('sports_matches').select('*');
        return data || [];
    }
};
