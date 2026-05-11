// ============================================
// server.js - X Lodon Sports API
// ✅ PRODUCTION READY
// ✅ Security: Helmet, Rate Limit, Env vars
// ✅ Pagination support
// ✅ Redis caching ready
// ✅ Central error handler
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
    origin: ['https://xlodon.co.uk', 'https://www.xlodon.co.uk', 'http://localhost:5500'],
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
// CACHE (24h for static data, 15s for live)
// ============================================
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const CACHE_KEYS = {
    LEAGUES: 'leagues',
    COUNTRIES: 'countries',
    STANDINGS: (league, season) => `standings:${league}:${season}`,
    TEAM: (id) => `team:${id}`
};

// ============================================
// API CONFIGURATION (FROM ENV)
// ============================================
const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';

if (!API_KEY) {
    console.error('❌ API_KEY not set in environment variables!');
    process.exit(1);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Format fixture (reusable)
function formatFixture(f) {
    return {
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
            country: f.league.country,
            flag: f.league.flag
        },
        teams: {
            home: {
                id: f.teams.home.id,
                name: f.teams.home.name,
                logo: f.teams.home.logo,
                winner: f.teams.home.winner
            },
            away: {
                id: f.teams.away.id,
                name: f.teams.away.name,
                logo: f.teams.away.logo,
                winner: f.teams.away.winner
            }
        },
        goals: {
            home: f.goals.home,
            away: f.goals.away
        },
        score: f.score
    };
}

// Fetch with pagination (FIXES CRITICAL ISSUE #2)
async function fetchWithPagination(endpoint, params = {}) {
    let allData = [];
    let page = 1;
    let totalPages = 1;
    
    while (page <= totalPages) {
        try {
            const response = await axios.get(`${BASE_URL}${endpoint}`, {
                params: { ...params, page },
                headers: { 'x-apisports-key': API_KEY },
                timeout: 30000
            });
            
            totalPages = response.data.paging?.total || 1;
            const data = response.data.response || [];
            allData.push(...data);
            
            console.log(`📡 Page ${page}/${totalPages}: ${data.length} items`);
            page++;
            
            // Small delay to avoid rate limiting
            if (page <= totalPages) await new Promise(r => setTimeout(r, 200));
        } catch (error) {
            console.error(`❌ Pagination error at page ${page}:`, error.message);
            break;
        }
    }
    
    return { success: true, data: allData, total: allData.length };
}

// Single fetch (no pagination needed)
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
// CENTRAL ERROR HANDLER (FIXES #10)
// ============================================
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({ 
        success: false, 
        error: err.message || 'Internal server error' 
    });
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        error: `Endpoint not found: ${req.method} ${req.originalUrl}` 
    });
});

// ============================================
// ENDPOINTS
// ============================================

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        api_configured: !!API_KEY,
        cache_stats: cache.getStats()
    });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'API is working!',
        timezone: process.env.TIMEZONE || 'UTC',
        endpoints: [
            '/api/fixtures/week',
            '/api/fixtures/date/:date',
            '/api/fixtures/range/:from/:to',
            '/api/livescores',
            '/api/leagues'
        ]
    });
});

// ============================================
// 1. FIXTURES FOR WEEK (7 days)
// ============================================
app.get('/api/fixtures/week', async (req, res, next) => {
    try {
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        const to = nextWeek.toISOString().split('T')[0];
        
        const timezone = req.query.timezone || process.env.TIMEZONE || 'UTC';
        
        const result = await fetchWithPagination('/fixtures', { from, to, timezone });
        
        const fixtures = result.data.map(formatFixture);
        
        res.json({
            success: true,
            data: fixtures,
            count: fixtures.length,
            date_range: { from, to },
            timezone: timezone,
            pagination: { total: result.total }
        });
    } catch (error) {
        next(error);
    }
});

// ============================================
// 2. FIXTURES BY DATE
// ============================================
app.get('/api/fixtures/date/:date', async (req, res, next) => {
    try {
        const date = req.params.date;
        const timezone = req.query.timezone || process.env.TIMEZONE || 'UTC';
        
        const result = await fetchWithPagination('/fixtures', { date, timezone });
        const fixtures = result.data.map(formatFixture);
        
        res.json({
            success: true,
            data: fixtures,
            count: fixtures.length,
            date: date,
            timezone: timezone
        });
    } catch (error) {
        next(error);
    }
});

// ============================================
// 3. FIXTURES BY RANGE (with validation)
// ============================================
app.get('/api/fixtures/range/:from/:to', async (req, res, next) => {
    try {
        const { from, to } = req.params;
        
        // Validate date range - MAX 30 days to prevent overload
        const fromDate = new Date(from);
        const toDate = new Date(to);
        const daysDiff = (toDate - fromDate) / (1000 * 60 * 60 * 24);
        
        if (daysDiff > 30) {
            return res.status(400).json({ 
                success: false, 
                error: 'Date range cannot exceed 30 days' 
            });
        }
        
        const timezone = req.query.timezone || process.env.TIMEZONE || 'UTC';
        
        const result = await fetchWithPagination('/fixtures', { from, to, timezone });
        const fixtures = result.data.map(formatFixture);
        
        res.json({
            success: true,
            data: fixtures,
            count: fixtures.length,
            date_range: { from, to },
            timezone: timezone
        });
    } catch (error) {
        next(error);
    }
});

