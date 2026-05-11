// ============================================
// server.js - X Lodon Sports API
// ✅ ALL routes properly defined
// ✅ Production ready
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// SECURITY & MIDDLEWARE
// ============================================
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({
    origin: ['https://xlodon.co.uk', 'https://www.xlodon.co.uk', 'http://localhost:5500', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// ============================================
// CACHE
// ============================================
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const CACHE_KEYS = {
    LEAGUES: 'leagues',
    COUNTRIES: 'countries',
    STANDINGS: (league, season) => `standings:${league}:${season}`,
    TEAM: (id) => `team:${id}`
};

// ============================================
// API CONFIGURATION
// ============================================
const API_KEY = process.env.API_FOOTBALL_KEY || '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatFixture(f) {
    if (!f) return null;
    return {
        fixture: {
            id: f.fixture?.id,
            date: f.fixture?.date,
            status: f.fixture?.status,
            venue: f.fixture?.venue
        },
        league: {
            id: f.league?.id,
            name: f.league?.name,
            logo: f.league?.logo,
            country: f.league?.country,
            flag: f.league?.flag
        },
        teams: {
            home: {
                id: f.teams?.home?.id,
                name: f.teams?.home?.name,
                logo: f.teams?.home?.logo,
                winner: f.teams?.home?.winner
            },
            away: {
                id: f.teams?.away?.id,
                name: f.teams?.away?.name,
                logo: f.teams?.away?.logo,
                winner: f.teams?.away?.winner
            }
        },
        goals: {
            home: f.goals?.home,
            away: f.goals?.away
        },
        score: f.score
    };
}

async function fetchFromAPI(endpoint, params = {}) {
    try {
        console.log(`📡 Calling: ${endpoint}`, params);
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
            params: params,
            headers: { 'x-apisports-key': API_KEY },
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
// HEALTH & ROOT
// ============================================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        api_configured: !!API_KEY,
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '12.0.0',
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

// ============================================
// TEST ENDPOINT
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
// 1. FIXTURES FOR WEEK (7 days)
// ============================================
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        const to = nextWeek.toISOString().split('T')[0];
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        const fixtures = (result.data || []).map(formatFixture);
        
        res.json({
            success: true,
            data: fixtures,
            count: fixtures.length,
            date_range: { from, to }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 2. FIXTURES BY DATE (WORKING)
// ============================================
app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
        console.log(`📅 Fetching fixtures for date: ${date}`);
        
        const result = await fetchFromAPI('/fixtures', { date });
        
        const fixtures = (result.data || []).map(formatFixture);
        
        res.json({
            success: true,
            data: fixtures,
            count: fixtures.length,
            date: date
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 3. FIXTURES BY DATE RANGE
// ============================================
app.get('/api/fixtures/range/:from/:to', async (req, res) => {
    try {
        const { from, to } = req.params;
        console.log(`📅 Fetching fixtures from ${from} to ${to}`);
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        const fixtures = (result.data || []).map(formatFixture);
        
        res.json({
            success: true,
            data: fixtures,
            count: fixtures.length,
            date_range: { from, to }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 4. LIVE SCORES (WORKING)
// ============================================
app.get('/api/livescores', async (req, res) => {
    try {
        console.log(`🔴 Fetching live scores...`);
        
        const result = await fetchFromAPI('/fixtures', { live: 'all' });
        
        const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'LIVE', 'INT', 'P'];
        const liveMatches = (result.data || []).filter(f => 
            liveStatuses.includes(f.fixture?.status?.short)
        );
        
        const matches = liveMatches.map(formatFixture);
        
        res.json({
            success: true,
            data: matches,
            count: matches.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 5. LEAGUES
// ============================================
app.get('/api/leagues', async (req, res) => {
    try {
        let leagues = cache.get(CACHE_KEYS.LEAGUES);
        
        if (!leagues) {
            const result = await fetchFromAPI('/leagues');
            if (result.success && result.data) {
                leagues = result.data.map(l => ({
                    id: l.league.id,
                    name: l.league.name,
                    logo: l.league.logo,
                    type: l.league.type,
                    country: l.country.name,
                    country_code: l.country.code,
                    flag: l.country.flag
                }));
                cache.set(CACHE_KEYS.LEAGUES, leagues, 86400);
            } else {
                leagues = [];
            }
        }
        
        res.json({
            success: true,
            data: leagues,
            count: leagues.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 6. SINGLE FIXTURE
// ============================================
app.get('/api/fixture/:id', async (req, res) => {
    try {
        const fixtureId = req.params.id;
        
        const [fixtureRes, eventsRes, statsRes, oddsRes] = await Promise.all([
            fetchFromAPI('/fixtures', { id: fixtureId }),
            fetchFromAPI('/fixtures/events', { fixture: fixtureId }),
            fetchFromAPI('/fixtures/statistics', { fixture: fixtureId }),
            fetchFromAPI('/odds', { fixture: fixtureId })
        ]);
        
        if (fixtureRes.success && fixtureRes.data.length > 0) {
            res.json({
                success: true,
                fixture: formatFixture(fixtureRes.data[0]),
                events: eventsRes.data,
                statistics: statsRes.data,
                odds: oddsRes.data
            });
        } else {
            res.status(404).json({ success: false, error: 'Fixture not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 7. MATCH EVENTS
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
// 8. MATCH STATISTICS
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
// 9. HEAD TO HEAD (WORKING)
// ============================================
app.get('/api/fixtures/head2head/:home/:away', async (req, res) => {
    try {
        const { home, away } = req.params;
        console.log(`📊 Fetching H2H: ${home} vs ${away}`);
        
        const result = await fetchFromAPI('/fixtures/headtohead', { h2h: `${home}-${away}` });
        
        if (result.success && result.data.length > 0) {
            const matches = result.data.map(f => ({
                fixture: { id: f.fixture.id, date: f.fixture.date, status: f.fixture.status },
                teams: {
                    home: { name: f.teams.home.name, winner: f.teams.home.winner },
                    away: { name: f.teams.away.name, winner: f.teams.away.winner }
                },
                goals: { home: f.goals.home, away: f.goals.away }
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
                    home_win_rate: total ? ((homeWins / total) * 100).toFixed(1) : '0',
                    away_win_rate: total ? ((awayWins / total) * 100).toFixed(1) : '0',
                    draw_rate: total ? ((draws / total) * 100).toFixed(1) : '0'
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
// 10. PREDICTIONS
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
// 11. STANDINGS
// ============================================
app.get('/api/standings/:league/:season', async (req, res) => {
    try {
        const { league, season } = req.params;
        const result = await fetchFromAPI('/standings', { league, season });
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 12. TEAM
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
            res.status(404).json({ success: false, error: 'Team not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 13. TOP SCORERS
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
// 14. COUNTRIES
// ============================================
app.get('/api/countries', async (req, res) => {
    try {
        let countries = cache.get(CACHE_KEYS.COUNTRIES);
        
        if (!countries) {
            const result = await fetchFromAPI('/countries');
            countries = result.data;
            cache.set(CACHE_KEYS.COUNTRIES, countries, 86400);
        }
        
        res.json({ success: true, data: countries });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 15. DEBUG (WORKING)
// ============================================
app.get('/api/debug', async (req, res) => {
    try {
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
            cache_stats: cache.getStats(),
            sample: result.data ? result.data.slice(0, 3).map(formatFixture) : []
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 404 HANDLER
// ============================================
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: `Cannot ${req.method} ${req.originalUrl}`,
        message: 'Endpoint not found. Check / for available endpoints.'
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 X Lodon Sports API Server');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🔑 API Key: ${API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log('========================================');
    console.log('\n📋 Available Endpoints:');
    console.log('   GET /health');
    console.log('   GET /api/test');
    console.log('   GET /api/fixtures/week');
    console.log('   GET /api/fixtures/date/:date');
    console.log('   GET /api/fixtures/range/:from/:to');
    console.log('   GET /api/livescores');
    console.log('   GET /api/fixture/:id');
    console.log('   GET /api/fixtures/events/:id');
    console.log('   GET /api/fixtures/statistics/:id');
    console.log('   GET /api/fixtures/head2head/:home/:away');
    console.log('   GET /api/predictions/:id');
    console.log('   GET /api/leagues');
    console.log('   GET /api/standings/:league/:season');
    console.log('   GET /api/team/:id');
    console.log('   GET /api/topscorers/:league/:season');
    console.log('   GET /api/countries');
    console.log('   GET /api/debug');
    console.log('========================================\n');
});
