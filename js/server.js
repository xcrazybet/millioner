// ============================================
// server.js - X Lodon Sports API
// ✅ ALL endpoints working
// ✅ Fetches real match data
// ✅ 90-day range support
// ============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// API-Football configuration
const API_KEY = '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';

app.use(cors());
app.use(express.json());

// Helper function
async function fetchFromAPI(endpoint, params = {}) {
    try {
        console.log(`📡 Calling: ${endpoint}`, params);
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
            params: params,
            headers: { 
                'x-apisports-key': API_KEY,
                'x-apisports-host': 'v3.football.api-sports.io'
            },
            timeout: 30000
        });
        console.log(`✅ Response: ${response.data.results || 0} results`);
        return { 
            success: true, 
            data: response.data.response, 
            total: response.data.results || 0 
        };
    } catch (error) {
        console.error(`❌ API Error:`, error.response?.data?.message || error.message);
        return { success: false, data: [], total: 0, error: error.message };
    }
}

// ============================================
// 1. HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        api_configured: !!API_KEY
    });
});

// ============================================
// 2. TEST ENDPOINT
// ============================================
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'API is working!',
        endpoints: [
            '/api/fixtures/week',
            '/api/fixtures/date/:date',
            '/api/fixtures/range/:from/:to',
            '/api/livescores',
            '/api/leagues',
            '/api/fixture/:id',
            '/api/fixtures/events/:id',
            '/api/fixtures/statistics/:id',
            '/api/fixtures/head2head/:home/:away',
            '/api/predictions/:id',
            '/api/standings/:league/:season'
        ]
    });
});

