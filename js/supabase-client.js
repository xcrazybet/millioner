// ============================================
// js/supabase-client.js - Supabase Connection
// ============================================

const SUPABASE_URL = 'https://jnazybaeajyynpyoszmy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WWHC2XIWlnDR9DsDpg52Vw_UIn2KopQ';

// Wait for Supabase SDK to load
function initSupabase() {
    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase SDK not loaded');
        return null;
    }
    return supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

const supaClient = initSupabase();

if (supaClient) {
    console.log('✅ Supabase Connected');
}

// ===== HELPER FUNCTIONS =====
window.supaDB = {
    // MATCHES
    upsertMatch: async function(match) {
        if (!supaClient) return false;
        try {
            const { error } = await supaClient.from('sports_matches').upsert({
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
            if (error) console.error('Upsert error:', error);
            return !error;
        } catch(e) { console.error('Upsert error:', e); return false; }
    },
    
    getLiveMatches: async function() {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient.from('sports_matches').select('*').eq('status', 'live').order('start_time', { ascending: false });
            return data || [];
        } catch(e) { return []; }
    },
    
    // 🔥 FIXED: Get upcoming matches by date range
    getUpcomingByDate: async function(startDate, endDate) {
        if (!supaClient) return [];
        try {
            // Get ALL upcoming matches first (no date filter in query)
            const { data } = await supaClient.from('sports_matches')
                .select('*')
                .eq('status', 'upcoming')
                .order('start_time', { ascending: true });
            
            if (!data || !data.length) {
                console.log('⚠️ No upcoming matches found in database');
                return [];
            }
            
            // Filter by date in JavaScript (avoids timezone issues)
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            
            const filtered = data.filter(m => {
                const matchTime = new Date(m.start_time);
                return matchTime >= start && matchTime <= end;
            });
            
            console.log(`📅 Upcoming: ${data.length} total in DB, ${filtered.length} in date range`);
            return filtered;
        } catch(e) { 
            console.error('getUpcomingByDate error:', e);
            return []; 
        }
    },
    
    getFinishedMatches: async function() {
        if (!supaClient) return [];
        try {
            const now = new Date().toISOString();
            const { data } = await supaClient.from('sports_matches').select('*').eq('status', 'finished').gt('expires_at', now).order('start_time', { ascending: false });
            return data || [];
        } catch(e) { return []; }
    },
    
    getUnsettledMatches: async function() {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient.from('sports_matches').select('*').eq('status', 'finished').eq('bets_settled', false);
            return data || [];
        } catch(e) { return []; }
    },
    
    getAllMatches: async function() {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient.from('sports_matches').select('*');
            return data || [];
        } catch(e) { return []; }
    },
    
    // BETS
    insertBet: async function(bet) {
        if (!supaClient) return { success: false, data: null };
        try {
            const { data, error } = await supaClient.from('bets').insert({
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
        } catch(e) { return { success: false, error: e.message }; }
    },
    
    updateBet: async function(id, updates) {
        if (!supaClient) return false;
        try {
            const { error } = await supaClient.from('bets').update(updates).eq('id', id);
            return !error;
        } catch(e) { return false; }
    },
    
    getActiveBets: async function(fixtureId) {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient.from('bets').select('*').eq('fixture_id', fixtureId).eq('status', 'active');
            return data || [];
        } catch(e) { return []; }
    },
    
    getUserBets: async function(userId) {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient.from('bets').select('*').eq('user_id', userId).order('placed_at', { ascending: false }).limit(100);
            return data || [];
        } catch(e) { return []; }
    }
};

console.log('📦 SupaDB Helper Ready');
