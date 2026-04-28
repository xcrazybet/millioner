// ============================================
// js/supabase-client.js - SINGLE SOURCE
// ============================================

// Only declare once - check if already exists
if (!window.SUPABASE_URL) {
    window.SUPABASE_URL = 'https://jnazybaeajyynpyoszmy.supabase.co';
    window.SUPABASE_KEY = 'sb_publishable_WWHC2XIWlnDR9DsDpg52Vw_UIn2KopQ';
}

// Create client only once
if (!window.supaClient) {
    window.supaClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    console.log('✅ Supabase Connected');
}

// ===== HELPER FUNCTIONS =====
window.supaDB = {
    upsertMatch: async (match) => {
        const { error } = await window.supaClient.from('sports_matches').upsert({
            id: String(match.fixtureId),
            fixture_id: match.fixtureId,
            status: match.status,
            result: match.result || null,
            odds: match.odds || { home: 2.00, draw: 3.50, away: 3.80 },
            expires_at: match.expiresAt || null,
            league_id: match.leagueId || 0,
            league_name: match.leagueName || 'Unknown League',
            home_team: match.homeTeam || {},
            away_team: match.awayTeam || {},
            start_time: match.startTime || new Date().toISOString(),
            score: match.score || { home: 0, away: 0 },
            updated_at: new Date().toISOString(),
            bets_settled: match.betsSettled || false
        });
        return !error;
    },
    
    getLiveMatches: async () => {
        const { data } = await window.supaClient.from('sports_matches').select('*').eq('status', 'live').order('start_time', { ascending: false });
        return data || [];
    },
    
    getUpcomingByDate: async (startDate, endDate) => {
        const { data } = await window.supaClient.from('sports_matches').select('*').eq('status', 'upcoming').gte('start_time', startDate.toISOString()).lte('start_time', endDate.toISOString()).order('start_time', { ascending: true });
        return data || [];
    },
    
    getFinishedMatches: async () => {
        const now = new Date().toISOString();
        const { data } = await window.supaClient.from('sports_matches').select('*').eq('status', 'finished').gt('expires_at', now).order('start_time', { ascending: false });
        return data || [];
    },
    
    getAllMatches: async () => {
        const { data } = await window.supaClient.from('sports_matches').select('*');
        return data || [];
    },
    
    insertBet: async (bet) => {
        const { data, error } = await window.supaClient.from('bets').insert({
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
            status: 'active'
        }).select();
        return { success: !error, data: data?.[0] };
    },
    
    updateBet: async (id, updates) => {
        const { error } = await window.supaClient.from('bets').update(updates).eq('id', id);
        return !error;
    },
    
    getActiveBets: async (fixtureId) => {
        const { data } = await window.supaClient.from('bets').select('*').eq('fixture_id', fixtureId).eq('status', 'active');
        return data || [];
    },
    
    getUserBets: async (userId) => {
        const { data } = await window.supaClient.from('bets').select('*').eq('user_id', userId).order('placed_at', { ascending: false }).limit(100);
        return data || [];
    }
};

console.log('📦 SupaDB Helper Ready');