// ============================================
// 3. GET FIXTURES FOR WEEK (NEXT 7 DAYS)
// ============================================
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        const to = nextWeek.toISOString().split('T')[0];
        
        console.log(`📅 Fetching fixtures from ${from} to ${to}`);
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data.length > 0) {
            const fixtures = result.data.map(f => ({
                fixture: {
                    id: f.fixture.id,
                    date: f.fixture.date,
                    status: f.fixture.status,
                    venue: f.fixture.venue
                },
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo,
                    country: f.league.country
                },
                teams: {
                    home: {
                        id: f.teams.home.id,
                        name: f.teams.home.name,
                        logo: f.teams.home.logo
                    },
                    away: {
                        id: f.teams.away.id,
                        name: f.teams.away.name,
                        logo: f.teams.away.logo
                    }
                },
                goals: {
                    home: f.goals.home,
                    away: f.goals.away
                }
            }));
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date_range: { from, to }
            });
        } else {
            res.json({ success: true, data: [], count: 0, date_range: { from, to } });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 4. GET FIXTURES FOR SPECIFIC DATE
// ============================================
app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
        console.log(`📅 Fetching fixtures for date: ${date}`);
        
        const result = await fetchFromAPI('/fixtures', { date });
        
        if (result.success && result.data.length > 0) {
            const fixtures = result.data.map(f => ({
                fixture: {
                    id: f.fixture.id,
                    date: f.fixture.date,
                    status: f.fixture.status
                },
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo,
                    country: f.league.country
                },
                teams: {
                    home: {
                        id: f.teams.home.id,
                        name: f.teams.home.name,
                        logo: f.teams.home.logo
                    },
                    away: {
                        id: f.teams.away.id,
                        name: f.teams.away.name,
                        logo: f.teams.away.logo
                    }
                },
                goals: {
                    home: f.goals.home,
                    away: f.goals.away
                }
            }));
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date: date
            });
        } else {
            res.json({ success: true, data: [], count: 0, date: date });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 5. GET FIXTURES FOR DATE RANGE (90 DAYS)
// ============================================
app.get('/api/fixtures/range/:from/:to', async (req, res) => {
    try {
        const { from, to } = req.params;
        console.log(`📅 Fetching fixtures from ${from} to ${to}`);
        
        // Validate dates
        const fromDate = new Date(from);
        const toDate = new Date(to);
        
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return res.json({ success: false, error: 'Invalid date format' });
        }
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data.length > 0) {
            const fixtures = result.data.map(f => ({
                fixture: {
                    id: f.fixture.id,
                    date: f.fixture.date,
                    status: f.fixture.status
                },
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo,
                    country: f.league.country
                },
                teams: {
                    home: {
                        id: f.teams.home.id,
                        name: f.teams.home.name,
                        logo: f.teams.home.logo
                    },
                    away: {
                        id: f.teams.away.id,
                        name: f.teams.away.name,
                        logo: f.teams.away.logo
                    }
                }
            }));
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date_range: { from, to }
            });
        } else {
            res.json({ success: true, data: [], count: 0, date_range: { from, to } });
        }
    } catch (error) {
        console.error('Range endpoint error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 6. GET LIVE SCORES
// ============================================
app.get('/api/livescores', async (req, res) => {
    try {
        console.log(`🔴 Fetching live scores...`);
        
        const result = await fetchFromAPI('/fixtures', { live: 'all' });
        
        if (result.success && result.data.length > 0) {
            const liveMatches = result.data.filter(f => 
                f.fixture.status.short === '1H' ||
                f.fixture.status.short === '2H' ||
                f.fixture.status.short === 'HT'
            );
            
            const matches = liveMatches.map(f => ({
                fixture: {
                    id: f.fixture.id,
                    date: f.fixture.date,
                    status: f.fixture.status,
                    elapsed: f.fixture.status.elapsed
                },
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo,
                    country: f.league.country
                },
                teams: {
                    home: {
                        id: f.teams.home.id,
                        name: f.teams.home.name,
                        logo: f.teams.home.logo
                    },
                    away: {
                        id: f.teams.away.id,
                        name: f.teams.away.name,
                        logo: f.teams.away.logo
                    }
                },
                goals: {
                    home: f.goals.home,
                    away: f.goals.away
                }
            }));
            
            res.json({
                success: true,
                data: matches,
                count: matches.length
            });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 7. GET ALL LEAGUES
// ============================================
app.get('/api/leagues', async (req, res) => {
    try {
        console.log(`📋 Fetching leagues...`);
        
        const result = await fetchFromAPI('/leagues');
        
        if (result.success && result.data.length > 0) {
            const leagues = result.data.map(l => ({
                id: l.league.id,
                name: l.league.name,
                logo: l.league.logo,
                type: l.league.type,
                country: l.country.name,
                country_code: l.country.code,
                flag: l.country.flag
            }));
            
            res.json({
                success: true,
                data: leagues,
                count: leagues.length
            });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 8. GET SINGLE FIXTURE DETAILS
// ============================================
app.get('/api/fixture/:id', async (req, res) => {
    try {
        const fixtureId = req.params.id;
        console.log(`📋 Fetching fixture details: ${fixtureId}`);
        
        const [fixtureRes, eventsRes, statsRes, oddsRes] = await Promise.all([
            fetchFromAPI('/fixtures', { id: fixtureId }),
            fetchFromAPI('/fixtures/events', { fixture: fixtureId }),
            fetchFromAPI('/fixtures/statistics', { fixture: fixtureId }),
            fetchFromAPI('/odds', { fixture: fixtureId })
        ]);
        
        if (fixtureRes.success && fixtureRes.data.length > 0) {
            const f = fixtureRes.data[0];
            res.json({
                success: true,
                fixture: {
                    id: f.fixture.id,
                    date: f.fixture.date,
                    status: f.fixture.status,
                    venue: f.fixture.venue
                },
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo,
                    country: f.league.country
                },
                teams: {
                    home: {
                        id: f.teams.home.id,
                        name: f.teams.home.name,
                        logo: f.teams.home.logo
                    },
                    away: {
                        id: f.teams.away.id,
                        name: f.teams.away.name,
                        logo: f.teams.away.logo
                    }
                },
                goals: f.goals,
                events: eventsRes.data,
                statistics: statsRes.data,
                odds: oddsRes.data
            });
        } else {
            res.json({ success: false, error: 'Fixture not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 9. GET MATCH EVENTS
// ============================================
app.get('/api/fixtures/events/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures/events', { fixture: req.params.id });
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 10. GET MATCH STATISTICS
// ============================================
app.get('/api/fixtures/statistics/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures/statistics', { fixture: req.params.id });
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 11. GET HEAD TO HEAD
// ============================================
app.get('/api/fixtures/head2head/:home/:away', async (req, res) => {
    try {
        const { home, away } = req.params;
        const result = await fetchFromAPI('/fixtures/headtohead', { h2h: `${home}-${away}` });
        
        if (result.success && result.data.length > 0) {
            const matches = result.data.map(f => ({
                fixture: {
                    id: f.fixture.id,
                    date: f.fixture.date,
                    status: f.fixture.status
                },
                teams: {
                    home: {
                        name: f.teams.home.name,
                        winner: f.teams.home.winner
                    },
                    away: {
                        name: f.teams.away.name,
                        winner: f.teams.away.winner
                    }
                },
                goals: {
                    home: f.goals.home,
                    away: f.goals.away
                }
            }));
            
            const total = matches.length;
            const homeWins = matches.filter(m => m.teams.home.winner === true).length;
            const awayWins = matches.filter(m => m.teams.away.winner === true).length;
            const draws = total - homeWins - awayWins;
            
            res.json({
                success: true,
                data: matches,
                stats: {
                    total_matches: total,
                    home_wins: homeWins,
                    away_wins: awayWins,
                    draws: draws,
                    home_win_rate: ((homeWins / total) * 100).toFixed(1),
                    away_win_rate: ((awayWins / total) * 100).toFixed(1),
                    draw_rate: ((draws / total) * 100).toFixed(1)
                }
            });
        } else {
            res.json({ success: true, data: [], stats: null });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 12. GET PREDICTIONS
// ============================================
app.get('/api/predictions/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/predictions', { fixture: req.params.id });
        res.json({ success: true, data: result.data[0] || null });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 13. GET LEAGUE STANDINGS
// ============================================
app.get('/api/standings/:league/:season', async (req, res) => {
    try {
        const { league, season } = req.params;
        const result = await fetchFromAPI('/standings', { league, season });
        
        if (result.success && result.data.length > 0) {
            res.json({ success: true, data: result.data });
        } else {
            res.json({ success: true, data: [] });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 14. GET TEAM INFORMATION
// ============================================
app.get('/api/team/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/teams', { id: req.params.id });
        
        if (result.success && result.data.length > 0) {
            const team = result.data[0];
            res.json({
                success: true,
                data: {
                    id: team.team.id,
                    name: team.team.name,
                    logo: team.team.logo,
                    country: team.team.country,
                    venue: team.venue
                }
            });
        } else {
            res.json({ success: false, error: 'Team not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 15. GET TOP SCORERS
// ============================================
app.get('/api/topscorers/:league/:season', async (req, res) => {
    try {
        const { league, season } = req.params;
        const result = await fetchFromAPI('/players/topscorers', { league, season });
        
        if (result.success && result.data.length > 0) {
            const scorers = result.data.map(p => ({
                rank: p.rank,
                player: p.player.name,
                team: p.statistics[0]?.team?.name,
                goals: p.statistics[0]?.goals?.total,
                assists: p.statistics[0]?.goals?.assists
            }));
            res.json({ success: true, data: scorers, count: scorers.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 16. GET COUNTRIES
// ============================================
app.get('/api/countries', async (req, res) => {
    try {
        const result = await fetchFromAPI('/countries');
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 17. DEBUG ENDPOINT
// ============================================
app.get('/api/debug', async (req, res) => {
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const to = nextWeek.toISOString().split('T')[0];
    
    const result = await fetchFromAPI('/fixtures', { from, to });
    
    res.json({
        success: true,
        api_working: result.success,
        total_matches: result.total,
        date_range: { from, to },
        sample: result.data ? result.data.slice(0, 3) : []
    });
});

// ============================================
// ROOT ENDPOINT
// ============================================
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '11.0.0',
        status: 'active',
        api_configured: !!API_KEY,
        endpoints: {
            health: '/health',
            test: '/api/test',
            fixtures_week: '/api/fixtures/week',
            fixtures_date: '/api/fixtures/date/:date',
            fixtures_range: '/api/fixtures/range/:from/:to',
            livescores: '/api/livescores',
            fixture: '/api/fixture/:id',
            events: '/api/fixtures/events/:id',
            statistics: '/api/fixtures/statistics/:id',
            head2head: '/api/fixtures/head2head/:home/:away',
            predictions: '/api/predictions/:id',
            leagues: '/api/leagues',
            standings: '/api/standings/:league/:season',
            team: '/api/team/:id',
            topscorers: '/api/topscorers/:league/:season',
            countries: '/api/countries',
            debug: '/api/debug'
        },
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 X Lodon Sports API Server');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🔑 API Key: ${API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`📡 Status: Ready to fetch data`);
    console.log('========================================\n');
});
