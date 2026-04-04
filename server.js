const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// SportMonks API configuration
const SPORTMONKS_API_TOKEN = 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Enhanced API Routes - Proxy to SportMonks
app.get('/api/test', async (req, res) => {
    try {
        console.log('🧪 Testing SportMonks API...');
        
        // Test multiple endpoints
        const tests = await Promise.allSettled([
            fetch(`${SPORTMONKS_BASE_URL}/../my/resources?api_token=${SPORTMONKS_API_TOKEN}`).then(r => r.json()),
            fetch(`${SPORTMONKS_BASE_URL}/livescores?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores&per_page=5`).then(r => r.json()),
            fetch(`${SPORTMONKS_BASE_URL}/fixtures?api_token=${SPORTMONKS_API_TOKEN}&per_page=5`).then(r => r.json()),
            fetch(`${SPORTMONKS_BASE_URL}/livescores/inplay?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores&per_page=5`).then(r => r.json()),
            fetch(`${SPORTMONKS_BASE_URL}/odds/pre-match?api_token=${SPORTMONKS_API_TOKEN}&per_page=5`).then(r => r.json())
        ]);
        
        const [resources, livescores, fixtures, inplay, odds] = tests.map(t => t.status === 'fulfilled' ? t.value : { error: t.reason.message });
        
        res.json({
            success: true,
            resources,
            livescores,
            fixtures,
            inplay,
            odds,
            message: 'Enhanced API Test Complete'
        });
        
    } catch (error) {
        console.error('❌ API Test Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'API Test Failed'
        });
    }
});

