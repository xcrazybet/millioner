// ============================================
// server.js - X Lodon Sports API
// ✅ OPEN date range - always fetches real data
// ✅ Today + next 7 days dynamically
// ✅ Returns whatever matches exist
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

// ============================================
// HELPER FUNCTIONS
// ============================================

async function fetchFromAPI(endpoint, params = {}) {
    try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
            params: params,
            headers: {
                'x-apisports-key': API_KEY
            },
            timeout: 15000
        });
        return { success: true, data: response.data.response };
    } catch (error) {
        console.error(`API Error:`, error.response?.data?.message || error.message);
        return { success: false, data: [], error: error.message };
    }
}

// ============================================
// ENDPOINTS
// ============================================

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== GET FIXTURES FOR TODAY + NEXT 7 DAYS (OPEN RANGE) =====
app.get('/api/fixtures/week', async (req, res) => {
    try {
        // OPEN DATE RANGE - always today to next 7 days
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        const to = nextWeek.toISOString().split('T')[0];
        
        console.log(`📅 Fetching fixtures from ${from} to ${to}`);
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data.length > 0) {
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
                },
                score: f.score
            }));
            
            // Group by date for easy display
            const groupedByDate = {};
            fixtures.forEach(f => {
                const date = new Date(f.fixture.date).toDateString();
                if (!groupedByDate[date]) groupedByDate[date] = [];
                groupedByDate[date].push(f);
            });
            
            console.log(`✅ Found ${fixtures.length} fixtures for the period`);
            console.log(`📅 Dates with matches: ${Object.keys(groupedByDate).join(', ')}`);
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                grouped_by_date: groupedByDate,
                date_range: { from, to },
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`⚠️ No fixtures found for period ${from} to ${to}`);
            res.json({
                success: true,
                data: [],
                count: 0,
                date_range: { from, to },
                message: `No matches scheduled from ${from} to ${to}`,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== GET LIVE SCORES =====
app.get('/api/livescores', async (req, res) => {
    try {
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
                    status: f.fixture.status
                },
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo
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
            
            console.log(`🔴 Found ${matches.length} live matches`);
            res.json({ success: true, data: matches, count: matches.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.json({ success: false, data: [], error: error.message });
    }
});

// ===== GET FIXTURES FOR SPECIFIC DATE =====
app.get('/api/fixture/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
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
                    logo: f.league.logo
                },
                teams: {
                    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
                    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo }
                },
                goals: { home: f.goals.home, away: f.goals.away }
            }));
            
            res.json({ success: true, data: fixtures, count: fixtures.length, date: date });
        } else {
            res.json({ success: true, data: [], count: 0, date: date });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ===== GET SINGLE FIXTURE DETAILS =====
app.get('/api/fixture/:id', async (req, res) => {
    try {
        const fixtureId = req.params.id;
        const [fixtureRes, eventsRes, statsRes] = await Promise.all([
            fetchFromAPI('/fixtures', { id: fixtureId }),
            fetchFromAPI('/fixtures/events', { fixture: fixtureId }),
            fetchFromAPI('/fixtures/statistics', { fixture: fixtureId })
        ]);
        
        res.json({
            success: true,
            fixture: fixtureRes.data[0] || null,
            events: eventsRes.data || [],
            statistics: statsRes.data || []
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ===== GET MATCH EVENTS =====
app.get('/api/fixtures/events/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures/events', { fixture: req.params.id });
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.json({ success: false, data: [], error: error.message });
    }
});

// ===== GET LEAGUES =====
app.get('/api/leagues', async (req, res) => {
    try {
        const result = await fetchFromAPI('/leagues');
        
        if (result.success && result.data.length > 0) {
            const leagues = result.data.slice(0, 50).map(l => ({
                id: l.league.id,
                name: l.league.name,
                logo: l.league.logo,
                country: l.country.name
            }));
            res.json({ success: true, data: leagues, count: leagues.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ===== PREDICTIONS =====
app.get('/api/predictions/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/predictions', { fixture: req.params.id });
        res.json({ success: true, data: result.data[0] || null });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ===== HEAD TO HEAD =====
app.get('/api/fixtures/head2head/:home/:away', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures/headtohead', { 
            h2h: `${req.params.home}-${req.params.away}` 
        });
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ===== ROOT =====
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '8.0.0',
        status: 'active',
        api_key_configured: !!API_KEY,
        endpoints: {
            health: '/health',
            fixtures_week: '/api/fixtures/week',
            livescores: '/api/livescores',
            fixtures_date: '/api/fixture/date/:date',
            fixture: '/api/fixture/:id',
            events: '/api/fixtures/events/:id',
            leagues: '/api/leagues',
            predictions: '/api/predictions/:id',
            head2head: '/api/fixtures/head2head/:home/:away'
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
    console.log(`📡 Data Source: API-Football (Real Data Only)`);
    console.log(`📅 Date Range: Today + Next 7 Days (Auto-updates daily)`);
    console.log('========================================\n');
});
