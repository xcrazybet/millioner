// ============================================
// supabase-client.js - v3.0 ENHANCED
// Complete Supabase integration for sports betting
// ============================================

// Supabase Configuration
const SUPABASE_URL = 'https://jnazybaeajyynpyoszmy.supabase.co';
const SUPABASE_ANON_KEY = 'your-supabase-anon-key-here'; // Replace with your actual key

// Initialize Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== SUPABASE DATABASE SERVICE =====
const supaDB = {
    // ===== MATCHES =====
    
    // Get all matches with optional filters
    async getMatches(filters = {}) {
        let query = supabaseClient.from('sports_matches').select('*');
        
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.league_id) query = query.eq('league_id', filters.league_id);
        if (filters.date_from) query = query.gte('start_time', filters.date_from);
        if (filters.date_to) query = query.lte('start_time', filters.date_to);
        
        const { data, error } = await query.order('start_time', { ascending: true });
        if (error) throw error;
        return data;
    },
    
    // Get single match by fixture ID
    async getMatch(fixtureId) {
        const { data, error } = await supabaseClient
            .from('sports_matches')
            .select('*')
            .eq('fixture_id', fixtureId)
            .single();
        
        if (error) throw error;
        return data;
    },
    
    // Get live matches
    async getLiveMatches() {
        const { data, error } = await supabaseClient
            .from('sports_matches')
            .select('*')
            .eq('status', 'live')
            .order('start_time', { ascending: true });
        
        if (error) throw error;
        return data;
    },
    
    // Get upcoming matches
    async getUpcomingMatches(limit = 50) {
        const now = new Date().toISOString();
        const { data, error } = await supabaseClient
            .from('sports_matches')
            .select('*')
            .eq('status', 'upcoming')
            .gte('start_time', now)
            .order('start_time', { ascending: true })
            .limit(limit);
        
        if (error) throw error;
        return data;
    },
    
    // Get finished matches
    async getFinishedMatches(limit = 20) {
        const { data, error } = await supabaseClient
            .from('sports_matches')
            .select('*')
            .eq('status', 'finished')
            .order('updated_at', { ascending: false })
            .limit(limit);
        
        if (error) throw error;
        return data;
    },
    
    // Update match scores
    async updateMatchScore(fixtureId, score, elapsed) {
        const { data, error } = await supabaseClient
            .from('sports_matches')
            .update({
                score: score,
                elapsed: elapsed,
                updated_at: new Date().toISOString()
            })
            .eq('fixture_id', fixtureId)
            .select();
        
        if (error) throw error;
        return data;
    },
    
    // ===== BETS =====
    
    // Get user's active bets
    async getActiveBets(userId, fixtureId = null) {
        let query = supabaseClient
            .from('bets')
            .select('*, sports_matches(home_team, away_team, score, elapsed, status)')
            .eq('user_id', userId)
            .eq('status', 'active');
        
        if (fixtureId) query = query.eq('fixture_id', fixtureId);
        
        const { data, error } = await query.order('placed_at', { ascending: false });
        if (error) throw error;
        return data;
    },
    
    // Get user's bet history
    async getBetHistory(userId, limit = 50) {
        const { data, error } = await supabaseClient
            .from('bets')
            .select('*')
            .eq('user_id', userId)
            .in('status', ['won', 'lost'])
            .order('settled_at', { ascending: false })
            .limit(limit);
        
        if (error) throw error;
        return data;
    },
    
    // Place a new bet
    async placeBet(betData) {
        const { data, error } = await supabaseClient
            .from('bets')
            .insert(betData)
            .select();
        
        if (error) throw error;
        return data[0];
    },
    
    // Update bet status
    async updateBet(betId, updateData) {
        const { data, error } = await supabaseClient
            .from('bets')
            .update({
                ...updateData,
                updated_at: new Date().toISOString()
            })
            .eq('id', betId)
            .select();
        
        if (error) throw error;
        return data[0];
    },
    
    // Get all bets for a fixture (for settlement)
    async getFixtureBets(fixtureId) {
        const { data, error } = await supabaseClient
            .from('bets')
            .select('*')
            .eq('fixture_id', fixtureId)
            .eq('status', 'active');
        
        if (error) throw error;
        return data;
    },
    
    // ===== STATISTICS =====
    
    // Get user statistics
    async getUserStats(userId) {
        const [bets, won, lost] = await Promise.all([
            supabaseClient.from('bets').select('*', { count: 'exact' }).eq('user_id', userId),
            supabaseClient.from('bets').select('*', { count: 'exact' }).eq('user_id', userId).eq('status', 'won'),
            supabaseClient.from('bets').select('*', { count: 'exact' }).eq('user_id', userId).eq('status', 'lost')
        ]);
        
        return {
            total_bets: bets.count || 0,
            won_bets: won.count || 0,
            lost_bets: lost.count || 0,
            win_rate: bets.count ? ((won.count || 0) / bets.count * 100).toFixed(1) : 0
        };
    },
    
    // ===== LIVE UPDATES =====
    
    // Subscribe to match updates
    subscribeToMatch(fixtureId, callback) {
        const subscription = supabaseClient
            .channel(`match-${fixtureId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'sports_matches',
                filter: `fixture_id=eq.${fixtureId}`
            }, payload => {
                callback(payload.new);
            })
            .subscribe();
        
        return subscription;
    },
    
    // Subscribe to bet updates for a user
    subscribeToUserBets(userId, callback) {
        const subscription = supabaseClient
            .channel(`user-bets-${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'bets',
                filter: `user_id=eq.${userId}`
            }, payload => {
                callback(payload);
            })
            .subscribe();
        
        return subscription;
    }
};

// ===== REAL-TIME SYNC MANAGER =====
const RealtimeManager = {
    subscriptions: new Map(),
    
    subscribeMatch(fixtureId, onUpdate) {
        if (this.subscriptions.has(`match-${fixtureId}`)) {
            this.unsubscribe(`match-${fixtureId}`);
        }
        
        const subscription = supaDB.subscribeToMatch(fixtureId, onUpdate);
        this.subscriptions.set(`match-${fixtureId}`, subscription);
        return subscription;
    },
    
    subscribeUserBets(userId, onUpdate) {
        if (this.subscriptions.has(`bets-${userId}`)) {
            this.unsubscribe(`bets-${userId}`);
        }
        
        const subscription = supaDB.subscribeToUserBets(userId, onUpdate);
        this.subscriptions.set(`bets-${userId}`, subscription);
        return subscription;
    },
    
    unsubscribe(key) {
        const subscription = this.subscriptions.get(key);
        if (subscription) {
            subscription.unsubscribe();
            this.subscriptions.delete(key);
        }
    },
    
    unsubscribeAll() {
        this.subscriptions.forEach((sub, key) => {
            sub.unsubscribe();
        });
        this.subscriptions.clear();
    }
};

// Make available globally
window.supabaseClient = supabaseClient;
window.supaDB = supaDB;
window.RealtimeManager = RealtimeManager;

console.log('✅ Supabase Client v3.0 Initialized');
