// ============================================
// js/supabase-client.js - v3.0 COMPLETE
// Fixed: Today's matches now appear
// ============================================

const SUPABASE_URL = 'https://jnazybaeajyynpyoszmy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WWHC2XIWlnDR9DsDpg52Vw_UIn2KopQ';

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

window.supaDB = {
    
    // ============ MATCHES ============
    
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
            const { data } = await supaClient.from('sports_matches')
                .select('*')
                .eq('status', 'live')
                .order('start_time', { ascending: false });
            return data || [];
        } catch(e) { return []; }
    },
    
    // 🔥 FIXED: Include today's live matches
    getUpcomingByDate: async function(startDate, endDate) {
        if (!supaClient) return [];
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            const { data } = await supaClient.from('sports_matches')
                .select('*')
                .in('status', ['upcoming', 'live'])
                .gte('start_time', start.toISOString())
                .lte('start_time', end.toISOString())
                .order('start_time', { ascending: true });
            
            const filtered = (data || []).filter(m => m.status !== 'finished');
            
            console.log(`📅 Matches in range: ${filtered.length} (upcoming + today's live)`);
            return filtered;
        } catch(e) { 
            console.error('getUpcomingByDate error:', e);
            return []; 
        }
    },
    
    getTodayMatches: async function() {
        if (!supaClient) return [];
        try {
            const todayStart = new Date(); todayStart.setHours(0,0,0,0);
            const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
            
            const { data } = await supaClient.from('sports_matches')
                .select('*')
                .in('status', ['upcoming', 'live'])
                .gte('start_time', todayStart.toISOString())
                .lte('start_time', todayEnd.toISOString())
                .order('start_time', { ascending: true });
            
            return data || [];
        } catch(e) { return []; }
    },
    
    getFinishedMatches: async function() {
        if (!supaClient) return [];
        try {
            const now = new Date().toISOString();
            const { data } = await supaClient.from('sports_matches')
                .select('*')
                .eq('status', 'finished')
                .gt('expires_at', now)
                .order('start_time', { ascending: false });
            return data || [];
        } catch(e) { return []; }
    },
    
    getUnsettledMatches: async function() {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient.from('sports_matches')
                .select('*')
                .eq('status', 'finished')
                .eq('bets_settled', false);
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
    
    getMatchByFixtureId: async function(fixtureId) {
        if (!supaClient) return null;
        try {
            const { data } = await supaClient.from('sports_matches')
                .select('*')
                .eq('fixture_id', fixtureId)
                .single();
            return data || null;
        } catch(e) { return null; }
    },
    
    getMatchCounts: async function() {
        if (!supaClient) return { live: 0, upcoming: 0, finished: 0, total: 0 };
        try {
            const { data } = await supaClient.from('sports_matches').select('status');
            if (!data) return { live: 0, upcoming: 0, finished: 0, total: 0 };
            return {
                live: data.filter(m => m.status === 'live').length,
                upcoming: data.filter(m => m.status === 'upcoming').length,
                finished: data.filter(m => m.status === 'finished').length,
                total: data.length
            };
        } catch(e) { return { live: 0, upcoming: 0, finished: 0, total: 0 }; }
    },
    
    // ============ BETS ============
    
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
            const { data } = await supaClient.from('bets')
                .select('*')
                .eq('fixture_id', fixtureId)
                .eq('status', 'active');
            return data || [];
        } catch(e) { return []; }
    },
    
    getUserBets: async function(userId) {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient.from('bets')
                .select('*')
                .eq('user_id', userId)
                .order('placed_at', { ascending: false })
                .limit(100);
            return data || [];
        } catch(e) { return []; }
    },
    
    getActiveAccumulatorBets: async function() {
        if (!supaClient) return [];
        try {
            const { data } = await supaClient.from('bets')
                .select('*')
                .eq('status', 'active')
                .eq('bet_category', 'accumulator');
            return data || [];
        } catch(e) { return []; }
    },
    
    getBetById: async function(betId) {
        if (!supaClient) return null;
        try {
            const { data } = await supaClient.from('bets').select('*').eq('id', betId).single();
            return data || null;
        } catch(e) { return null; }
    },
    
    getUserBetCounts: async function(userId) {
        if (!supaClient) return { total: 0, active: 0, won: 0, lost: 0 };
        try {
            const { data } = await supaClient.from('bets').select('status').eq('user_id', userId);
            if (!data) return { total: 0, active: 0, won: 0, lost: 0 };
            return {
                total: data.length,
                active: data.filter(b => b.status === 'active').length,
                won: data.filter(b => b.status === 'won').length,
                lost: data.filter(b => b.status === 'lost').length
            };
        } catch(e) { return { total: 0, active: 0, won: 0, lost: 0 }; }
    }
};

console.log('📦 SupaDB v3.0 - Today Matches Fixed');
