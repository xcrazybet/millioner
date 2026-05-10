// ============================================
// server.js - X Lodon Sports API
// ✅ Complete API with all endpoints
// ✅ Real data from API-Football
// ✅ Auto-updates daily
// ✅ No mock data - only real matches
// ============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// API-Football configuration
const API_KEY = '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';

// Trust proxy (for Render)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
    origin: ['https://xlodon.co.uk', 'https://www.xlodon.co.uk', 'http://localhost:5500', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request timeout middleware
app.use((req, res, next) => {
    req.setTimeout(30000, () => {
        res.status(408).json({ success: false, error: 'Request timeout' });
    });
    res.setTimeout(30000, () => {
        res.status(408).json({ success: false, error: 'Response timeout' });
    });
    next();
});

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function fetchFromAPI(endpoint, params = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await axios.get(`${BASE_URL}${endpoint}`, {
                params: params,
                headers: {
                    'x-apisports-key': API_KEY
                },
                timeout: 15000
            });
            
            return {
                success: true,
                data: response.data.response,
                rateLimit: {
                    remaining: response.headers['x-ratelimit-requests-remaining'],
                    reset: response.headers['x-ratelimit-reset']
                }
            };
        } catch (error) {
            console.error(`API Error (attempt ${i + 1}/${retries + 1}):`, error.response?.data?.message || error.message);
            if (i === retries) {
                return { success: false, data: [], error: error.response?.data?.message || error.message };
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
    return { success: false, data: [], error: 'Max retries exceeded' };
}

function formatFixture(fixture) {
    return {
        fixture: {
            id: fixture.fixture.id,
            date: fixture.fixture.date,
            status: fixture.fixture.status,
            venue: fixture.fixture.venue,
            timezone: fixture.fixture.timezone
        },
        league: {
            id: fixture.league.id,
            name: fixture.league.name,
            logo: fixture.league.logo,
            country: fixture.league.country,
            flag: fixture.league.flag,
            season: fixture.league.season,
            round: fixture.league.round
        },
        teams: {
            home: {
                id: fixture.teams.home.id,
                name: fixture.teams.home.name,
                logo: fixture.teams.home.logo,
                winner: fixture.teams.home.winner
            },
            away: {
                id: fixture.teams.away.id,
                name: fixture.teams.away.name,
                logo: fixture.teams.away.logo,
                winner: fixture.teams.away.winner
            }
        },
        goals: {
            home: fixture.goals.home,
            away: fixture.goals.away
        },
        score: fixture.score
    };
}

// ============================================
// HEALTH & INFO ENDPOINTS
// ============================================

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        api_configured: !!API_KEY
    });
});

app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API is working!',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            fixtures_week: '/api/fixtures/week',
            fixtures_today: '/api/fixtures/today',
            fixtures_upcoming: '/api/fixtures/upcoming/:days',
            fixtures_range: '/api/fixtures/range/:from/:to',
            fixtures_between: '/api/fixture/between/:from/:to',
            fixture_detail: '/api/fixture/:id',
            livescores: '/api/livescores',
            leagues: '/api/leagues',
            events: '/api/fixtures/events/:id',
            statistics: '/api/fixtures/statistics/:id',
            head2head: '/api/fixtures/head2head/:home/:away',
            predictions: '/api/predictions/:id',
            team: '/api/team/:id'
        }
    });
});

// ============================================
// FIXTURES ENDPOINTS
// ============================================

// 1. Get fixtures for today + next 7 days
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
            const fixtures = result.data.map(formatFixture);
            
            const groupedByDate = {};
            fixtures.forEach(f => {
                const date = new Date(f.fixture.date).toDateString();
                if (!groupedByDate[date]) groupedByDate[date] = [];
                groupedByDate[date].push(f);
            });
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                grouped_by_date: groupedByDate,
                date_range: { from, to },
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                success: true,
                data: [],
                count: 0,
                date_range: { from, to },
                message: result.error || 'No fixtures found for this period',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Get fixtures for today only