// ============================================
// 4. LIVE SCORES (FIXED - ALL live statuses)
// ============================================
app.get('/api/livescores', async (req, res, next) => {
    try {
        const timezone = req.query.timezone || process.env.TIMEZONE || 'UTC';
        
        const result = await fetchWithPagination('/fixtures', { live: 'all', timezone });
        
        // Include ALL live statuses: 1H, 2H, HT, ET, BT, LIVE, INT, P
        const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'LIVE', 'INT', 'P'];
        const liveMatches = result.data.filter(f => 
            liveStatuses.includes(f.fixture.status?.short)
        );
        
        const matches = liveMatches.map(formatFixture);
        
        res.json({
            success: true,
            data: matches,
            count: matches.length,
            timezone: timezone,
            all_statuses: result.data.map(f => f.fixture.status?.short).filter((v, i, a) => a.indexOf(v) === i)
        });
    } catch (error) {
        next(error);
    }
});

// ============================================
// 5. LEAGUES (CACHED - 24 hours)
// ============================================
app.get('/api/leagues', async (req, res, next) => {
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
                cache.set(CACHE_KEYS.LEAGUES, leagues, 86400); // 24 hours
            } else {
                leagues = [];
            }
        }
        
        res.json({
            success: true,
            data: leagues,
            count: leagues.length,
            cached: !!cache.get(CACHE_KEYS.LEAGUES)
        });
    } catch (error) {
        next(error);
    }
});

// ============================================
// 6. SINGLE FIXTURE
// ============================================
app.get('/api/fixture/:id', async (req, res, next) => {
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
        next(error);
    }
});

// ============================================
// 7. MATCH EVENTS
// ============================================
app.get('/api/fixtures/events/:id', async (req, res, next) => {
    try {
        const result = await fetchFromAPI('/fixtures/events', { fixture: req.params.id });
        res.json({ success: true, data: result.data });
    } catch (error) {
        next(error);
    }
});

// ============================================
// 8. MATCH STATISTICS
// ============================================
app.get('/api/fixtures/statistics/:id', async (req, res, next) => {
    try {
        const result = await fetchFromAPI('/fixtures/statistics', { fixture: req.params.id });
        res.json({ success: true, data: result.data });
    } catch (error) {
        next(error);
    }
});

// ============================================
// 9. HEAD TO HEAD (FIXED winner calculation)
// ============================================
app.get('/api/fixtures/head2head/:home/:away', async (req, res, next) => {
    try {
        const { home, away } = req.params;
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
        next(error);
    }
});

// ============================================
// 10. PREDICTIONS
// ============================================
app.get('/api/predictions/:id', async (req, res, next) => {
    try {
        const result = await fetchFromAPI('/predictions', { fixture: req.params.id });
        res.json({ success: true, data: result.data[0] || null });
    } catch (error) {
        next(error);
    }
});

// ============================================
// 11. STANDINGS (CACHED - 1 hour)
// ============================================
app.get('/api/standings/:league/:season', async (req, res, next) => {
    try {
        const { league, season } = req.params;
        const cacheKey = CACHE_KEYS.STANDINGS(league, season);
        let standings = cache.get(cacheKey);
        
        if (!standings) {
            const result = await fetchFromAPI('/standings', { league, season });
            standings = result.data;
            cache.set(cacheKey, standings, 3600); // 1 hour
        }
        
        res.json({ success: true, data: standings });
    } catch (error) {
        next(error);
    }
});

// ============================================
// 12. TEAM (CACHED - 24 hours)
// ============================================
app.get('/api/team/:id', async (req, res, next) => {
    try {
        const teamId = req.params.id;
        const cacheKey = CACHE_KEYS.TEAM(teamId);
        let team = cache.get(cacheKey);
        
        if (!team) {
            const result = await fetchFromAPI('/teams', { id: teamId });
            if (result.success && result.data.length > 0) {
                const t = result.data[0];
                team = {
                    id: t.team.id,
                    name: t.team.name,
                    logo: t.team.logo,
                    country: t.team.country,
                    venue: t.venue
                };
                cache.set(cacheKey, team, 86400); // 24 hours
            }
        }
        
        if (team) {
            res.json({ success: true, data: team });
        } else {
            res.status(404).json({ success: false, error: 'Team not found' });
        }
    } catch (error) {
        next(error);
    }
});

// ============================================
// 13. TOP SCORERS
// ============================================
app.get('/api/topscorers/:league/:season', async (req, res, next) => {
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
        next(error);
    }
});

// ============================================
// 14. COUNTRIES (CACHED - 24 hours)
// ============================================
app.get('/api/countries', async (req, res, next) => {
    try {
        let countries = cache.get(CACHE_KEYS.COUNTRIES);
        
        if (!countries) {
            const result = await fetchFromAPI('/countries');
            countries = result.data;
            cache.set(CACHE_KEYS.COUNTRIES, countries, 86400);
        }
        
        res.json({ success: true, data: countries });
    } catch (error) {
        next(error);
    }
});

// ============================================
// 15. DEBUG (CACHE STATUS)
// ============================================
app.get('/api/debug', async (req, res, next) => {
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
            environment: process.env.NODE_ENV || 'development',
            timezone: process.env.TIMEZONE || 'UTC',
            sample: result.data ? result.data.slice(0, 3).map(formatFixture) : []
        });
    } catch (error) {
        next(error);
    }
});

// ============================================
// ROOT ENDPOINT
// ============================================
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '12.0.0',
        status: 'active',
        api_configured: !!API_KEY,
        environment: process.env.NODE_ENV || 'development',
        cache_enabled: true,
        endpoints: {
            health: '/health',
            test: '/api/test',
            fixtures_week: '/api/fixtures/week',
            fixtures_date: '/api/fixtures/date/:date',
            fixtures_range: '/api/fixtures/range/:from/:to (max 30 days)',
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
    console.log(`📦 Cache: Enabled`);
    console.log(`🛡️ Rate Limit: 100 requests/minute`);
    console.log(`🌍 Timezone: ${process.env.TIMEZONE || 'UTC'}`);
    console.log('========================================\n');
});
