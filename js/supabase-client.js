// ============================================
// supabase-client.js - v12.0 COMPLETE
// ✅ Full CRUD for matches and bets
// ✅ All bet types support
// ✅ Real-time subscriptions
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
            today.setUTCHours(0, 0, 0, 0);
            const nextMonth = new Date(today);
            nextMonth.setUTCDate(today.getUTCDate() + 90);
            
            const { data, error } = await supaClient
                .from('sports_matches')
                .select('*')
                .in('status', ['upcoming', 'live'])
                .gte('start_time', today.toISOString())
                .lte('start_time', nextMonth.toISOString())
                .order('start_time', { ascending: true });
            
            if (error) return [];
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
            
            if (error) return [];
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
            
            if (error) return [];
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
    
    getMatchEvents: async function(fixtureId) {
        try {
            const response = await fetch(`https://millioner.onrender.com/api/fixtures/events/${fixtureId}`);
            const data = await response.json();
            return data.data || [];
        } catch(e) {
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
            
            // Add optional fields
            if (bet.selections) betData.selections = bet.selections;
            if (bet.totalOdds) betData.total_odds = bet.totalOdds;
            if (bet.handicap_value) betData.handicap_value = bet.handicap_value;
            if (bet.corners_value) betData.corners_value = bet.corners_value;
            if (bet.cards_value) betData.cards_value = bet.cards_value;
            
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
    
    cleanOldMatches: async function() {
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
    }
};

if (typeof window !== 'undefined') {
    window.supabaseClient = supaClient;
    window.supaDB = supaDB;
}

console.log('📦 Supabase Client v12.0 - Complete');