app.get('/api/livescores', async (req, res) => {
    try {
        console.log('🔥 Fetching enhanced live scores...');
        
        // Try multiple live endpoints simultaneously
        const [inplayResponse, livescoresResponse] = await Promise.allSettled([
            fetch(`${SPORTMONKS_BASE_URL}/livescores/inplay?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores;events;lineups;statistics`),
            fetch(`${SPORTMONKS_BASE_URL}/livescores?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores;events;lineups&per_page=20`)
        ]);
        
        let allMatches = [];
        let source = 'none';
        
        // Process inplay data
        if (inplayResponse.status === 'fulfilled') {
            const inplayData = inplayResponse.value;
            if (inplayData.data && inplayData.data.length > 0) {
                allMatches = inplayData.data;
                source = 'inplay';
                console.log(`✅ ${allMatches.length} live matches found (inplay)`);
            }
        }
        
        // Process general livescores if no inplay data
        if (allMatches.length === 0 && livescoresResponse.status === 'fulfilled') {
            const livescoresData = livescoresResponse.value;
            if (livescoresData.data && livescoresData.data.length > 0) {
                const liveMatches = livescoresData.data.filter(match => [2, 3, 4, 5, 6].includes(match.state_id));
                if (liveMatches.length > 0) {
                    allMatches = liveMatches;
                    source = 'general';
                    console.log(`✅ ${allMatches.length} live matches found (general)`);
                }
            }
        }
        
        // Try latest fixtures as final fallback
        if (allMatches.length === 0) {
            try {
                const latestResponse = await fetch(`${SPORTMONKS_BASE_URL}/fixtures/latest?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores;events&per_page=15`);
                const latestData = await latestResponse.json();
                
                if (latestData.data && latestData.data.length > 0) {
                    const recentMatches = latestData.data.filter(match => 
                        [2, 3, 4, 5, 6, 7, 8, 9].includes(match.state_id)
                    );
                    if (recentMatches.length > 0) {
                        allMatches = recentMatches;
                        source = 'latest';
                        console.log(`✅ ${allMatches.length} live matches found (latest)`);
                    }
                }
            } catch (error) {
                console.log('⚠️ Latest fixtures fallback failed:', error.message);
            }
        }
        
        if (allMatches.length > 0) {
            // Enhance matches with additional data
            const enhancedMatches = await Promise.all(allMatches.slice(0, 15).map(async (match) => {
                try {
                    // Add odds for live matches
                    const oddsResponse = await fetch(`${SPORTMONKS_BASE_URL}/odds/inplay/fixtures/${match.id}?api_token=${SPORTMONKS_API_TOKEN}`);
                    const oddsData = await oddsResponse.json();
                    
                    return {
                        ...match,
                        hasOdds: oddsData.data && oddsData.data.length > 0,
                        odds: oddsData.data || [],
                        enhanced: true
                    };
                } catch (error) {
                    return { ...match, hasOdds: false, odds: [], enhanced: true };
                }
            }));
            
            return res.json({ 
                success: true, 
                data: enhancedMatches, 
                source,
                total: allMatches.length,
                message: `Enhanced with odds data`
            });
        }
        
        console.log('❌ No live matches found');
        res.json({ 
            success: true, 
            data: [], 
            source: 'none', 
            message: 'No live matches available - try again later' 
        });
        
    } catch (error) {
        console.error('❌ Live scores error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/upcoming', async (req, res) => {
    try {
        console.log('📅 Fetching enhanced upcoming matches...');
        
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        // Try multiple date ranges simultaneously
        const [todayResponse, tomorrowResponse, weekResponse] = await Promise.allSettled([
            fetch(`${SPORTMONKS_BASE_URL}/fixtures/date/${today}?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores;lineups;odds&per_page=15`),
            fetch(`${SPORTMONKS_BASE_URL}/fixtures/date/${tomorrow}?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores;lineups;odds&per_page=15`),
            fetch(`${SPORTMONKS_BASE_URL}/fixtures/between/${today}/${nextWeek}?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores;lineups;odds&per_page=25`)
        ]);
        
        let allMatches = [];
        let source = 'none';
        
        // Process today's matches
        if (todayResponse.status === 'fulfilled') {
            const todayData = todayResponse.value;
            if (todayData.data && todayData.data.length > 0) {
                const todayUpcoming = todayData.data.filter(match => 
                    [1, 45, 46].includes(match.state_id)
                );
                if (todayUpcoming.length > 0) {
                    allMatches = todayUpcoming;
                    source = 'today';
                    console.log(`✅ ${allMatches.length} upcoming matches found (today)`);
                }
            }
        }
        
        // Process tomorrow's matches if no today matches
        if (allMatches.length === 0 && tomorrowResponse.status === 'fulfilled') {
            const tomorrowData = tomorrowResponse.value;
            if (tomorrowData.data && tomorrowData.data.length > 0) {
                const tomorrowUpcoming = tomorrowData.data.filter(match => 
                    [1, 45, 46].includes(match.state_id)
                );
                if (tomorrowUpcoming.length > 0) {
                    allMatches = tomorrowUpcoming;
                    source = 'tomorrow';
                    console.log(`✅ ${allMatches.length} upcoming matches found (tomorrow)`);
                }
            }
        }
        
        // Process week's matches if no today/tomorrow matches
        if (allMatches.length === 0 && weekResponse.status === 'fulfilled') {
            const weekData = weekResponse.value;
            if (weekData.data && weekData.data.length > 0) {
                const weekUpcoming = weekData.data.filter(match => 
                    [1, 45, 46].includes(match.state_id)
                ).sort((a, b) => new Date(a.starting_at) - new Date(b.starting_at)).slice(0, 20);
                
                if (weekUpcoming.length > 0) {
                    allMatches = weekUpcoming;
                    source = 'week';
                    console.log(`✅ ${allMatches.length} upcoming matches found (week)`);
                }
            }
        }
        
        if (allMatches.length > 0) {
            // Enhance matches with additional data
            const enhancedMatches = await Promise.all(allMatches.slice(0, 20).map(async (match) => {
                try {
                    // Add pre-match odds
                    const oddsResponse = await fetch(`${SPORTMONKS_BASE_URL}/odds/pre-match/fixtures/${match.id}?api_token=${SPORTMONKS_API_TOKEN}&include=bookmaker`);
                    const oddsData = await oddsResponse.json();
                    
                    // Add league information
                    const leagueResponse = await fetch(`${SPORTMONKS_BASE_URL}/leagues/${match.league_id}?api_token=${SPORTMONKS_API_TOKEN}`);
                    const leagueData = await leagueResponse.json();
                    
                    return {
                        ...match,
                        hasOdds: oddsData.data && oddsData.data.length > 0,
                        odds: oddsData.data || [],
                        leagueInfo: leagueData.data || null,
                        enhanced: true
                    };
                } catch (error) {
                    return { ...match, hasOdds: false, odds: [], leagueInfo: null, enhanced: true };
                }
            }));
            
            return res.json({ 
                success: true, 
                data: enhancedMatches, 
                source,
                total: allMatches.length,
                message: `Enhanced with odds and league data`
            });
        }
        
        console.log('❌ No upcoming matches found');
        res.json({ 
            success: true, 
            data: [], 
            source: 'none', 
            message: 'No upcoming matches available - check back later' 
        });
        
    } catch (error) {
        console.error('❌ Upcoming matches error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/finished', async (req, res) => {
    try {
        console.log('🏁 Fetching enhanced finished matches...');
        
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];
        
        // Try multiple date ranges simultaneously
        const [generalResponse, yesterdayResponse, weekResponse] = await Promise.allSettled([
            fetch(`${SPORTMONKS_BASE_URL}/fixtures?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores;events;statistics&per_page=25`),
            fetch(`${SPORTMONKS_BASE_URL}/fixtures/date/${yesterday}?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores;events;statistics&per_page=20`),
            fetch(`${SPORTMONKS_BASE_URL}/fixtures/between/${lastWeek}/${today}?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores;events;statistics&per_page=30`)
        ]);
        
        let allMatches = [];
        let source = 'none';
        
        // Process general fixtures
        if (generalResponse.status === 'fulfilled') {
            const generalData = generalResponse.value;
            if (generalData.data && generalData.data.length > 0) {
                const generalFinished = generalData.data.filter(match => 
                    [100, 90, 5].includes(match.state_id)
                ).sort((a, b) => new Date(b.starting_at) - new Date(a.starting_at)).slice(0, 15);
                
                if (generalFinished.length > 0) {
                    allMatches = generalFinished;
                    source = 'general';
                    console.log(`✅ ${allMatches.length} finished matches found (general)`);
                }
            }
        }
        
        // Process yesterday's matches if no general matches
        if (allMatches.length === 0 && yesterdayResponse.status === 'fulfilled') {
            const yesterdayData = yesterdayResponse.value;
            if (yesterdayData.data && yesterdayData.data.length > 0) {
                const yesterdayFinished = yesterdayData.data.filter(match => 
                    [100, 90, 5].includes(match.state_id)
                ).sort((a, b) => new Date(b.starting_at) - new Date(a.starting_at));
                
                if (yesterdayFinished.length > 0) {
                    allMatches = yesterdayFinished;
                    source = 'yesterday';
                    console.log(`✅ ${allMatches.length} finished matches found (yesterday)`);
                }
            }
        }
        
        // Process week's matches if no others
        if (allMatches.length === 0 && weekResponse.status === 'fulfilled') {
            const weekData = weekResponse.value;
            if (weekData.data && weekData.data.length > 0) {
                const weekFinished = weekData.data.filter(match => 
                    [100, 90, 5].includes(match.state_id)
                ).sort((a, b) => new Date(b.starting_at) - new Date(a.starting_at)).slice(0, 20);
                
                if (weekFinished.length > 0) {
                    allMatches = weekFinished;
                    source = 'week';
                    console.log(`✅ ${allMatches.length} finished matches found (week)`);
                }
            }
        }
        
        if (allMatches.length > 0) {
            // Enhance matches with additional data
            const enhancedMatches = await Promise.all(allMatches.slice(0, 20).map(async (match) => {
                try {
                    // Add match statistics
                    const statsResponse = await fetch(`${SPORTMONKS_BASE_URL}/fixtures/${match.id}/statistics?api_token=${SPORTMONKS_API_TOKEN}`);
                    const statsData = await statsResponse.json();
                    
                    // Add match events (goals, cards, etc.)
                    const eventsResponse = await fetch(`${SPORTMONKS_BASE_URL}/fixtures/${match.id}/events?api_token=${SPORTMONKS_API_TOKEN}&include=player;team`);
                    const eventsData = await eventsResponse.json();
                    
                    return {
                        ...match,
                        hasStats: statsData.data && statsData.data.length > 0,
                        statistics: statsData.data || [],
                        hasEvents: eventsData.data && eventsData.data.length > 0,
                        events: eventsData.data || [],
                        enhanced: true
                    };
                } catch (error) {
                    return { ...match, hasStats: false, statistics: [], hasEvents: false, events: [], enhanced: true };
                }
            }));
            
            return res.json({ 
                success: true, 
                data: enhancedMatches, 
                source,
                total: allMatches.length,
                message: `Enhanced with statistics and events data`
            });
        }
        
        console.log('❌ No finished matches found');
        res.json({ 
            success: true, 
            data: [], 
            source: 'none', 
            message: 'No finished matches available - check back later' 
        });
        
    } catch (error) {
        console.error('❌ Finished matches error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add new enhanced endpoints
app.get('/api/leagues', async (req, res) => {
    try {
        console.log('🏆 Fetching popular leagues...');
        
        const response = await fetch(`${SPORTMONKS_BASE_URL}/leagues?api_token=${SPORTMONKS_API_TOKEN}&include=country&per_page=50`);
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            // Sort by popular leagues first
            const popularLeagues = data.data.filter(league => 
                [2, 8, 384, 140, 398, 135, 61].includes(league.id) // Premier League, La Liga, Serie A, etc.
            );
            const otherLeagues = data.data.filter(league => 
                ![2, 8, 384, 140, 398, 135, 61].includes(league.id)
            );
            
            const sortedLeagues = [...popularLeagues, ...otherLeagues].slice(0, 30);
            
            console.log(`✅ ${sortedLeagues.length} leagues found`);
            return res.json({ success: true, data: sortedLeagues });
        }
        
        res.json({ success: true, data: [], message: 'No leagues found' });
        
    } catch (error) {
        console.error('❌ Leagues error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/teams/:id', async (req, res) => {
    try {
        const teamId = req.params.id;
        console.log(`⚽ Fetching team ${teamId} info...`);
        
        const response = await fetch(`${SPORTMONKS_BASE_URL}/teams/${teamId}?api_token=${SPORTMONKS_API_TOKEN}&include=country;league;statistics`);
        const data = await response.json();
        
        if (data.data) {
            console.log(`✅ Team ${teamId} info loaded`);
            return res.json({ success: true, data: data.data });
        }
        
        res.json({ success: false, message: 'Team not found' });
        
    } catch (error) {
        console.error('❌ Team error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/realtime/updates', async (req, res) => {
    try {
        console.log('🔄 Fetching real-time updates...');
        
        // Get latest updates from multiple sources
        const [livescores, fixtures] = await Promise.allSettled([
            fetch(`${SPORTMONKS_BASE_URL}/livescores?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores&per_page=10`).then(r => r.json()),
            fetch(`${SPORTMONKS_BASE_URL}/fixtures/latest?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores&per_page=10`).then(r => r.json())
        ]);
        
        const updates = {
            livescores: livescores.status === 'fulfilled' ? livescores.value.data || [] : [],
            fixtures: fixtures.status === 'fulfilled' ? fixtures.value.data || [] : [],
            timestamp: new Date().toISOString()
        };
        
        res.json({ success: true, ...updates });
        
    } catch (error) {
        console.error('❌ Real-time updates error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'betting-server.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Enhanced Betting App Server Running!`);
    console.log(`📱 Open: http://localhost:${PORT}`);
    console.log(`🔗 Enhanced API Endpoints:`);
    console.log(`   - GET /api/test (5 endpoints tested)`);
    console.log(`   - GET /api/livescores (enhanced with odds)`);
    console.log(`   - GET /api/upcoming (enhanced with league data)`);
    console.log(`   - GET /api/finished (enhanced with stats/events)`);
    console.log(`   - GET /api/leagues (popular leagues first)`);
    console.log(`   - GET /api/teams/:id (team details)`);
    console.log(`   - GET /api/realtime/updates (real-time data)`);
    console.log(`🎯 SportMonks API Token: ${SPORTMONKS_API_TOKEN.substring(0, 10)}...`);
    console.log(`⚡ Enhanced Features: Odds, Statistics, Events, Real-time Updates`);
});
