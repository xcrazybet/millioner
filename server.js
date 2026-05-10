// ============================================
// server.js - X Lodon Sports API
// ✅ Fetches ALL matches worldwide
// ✅ No league filtering
// ✅ Wider date range
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

// Helper function to fetch from API-Football
async function fetchFromAPI(endpoint, params = {}) {
    try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
            params: params,
            headers: {
                'x-apisports-key': API_KEY
            },
            timeout: 30000
        });
        return { success: true, data: response.data.response, results: response.data.results };
    } catch (error) {
        console.error(`API Error:`, error.response?.data?.message || error.message);
        return { success: false, data: [], error: error.message };
    }
}

// ============================================
// MAIN ENDPOINT - GET ALL MATCHES FOR WEEK
// ============================================
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        const to = nextWeek.toISOString().split('T')[0];
        
        console.log(`📅 Fetching ALL fixtures worldwide from ${from} to ${to}`);
        
        // Fetch ALL fixtures - no league filtering
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data.length > 0) {
            console.log(`✅ Found ${result.data.length} matches worldwide`);
            
            // Log first few matches for debugging
            console.log('Sample matches:', result.data.slice(0, 3).map(m => ({
                league: m.league.name,
                home: m.teams.home.name,
                away: m.teams.away.name,
                date: m.fixture.date
            })));
            
            // Format fixtures
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
            
            // Group by country/league
            const groupedByCountry = {};
            fixtures.forEach(f => {
                const country = f.league.country || 'World';
                if (!groupedByCountry[country]) groupedByCountry[country] = [];
                groupedByCountry[country].push(f);
            });
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                grouped_by_country: groupedByCountry,
                date_range: { from, to },
                message: `Found ${fixtures.length} matches worldwide`,
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`⚠️ No fixtures found for ${from} to ${to}`);
            res.json({
                success: true,
                data: [],
                count: 0,
                date_range: { from, to },
                message: 'No matches found in this period',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET LIVE SCORES - ALL LIVE MATCHES
// ============================================
app.get('/api/livescores', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures', { live: 'all' });
        
        if (result.success && result.data.length > 0) {
            const liveMatches = result.data.filter(f =>
                f.fixture.status.short === '1H' ||
                f.fixture.status.short === '2H' ||
                f.fixture.status.short === 'HT'
            );
            
            console.log(`🔴 Found ${liveMatches.length} live matches worldwide`);
            
            const matches = liveMatches.map(f => ({
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
            
            res.json({ success: true, data: matches, count: matches.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============================================
// GET FIXTURES FOR SPECIFIC DATE
// ============================================
app.get('/api/fixture/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
        const result = await fetchFromAPI('/fixtures', { date });
        
        if (result.success && result.data.length > 0) {
            console.log(`📅 Found ${result.data.length} matches on ${date}`);
            
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
                    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
                    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo }
                }
            }));
            
            res.json({ success: true, data: fixtures, count: fixtures.length, date: date });
        } else {
            res.json({ success: true, data: [], count: 0, date: date });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============================================
// GET ALL LEAGUES (No filtering)
// ============================================
app.get('/api/leagues', async (req, res) => {
    try {
        const result = await fetchFromAPI('/leagues');
        
        if (result.success && result.data.length > 0) {
            const leagues = result.data.map(l => ({
                id: l.league.id,
                name: l.league.name,
                logo: l.league.logo,
                country: l.country.name,
                type: l.league.type
            }));
            
            console.log(`📋 Found ${leagues.length} leagues worldwide`);
            res.json({ success: true, data: leagues, count: leagues.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============================================
// GET SINGLE FIXTURE DETAILS
// ============================================
app.get('/api/fixture/:id', async (req, res) => {
    try {
        const fixtureId = req.params.id;
        const result = await fetchFromAPI('/fixtures', { id: fixtureId });
        
        if (result.success && result.data.length > 0) {
            const fixture = result.data[0];
            res.json({
                success: true,
                fixture: {
                    id: fixture.fixture.id,
                    date: fixture.fixture.date,
                    status: fixture.fixture.status,
                    venue: fixture.fixture.venue
                },
                league: {
                    id: fixture.league.id,
                    name: fixture.league.name,
                    logo: fixture.league.logo,
                    country: fixture.league.country
                },
                teams: {
                    home: {
                        id: fixture.teams.home.id,
                        name: fixture.teams.home.name,
                        logo: fixture.teams.home.logo
                    },
                    away: {
                        id: fixture.teams.away.id,
                        name: fixture.teams.away.name,
                        logo: fixture.teams.away.logo
                    }
                },
                goals: fixture.goals,
                score: fixture.score
            });
        } else {
            res.json({ success: false, error: 'Fixture not found' });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============================================
// GET MATCH EVENTS
// ============================================
app.get('/api/fixtures/events/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures/events', { fixture: req.params.id });
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        api_configured: !!API_KEY
    });
});

// ============================================
// ROOT ENDPOINT
// ============================================
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '9.0.0',
        status: 'active',
        api_key_configured: !!API_KEY,
        endpoints: {
            fixtures_week: '/api/fixtures/week',
            livescores: '/api/livescores',
            fixtures_date: '/api/fixture/date/:date',
            fixture_details: '/api/fixture/:id',
            leagues: '/api/leagues',
            events: '/api/fixtures/events/:id',
            health: '/health'
        },
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 X Lodon Sports API Server');
    console.log(`📍 Port: ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    console.log(`📍 Fixtures: http://localhost:${PORT}/api/fixtures/week`);
    console.log('========================================');
    console.log(`🔑 API Key: ${API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`📡 Data Source: API-Football (ALL matches worldwide)`);
    console.log(`📅 Fetching: All leagues, all countries`);
    console.log('========================================\n');
});