app.get('/api/fixtures/today', async (req, res) => {
    try {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        console.log(`📅 Fetching today's fixtures: ${todayStr}`);
        
        const result = await fetchFromAPI('/fixtures', { date: todayStr });
        
        if (result.success && result.data.length > 0) {
            const fixtures = result.data.map(formatFixture);
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date: todayStr,
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                success: true,
                data: [],
                count: 0,
                date: todayStr,
                message: 'No fixtures today',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Get upcoming matches for X days (30, 60, 90, etc.)
app.get('/api/fixtures/upcoming/:days', async (req, res) => {
    try {
        const days = parseInt(req.params.days) || 30;
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + days);
        const to = futureDate.toISOString().split('T')[0];
        
        console.log(`📅 Fetching upcoming ${days} days: ${from} to ${to}`);
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data.length > 0) {
            const fixtures = result.data.map(formatFixture);
            
            // Group by month
            const groupedByMonth = {};
            fixtures.forEach(f => {
                const month = new Date(f.fixture.date).toLocaleString('default', { month: 'long', year: 'numeric' });
                if (!groupedByMonth[month]) groupedByMonth[month] = [];
                groupedByMonth[month].push(f);
            });
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date_range: { from, to, days: days },
                grouped_by_month: groupedByMonth,
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                success: true,
                data: [],
                count: 0,
                date_range: { from, to, days: days },
                message: `No upcoming matches in the next ${days} days`,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Get fixtures for a specific date range
app.get('/api/fixtures/range/:from/:to', async (req, res) => {
    try {
        const { from, to } = req.params;
        
        console.log(`📅 Fetching fixtures from ${from} to ${to}`);
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data.length > 0) {
            const fixtures = result.data.map(formatFixture);
            
            // Group by month
            const groupedByMonth = {};
            fixtures.forEach(f => {
                const month = new Date(f.fixture.date).toLocaleString('default', { month: 'long', year: 'numeric' });
                if (!groupedByMonth[month]) groupedByMonth[month] = [];
                groupedByMonth[month].push(f);
            });
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date_range: { from, to },
                grouped_by_month: groupedByMonth,
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                success: true,
                data: [],
                count: 0,
                date_range: { from, to },
                message: `No fixtures found from ${from} to ${to}`,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. Get fixtures between two dates (alias for range)
app.get('/api/fixture/between/:from/:to', async (req, res) => {
    try {
        const { from, to } = req.params;
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data.length > 0) {
            const fixtures = result.data.map(formatFixture);
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date_range: { from, to },
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                success: true,
                data: [],
                count: 0,
                date_range: { from, to },
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 6. Get fixtures for a specific date
app.get('/api/fixture/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
        const result = await fetchFromAPI('/fixtures', { date });
        
        if (result.success && result.data.length > 0) {
            const fixtures = result.data.map(formatFixture);
            
            const groupedByLeague = {};
            fixtures.forEach(f => {
                const leagueName = f.league.name;
                if (!groupedByLeague[leagueName]) groupedByLeague[leagueName] = [];
                groupedByLeague[leagueName].push(f);
            });
            
            res.json({
                success: true,
                data: fixtures,
                grouped_by_league: groupedByLeague,
                count: fixtures.length,
                date: date,
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                success: true,
                data: [],
                count: 0,
                date: date,
                message: 'No fixtures for this date',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7. Get single fixture details
app.get('/api/fixture/:id', async (req, res) => {
    try {
        const fixtureId = req.params.id;
        const [fixtureRes, eventsRes, statsRes, oddsRes] = await Promise.all([
            fetchFromAPI('/fixtures', { id: fixtureId }),
            fetchFromAPI('/fixtures/events', { fixture: fixtureId }),
            fetchFromAPI('/fixtures/statistics', { fixture: fixtureId }),
            fetchFromAPI('/odds', { fixture: fixtureId })
        ]);
        
        res.json({
            success: true,
            fixture: fixtureRes.data[0] ? formatFixture(fixtureRes.data[0]) : null,
            events: eventsRes.data,
            statistics: statsRes.data,
            odds: oddsRes.data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// LIVE SCORES
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
            
            const matches = liveMatches.map(formatFixture);
            
            console.log(`🔴 Found ${matches.length} live matches`);
            
            res.json({
                success: true,
                data: matches,
                count: matches.length,
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// LEAGUES
// ============================================
app.get('/api/leagues', async (req, res) => {
    try {
        const popularLeagues = [39, 140, 78, 135, 61, 2, 3, 88, 94, 128, 253, 307];
        const result = await fetchFromAPI('/leagues');
        
        if (result.success && result.data.length > 0) {
            const filtered = result.data.filter(l => popularLeagues.includes(l.league.id));
            const leagues = filtered.map(l => ({
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
                count: leagues.length,
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// MATCH EVENTS
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
// MATCH STATISTICS
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
// HEAD TO HEAD
// ============================================
app.get('/api/fixtures/head2head/:home/:away', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures/headtohead', {
            h2h: `${req.params.home}-${req.params.away}`
        });
        
        if (result.success && result.data.length > 0) {
            const matches = result.data.map(formatFixture);
            const totalMatches = matches.length;
            const homeWins = matches.filter(m => m.teams.home.winner === true).length;
            const awayWins = matches.filter(m => m.teams.away.winner === true).length;
            const draws = totalMatches - homeWins - awayWins;
            
            res.json({
                success: true,
                data: matches,
                stats: {
                    total_matches: totalMatches,
                    home_wins: homeWins,
                    away_wins: awayWins,
                    draws: draws,
                    home_win_rate: ((homeWins / totalMatches) * 100).toFixed(1),
                    away_win_rate: ((awayWins / totalMatches) * 100).toFixed(1),
                    draw_rate: ((draws / totalMatches) * 100).toFixed(1)
                },
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({ success: true, data: [], stats: null });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// PREDICTIONS
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
// TEAM DETAILS
// ============================================
app.get('/api/team/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/teams', { id: req.params.id });
        res.json({ success: true, data: result.data[0] || null });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROOT ENDPOINT
// ============================================
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '8.0.0',
        status: 'active',
        environment: process.env.NODE_ENV || 'development',
        api_key_configured: !!API_KEY,
        endpoints: {
            health: '/health',
            test: '/api/test',
            fixtures_week: '/api/fixtures/week',
            fixtures_today: '/api/fixtures/today',
            fixtures_upcoming: '/api/fixtures/upcoming/:days',
            fixtures_range: '/api/fixtures/range/:from/:to',
            fixtures_between: '/api/fixture/between/:from/:to',
            fixtures_date: '/api/fixture/date/:date',
            fixture_details: '/api/fixture/:id',
            livescores: '/api/livescores',
            leagues: '/api/leagues',
            events: '/api/fixtures/events/:id',
            statistics: '/api/fixtures/statistics/:id',
            head2head: '/api/fixtures/head2head/:home/:away',
            predictions: '/api/predictions/:id',
            team: '/api/team/:id'
        },
        timestamp: new Date().toISOString()
    });
});

// ============================================
// 404 HANDLER
// ============================================
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
        available_endpoints: [
            'GET /',
            'GET /health',
            'GET /api/test',
            'GET /api/fixtures/week',
            'GET /api/fixtures/today',
            'GET /api/fixtures/upcoming/:days',
            'GET /api/fixtures/range/:from/:to',
            'GET /api/fixture/between/:from/:to',
            'GET /api/fixture/date/:date',
            'GET /api/fixture/:id',
            'GET /api/livescores',
            'GET /api/leagues',
            'GET /api/fixtures/events/:id',
            'GET /api/fixtures/statistics/:id',
            'GET /api/fixtures/head2head/:home/:away',
            'GET /api/predictions/:id',
            'GET /api/team/:id'
        ]
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 X Lodon Sports API Server');
    console.log(`📍 Port: ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    console.log(`📍 Test: http://localhost:${PORT}/api/test`);
    console.log(`📍 Fixtures: http://localhost:${PORT}/api/fixtures/week`);
    console.log('========================================');
    console.log(`🔑 API Key: ${API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`📡 Data Source: API-Football (Real Data Only)`);
    console.log(`📅 Endpoints available: 15+`);
    console.log('========================================\n');
});
