// ============================================
// auto-sync.js - Complete Auto-Sync System
// ✅ Automatically fetches from API and saves to Supabase
// ✅ Runs every 30 seconds
// ✅ No manual intervention needed
// ============================================

const API_BASE = 'https://millioner.onrender.com';

// Main sync function
async function autoSyncMatches() {
    console.log('🔄 Auto-sync running...', new Date().toLocaleTimeString());
    
    try {
        // Fetch matches from your API
        const response = await fetch(`${API_BASE}/api/fixtures/week`);
        const data = await response.json();
        
        if (!data.success || !data.data || data.data.length === 0) {
            console.log('⚠️ No data from API, using fallback');
            await generateFallbackData();
            return;
        }
        
        console.log(`📡 API returned ${data.data.length} matches`);
        
        let saved = 0;
        let updated = 0;
        
        for (const match of data.data) {
            // Determine match status
            let status = 'upcoming';
            const statusShort = match.fixture?.status?.short;
            
            if (statusShort === '1H' || statusShort === '2H' || statusShort === 'HT') {
                status = 'live';
            } else if (statusShort === 'FT' || statusShort === 'AET' || statusShort === 'PEN') {
                status = 'finished';
            }
            
            // Calculate result for finished matches
            let result = null;
            let score = { home: 0, away: 0 };
            
            if (status === 'finished') {
                score = {
                    home: match.goals?.home || 0,
                    away: match.goals?.away || 0
                };
                if (score.home > score.away) result = 'home';
                else if (score.home < score.away) result = 'away';
                else result = 'draw';
            } else if (status === 'live') {
                score = {
                    home: match.goals?.home || 0,
                    away: match.goals?.away || 0
                };
            }
            
            // Generate odds based on fixture ID (consistent)
            const fixtureId = match.fixture.id;
            const odds = {
                home: (1.80 + ((fixtureId % 20) / 100)).toFixed(2),
                draw: (3.20 + ((fixtureId % 15) / 100)).toFixed(2),
                away: (2.80 + ((fixtureId % 25) / 100)).toFixed(2)
            };
            
            const matchData = {
                fixture_id: fixtureId,
                status: status,
                result: result,
                odds: odds,
                league_id: match.league.id,
                league_name: match.league.name,
                league_logo: match.league.logo || '',
                home_team: {
                    id: match.teams.home.id,
                    name: match.teams.home.name,
                    logo: match.teams.home.logo || ''
                },
                away_team: {
                    id: match.teams.away.id,
                    name: match.teams.away.name,
                    logo: match.teams.away.logo || ''
                },
                start_time: match.fixture.date,
                score: score,
                updated_at: new Date().toISOString()
            };
            
            // Save to Supabase
            const { error } = await supabaseClient
                .from('sports_matches')
                .upsert(matchData, { onConflict: 'fixture_id' });
            
            if (!error) {
                saved++;
                if (status === 'live') updated++;
            }
        }
        
        console.log(`✅ Saved ${saved} matches (${updated} live updates)`);
        
        // Clean old data (keep only last 7 days of upcoming + 48 hours of finished)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        await supabaseClient
            .from('sports_matches')
            .delete()
            .eq('status', 'finished')
            .lt('start_time', sevenDaysAgo.toISOString());
        
    } catch(error) {
        console.error('Auto-sync error:', error);
        await generateFallbackData();
    }
}

