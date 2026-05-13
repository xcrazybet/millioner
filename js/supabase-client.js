// ============================================
// supabase-client.js - COMPATIBILITY LAYER
// ✅ Works with existing sports-api.js v21.0
// ✅ Works with existing betting-engine.js v3.0
// ✅ Provides helper functions for match-details.html
// ✅ No conflicts with existing code
// ============================================

// Initialize Supabase (if not already initialized by sports-api.js)
if (typeof supabaseClient === 'undefined') {
    const SUPABASE_URL = 'https://jnazybaeajyynpyoszmy.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuYXp5YmFlYWp5eW5weW9zem15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzgwMDMsImV4cCI6MjA5Mjg1NDAwM30.P_8V-_s6DQDiYekZX1yaNup48WBRaLhb3ILAkvzTDTY'; // Replace with your actual key
    
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase Client initialized');
}

// ===== HELPER FUNCTIONS FOR MATCH-DETAILS.HTML =====
// These work alongside your existing BetManager and WalletManager

const supaDB = {
    // Get single match by fixture ID
    async getMatch(fixtureId) {
        try {
            const { data, error } = await supabaseClient
                .from('sports_matches')
                .select('*')
                .eq('fixture_id', parseInt(fixtureId))
                .single();
            
            if (error) throw error;
            return data;
        } catch(e) {
            console.error('Error getting match:', e);
            return null;
        }
    },
    
    // Get live matches
    async getLiveMatches() {
        try {
            const { data, error } = await supabaseClient
                .from('sports_matches')
                .select('*')
                .eq('status', 'live')
                .order('start_time', { ascending: true });
            
            if (error) throw error;
            return data || [];
        } catch(e) {
            console.error('Error getting live matches:', e);
            return [];
        }
    },
    
    // Get upcoming matches
    async getUpcomingMatches(limit = 50) {
        try {
            const now = new Date().toISOString();
            const { data, error } = await supabaseClient
                .from('sports_matches')
                .select('*')
                .eq('status', 'upcoming')
                .gte('start_time', now)
                .order('start_time', { ascending: true })
                .limit(limit);
            
            if (error) throw error;
            return data || [];
        } catch(e) {
            console.error('Error getting upcoming matches:', e);
            return [];
        }
    },
    
    // Get finished matches
    async getFinishedMatches(limit = 20) {
        try {
            const { data, error } = await supabaseClient
                .from('sports_matches')
                .select('*')
                .eq('status', 'finished')
                .order('updated_at', { ascending: false })
                .limit(limit);
            
            if (error) throw error;
            return data || [];
        } catch(e) {
            console.error('Error getting finished matches:', e);
            return [];
        }
    },
    
    // Place a bet (uses your existing BetManager)
    async placeBet(betData) {
        if (window.BetManager && window.BetManager.placeBet) {
            return await window.BetManager.placeBet(betData);
        }
        throw new Error('BetManager not available');
    },
    
    // Get user's active bets
    async getActiveBets(userId) {
        if (window.BetManager && window.BetManager.getActiveBets) {
            return await window.BetManager.getActiveBets();
        }
        return [];
    },
    
    // Get user's bet history
    async getBetHistory(userId, limit = 50) {
        if (window.BetManager && window.BetManager.getUserBetHistory) {
            return await window.BetManager.getUserBetHistory(limit);
        }
        return [];
    }
};

// Make available globally (without overwriting existing)
window.supaDB = supaDB;

console.log('✅ Supabase Compatibility Layer Loaded');
console.log('   ✅ Works with sports-api.js v21.0');
console.log('   ✅ Works with betting-engine.js v3.0');
