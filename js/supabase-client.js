// ============================================
// supabase-client.js - v11.0 FINAL
// ✅ FULLY AUTOMATIC - No manual commands needed
// ✅ Auto-creates data when empty
// ✅ Works with your existing schema
// ============================================

const SUPABASE_URL = 'https://jnazybaeajyynpyoszmy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WWHC2XIWlnDR9DsDpg52Vw_UIn2KopQ';

let supaClient = null;
let dataInitialized = false;

// Initialize Supabase
if (typeof supabase !== 'undefined') {
    supaClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase Connected');
}

const DEFAULT_ODDS = { home: 2.50, draw: 3.20, away: 2.80 };

// Auto-generate matches when database is empty
async function autoInitializeData() {
    if (dataInitialized) return true;
    if (!supaClient) return false;
    
    try {
        // Check if we have any matches
        const { count, error } = await supaClient
            .from('sports_matches')
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            console.warn('Error checking data:', error.message);
            return false;
        }
        
        if (count === 0 || count < 30) {
            console.log('📊 Database empty - auto-generating matches...');
            await generateMatches();
        }
        
        dataInitialized = true;
        return true;
    } catch(e) {
        console.error('Auto-init error:', e);
        return false;
    }
}

// Generate 7 days of matches
async function generateMatches() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const leagues = [
        { id: 39, name: 'Premier League' },
        { id: 140, name: 'La Liga' },
        { id: 78, name: 'Bundesliga' },
        { id: 135, name: 'Serie A' },
        { id: 61, name: 'Ligue 1' }
    ];
    
    const teams = {
        'Premier League': ['Manchester United', 'Liverpool', 'Arsenal', 'Chelsea', 'Manchester City', 'Tottenham', 'Newcastle', 'Aston Villa'],
        'La Liga': ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla', 'Real Sociedad', 'Villarreal'],
        'Bundesliga': ['Bayern Munich', 'Borussia Dortmund', 'Bayer Leverkusen', 'RB Leipzig', 'Frankfurt', 'Wolfsburg'],
        'Serie A': ['AC Milan', 'Inter Milan', 'Juventus', 'Napoli', 'Roma', 'Lazio'],
        'Ligue 1': ['PSG', 'Marseille', 'Monaco', 'Lyon', 'Lille', 'Nice']
    };
    
    const matches = [];
    let fixtureId = 10000000;
    
    // Generate for next 7 days
    for (let day = 0; day <= 7; day++) {
        const matchDate = new Date(today);
        matchDate.setDate(today.getDate() + day);
        
        for (const league of leagues) {
            const leagueTeams = teams[league.name];
            if (!leagueTeams) continue;
            
            // 2-4 matches per league per day
            let matchesPerDay = 3;
            if (day === 0) matchesPerDay = 4;
            if (matchDate.getDay() === 0 || matchDate.getDay() === 6) matchesPerDay = 4;
            
            for (let i = 0; i < matchesPerDay; i++) {
                const homeIdx = Math.floor(Math.random() * leagueTeams.length);
                let awayIdx = Math.floor(Math.random() * leagueTeams.length);
                let attempts = 0;
                while (awayIdx === homeIdx && attempts < 10) {
                    awayIdx = Math.floor(Math.random() * leagueTeams.length);
                    attempts++;
                }
                
                const hour = 14 + (i * 2);
                matchDate.setHours(hour, 0, 0, 0);
                
                // Determine status based on date
                let status = 'upcoming';
                let score = { home: 0, away: 0 };
                let result = null;
                const now = new Date();
                
                if (matchDate < now) {
                    const minutesAgo = (now - matchDate) / 60000;
                    if (minutesAgo > 105) {
                        status = 'finished';
                        score = { home: Math.floor(Math.random() * 4), away: Math.floor(Math.random() * 3) };
                        result = score.home > score.away ? 'home' : (score.home < score.away ? 'away' : 'draw');
                    } else if (minutesAgo > 0) {
                        status = 'live';
                        score = { home: Math.floor(Math.random() * 3), away: Math.floor(Math.random() * 3) };
                    }
                }
                
                matches.push({
                    fixture_id: fixtureId++,
                    status: status,
                    result: result,
                    odds: {
                        home: (1.80 + ((fixtureId % 20) / 100)).toFixed(2),
                        draw: (3.20 + ((fixtureId % 15) / 100)).toFixed(2),
                        away: (2.80 + ((fixtureId % 25) / 100)).toFixed(2)
                    },
                    league_id: league.id,
                    league_name: league.name,
                    home_team: { id: homeIdx + 1, name: leagueTeams[homeIdx], logo: '' },
                    away_team: { id: awayIdx + 1, name: leagueTeams[awayIdx], logo: '' },
                    start_time: matchDate.toISOString(),
                    score: score,
                    updated_at: new Date().toISOString(),
                    bets_settled: status === 'finished'
                });
            }
        }
    }
    
    // Clear any existing data
    await supaClient.from('sports_matches').delete().neq('fixture_id', 0);
    
    // Insert in batches
    let inserted = 0;
    for (let i = 0; i < matches.length; i += 30) {
        const batch = matches.slice(i, i + 30);
        const { error } = await supaClient.from('sports_matches').insert(batch);
        if (error) {
            console.error('Insert error:', error.message);
        } else {
            inserted += batch.length;
        }
    }
    
    console.log(`✅ Auto-generated ${inserted} matches`);
    return inserted;
}

// ===== MAIN DATABASE INTERFACE =====
const supaDB = {
    getUpcomingMatches: async function() {
        if (!supaClient) return [];
        try {
            // Auto-initialize if needed
            await autoInitializeData();
            
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
            
            if (error) {
                console.error('Query error:', error);
                return [];
            }
            
            return (data || []).map(m => ({ ...m, odds: m.odds || DEFAULT_ODDS }));
        } catch(e) {
            console.error('getUpcomingMatches error:', e);
            return [];
        }
    },
    
    getLiveMatches: async function() {
        if (!supaClient) return [];
        try {
            await autoInitializeData();
            
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
                    bet_name: bet.betName || bet.betType,
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
            return [];
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
            return [];
        }
    },
    
    refreshData: async function() {
        return await generateMatches();
    }
};

// Export for browser
if (typeof window !== 'undefined') {
    window.supabaseClient = supaClient;
    window.supaDB = supaDB;
    window.refreshSportsData = () => supaDB.refreshData();
}

console.log('📦 Supabase Client v11.0 - FULLY AUTOMATIC');
console.log('   ✅ Auto-creates data when empty');
console.log('   ✅ No manual commands needed');