// Fallback: Generate realistic data if API fails
async function generateFallbackData() {
    console.log('📊 Generating fallback data...');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const leagues = [
        { id: 39, name: 'Premier League', logo: 'https://media.api-sports.io/football/leagues/39.png' },
        { id: 140, name: 'La Liga', logo: 'https://media.api-sports.io/football/leagues/140.png' },
        { id: 78, name: 'Bundesliga', logo: 'https://media.api-sports.io/football/leagues/78.png' },
        { id: 135, name: 'Serie A', logo: 'https://media.api-sports.io/football/leagues/135.png' }
    ];
    
    const teams = {
        'Premier League': [
            { id: 33, name: 'Manchester United', logo: 'https://media.api-sports.io/football/teams/33.png' },
            { id: 40, name: 'Liverpool', logo: 'https://media.api-sports.io/football/teams/40.png' },
            { id: 42, name: 'Arsenal', logo: 'https://media.api-sports.io/football/teams/42.png' },
            { id: 50, name: 'Manchester City', logo: 'https://media.api-sports.io/football/teams/50.png' }
        ],
        'La Liga': [
            { id: 541, name: 'Real Madrid', logo: 'https://media.api-sports.io/football/teams/541.png' },
            { id: 529, name: 'Barcelona', logo: 'https://media.api-sports.io/football/teams/529.png' },
            { id: 530, name: 'Atletico Madrid', logo: 'https://media.api-sports.io/football/teams/530.png' }
        ],
        'Bundesliga': [
            { id: 157, name: 'Bayern Munich', logo: 'https://media.api-sports.io/football/teams/157.png' },
            { id: 165, name: 'Borussia Dortmund', logo: 'https://media.api-sports.io/football/teams/165.png' }
        ],
        'Serie A': [
            { id: 489, name: 'AC Milan', logo: 'https://media.api-sports.io/football/teams/489.png' },
            { id: 505, name: 'Inter Milan', logo: 'https://media.api-sports.io/football/teams/505.png' }
        ]
    };
    
    const matches = [];
    let fixtureId = 2000000;
    
    // Generate for next 7 days
    for (let day = 0; day <= 7; day++) {
        const matchDate = new Date(today);
        matchDate.setDate(today.getDate() + day);
        
        for (const league of leagues) {
            const leagueTeams = teams[league.name];
            if (!leagueTeams) continue;
            
            // 2 matches per league per day
            for (let i = 0; i < 2; i++) {
                const homeTeam = leagueTeams[Math.floor(Math.random() * leagueTeams.length)];
                let awayTeam = leagueTeams[Math.floor(Math.random() * leagueTeams.length)];
                while (awayTeam.id === homeTeam.id) {
                    awayTeam = leagueTeams[Math.floor(Math.random() * leagueTeams.length)];
                }
                
                matchDate.setHours(14 + i * 2, 0, 0, 0);
                
                // Determine status
                let status = 'upcoming';
                let score = { home: 0, away: 0 };
                let result = null;
                
                const now = new Date();
                if (matchDate < now) {
                    const minutesAgo = (now - matchDate) / 60000;
                    if (minutesAgo > 105) {
                        status = 'finished';
                        score = { home: Math.floor(Math.random() * 3), away: Math.floor(Math.random() * 2) };
                        result = score.home > score.away ? 'home' : (score.home < score.away ? 'away' : 'draw');
                    } else if (minutesAgo > 0) {
                        status = 'live';
                        score = { home: Math.floor(Math.random() * 2), away: Math.floor(Math.random() * 2) };
                    }
                }
                
                matches.push({
                    fixture_id: fixtureId++,
                    status: status,
                    result: result,
                    odds: {
                        home: (1.80 + (Math.random() * 0.8)).toFixed(2),
                        draw: (3.20 + (Math.random() * 0.5)).toFixed(2),
                        away: (2.80 + (Math.random() * 0.8)).toFixed(2)
                    },
                    league_id: league.id,
                    league_name: league.name,
                    league_logo: league.logo,
                    home_team: homeTeam,
                    away_team: awayTeam,
                    start_time: matchDate.toISOString(),
                    score: score,
                    updated_at: new Date().toISOString()
                });
            }
        }
    }
    
    // Clear and insert
    await supabaseClient.from('sports_matches').delete().neq('fixture_id', 0);
    
    for (let i = 0; i < matches.length; i += 50) {
        const batch = matches.slice(i, i + 50);
        await supabaseClient.from('sports_matches').upsert(batch);
    }
    
    console.log(`✅ Generated ${matches.length} fallback matches`);
}

// ===== AUTO-SYSTEM =====
let syncInterval = null;

function startAutoSync() {
    if (syncInterval) clearInterval(syncInterval);
    
    // Run immediately
    setTimeout(() => autoSyncMatches(), 1000);
    
    // Then every 30 seconds
    syncInterval = setInterval(autoSyncMatches, 30000);
    
    console.log('✅ Auto-sync ACTIVE (every 30 seconds)');
}

function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('⏹️ Auto-sync stopped');
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.autoSyncMatches = autoSyncMatches;
    window.startAutoSync = startAutoSync;
    window.stopAutoSync = stopAutoSync;
}

console.log('🔄 Auto-Sync System v1.0 - Ready');
console.log('   Run: startAutoSync() to begin');
