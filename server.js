// ============================================
// server.js - X Lodon Sports API v7.0
// ✅ PRODUCTION READY
// ✅ Caching System (60s TTL)
// ✅ Rate Limiting (100 req/min)
// ✅ Input Validation
// ✅ 15+ New Endpoints
// ✅ Render Deployment Ready
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================
// CONFIGURATION
// ============================================
const API_KEY = process.env.API_FOOTBALL_KEY || '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';
const CACHE_TTL = 60 * 1000; // 60 seconds
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute

// ============================================
// CACHE SYSTEM
// ============================================
class Cache {
    constructor() {
        this.cache = new Map();
        this.stats = { hits: 0, misses: 0, sets: 0 };
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        if (Date.now() - entry.timestamp > CACHE_TTL) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }
        this.stats.hits++;
        return entry.data;
    }

    set(key, data) {
        this.cache.set(key, { data, timestamp: Date.now() });
        this.stats.sets++;
    }

    clear() {
        this.cache.clear();
        console.log('🗑️  Cache cleared');
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;
        return { ...this.stats, hitRate: `${hitRate}%`, size: this.cache.size };
    }
}

const cache = new Cache();

// ============================================
// RATE LIMITING
// ============================================
const requestCounts = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
    }

    let requests = requestCounts.get(ip);
    requests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);

    if (requests.length >= RATE_LIMIT_MAX) {
        return false;
    }

    requests.push(now);
    requestCounts.set(ip, requests);
    return true;
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Rate limiting middleware
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(ip)) {
        return res.status(429).json({
            success: false,
            message: 'Rate limit exceeded. Max 100 requests/minute',
            timestamp: new Date().toISOString()
        });
    }
    next();
});

// ============================================
// VALIDATION HELPERS
// ============================================
function validateDate(date) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    return regex.test(date);
}

function validateId(id) {
    return !isNaN(id) && parseInt(id) > 0;
}

function sendError(res, message, statusCode = 400) {
    res.status(statusCode).json({
        success: false,
        message,
        timestamp: new Date().toISOString()
    });
}

function sendSuccess(res, data, count = null) {
    res.json({
        success: true,
        data,
        ...(count !== null && { count }),
        timestamp: new Date().toISOString()
    });
}

// ============================================
// FETCH FROM API-FOOTBALL
// ============================================
async function fetchFromAPI(endpoint, params = {}) {
    const cacheKey = `${endpoint}:${JSON.stringify(params)}`;
    
    // Check cache first
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        console.log(`📦 Cache HIT for ${endpoint}`);
        return { success: true, data: cachedData, cached: true };
    }

    try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
            params,
            headers: { 'x-apisports-key': API_KEY }
        });
        
        const data = response.data.response || [];
        cache.set(cacheKey, data);
        console.log(`✅ ${endpoint} - ${data.length} results`);
        
        return { success: true, data, cached: false };
    } catch (error) {
        const message = error.response?.data?.message || error.message;
        console.error(`❌ API Error ${endpoint}: ${message}`);
        return { success: false, data: [], error: message };
    }
}

// ============================================
// HEALTH & STATUS ENDPOINTS
// ============================================

app.get('/health', (req, res) => {
    sendSuccess(res, {
        status: 'ok',
        api_configured: !!API_KEY,
        environment: NODE_ENV,
        version: '7.0.0'
    });
});

app.get('/', (req, res) => {
    sendSuccess(res, {
        name: 'X Lodon Sports API',
        version: '7.0.0',
        status: 'active',
        environment: NODE_ENV,
        endpoints: {
            health: '/health',
            cache: '/api/cache/stats',
            fixtures: {
                week: '/api/fixtures/week',
                today: '/api/fixtures/today',
                date: '/api/fixtures/date/:date',
                team: '/api/fixtures/team/:teamId',
                league: '/api/fixtures/league/:leagueId',
                live: '/api/livescores',
                details: '/api/fixture/:id'
            },
            leagues: {
                all: '/api/leagues',
                details: '/api/league/:id',
                standings: '/api/standings/league/:leagueId'
            },
            teams: {
                details: '/api/team/:id',
                byLeague: '/api/teams/league/:leagueId'
            },
            players: {
                details: '/api/player/:id',
                statistics: '/api/player/:id/statistics/:season'
            },
            other: {
                events: '/api/fixtures/events/:id',
                statistics: '/api/fixtures/statistics/:id',
                odds: '/api/odds/:fixtureId',
                head2head: '/api/fixtures/head2head/:home/:away',
                search: '/api/search/:query'
            }
        }
    });
});

// ============================================
// CACHE MANAGEMENT
// ============================================

app.get('/api/cache/stats', (req, res) => {
    sendSuccess(res, cache.getStats());
});

app.post('/api/cache/clear', (req, res) => {
    cache.clear();
    sendSuccess(res, { message: 'Cache cleared successfully' });
});

// ============================================
// FIXTURES ENDPOINTS
// ============================================

app.get('/api/fixtures/week', async (req, res) => {
    try {
        const today = new Date();
        const fromDate = new Date(today);
        fromDate.setHours(0, 0, 0, 0);
        
        const toDate = new Date(today);
        toDate.setDate(today.getDate() + 7);
        toDate.setHours(23, 59, 59, 999);
        
        const from = fromDate.toISOString().split('T')[0];
        const to = toDate.toISOString().split('T')[0];
        
        console.log(`📅 Fetching fixtures: ${from} to ${to}`);
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success) {
            const fixtures = result.data.map(f => ({
                id: f.fixture.id,
                date: f.fixture.date,
                status: f.fixture.status.long,
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo,
                    country: f.league.country
                },
                teams: {
                    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
                    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo }
                },
                goals: { home: f.goals.home, away: f.goals.away }
            }));
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date_range: { from, to },
                cached: result.cached,
                timestamp: new Date().toISOString()
            });
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

app.get('/api/fixtures/today', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const result = await fetchFromAPI('/fixtures', { date: today });
        
        if (result.success) {
            sendSuccess(res, result.data, result.data.length);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const { date } = req.params;
        
        if (!validateDate(date)) {
            return sendError(res, 'Invalid date format. Use YYYY-MM-DD', 400);
        }
        
        const result = await fetchFromAPI('/fixtures', { date });
        
        if (result.success) {
            sendSuccess(res, result.data, result.data.length);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

app.get('/api/fixtures/team/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;
        
        if (!validateId(teamId)) {
            return sendError(res, 'Invalid team ID', 400);
        }
        
        const result = await fetchFromAPI('/fixtures', { team: teamId });
        
        if (result.success) {
            sendSuccess(res, result.data, result.data.length);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

app.get('/api/fixtures/league/:leagueId', async (req, res) => {
    try {
        const { leagueId } = req.params;
        
        if (!validateId(leagueId)) {
            return sendError(res, 'Invalid league ID', 400);
        }
        
        const today = new Date().toISOString().split('T')[0];
        const result = await fetchFromAPI('/fixtures', { league: leagueId, date: today });
        
        if (result.success) {
            sendSuccess(res, result.data, result.data.length);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

app.get('/api/livescores', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures', { live: 'all' });
        
        if (result.success) {
            const liveMatches = result.data.filter(f => 
                ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(f.fixture.status.short)
            );
            
            console.log(`🔴 Live matches: ${liveMatches.length}`);
            sendSuccess(res, liveMatches, liveMatches.length);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

app.get('/api/fixture/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!validateId(id)) {
            return sendError(res, 'Invalid fixture ID', 400);
        }
        
        const [fixture, events, stats] = await Promise.all([
            fetchFromAPI('/fixtures', { id }),
            fetchFromAPI('/fixtures/events', { fixture: id }),
            fetchFromAPI('/fixtures/statistics', { fixture: id })
        ]);
        
        res.json({
            success: true,
            fixture: fixture.data[0] || null,
            events: events.data || [],
            statistics: stats.data || [],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

// ============================================
// MATCH DETAILS ENDPOINTS
// ============================================

app.get('/api/fixtures/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!validateId(id)) {
            return sendError(res, 'Invalid fixture ID', 400);
        }
        
        const result = await fetchFromAPI('/fixtures/events', { fixture: id });
        
        if (result.success) {
            sendSuccess(res, result.data, result.data.length);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

app.get('/api/fixtures/statistics/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!validateId(id)) {
            return sendError(res, 'Invalid fixture ID', 400);
        }
        
        const result = await fetchFromAPI('/fixtures/statistics', { fixture: id });
        
        if (result.success) {
            sendSuccess(res, result.data);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

app.get('/api/odds/:fixtureId', async (req, res) => {
    try {
        const { fixtureId } = req.params;
        
        if (!validateId(fixtureId)) {
            return sendError(res, 'Invalid fixture ID', 400);
        }
        
        const result = await fetchFromAPI('/odds', { fixture: fixtureId });
        
        if (result.success) {
            sendSuccess(res, result.data[0] || null);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

// ============================================
// LEAGUES ENDPOINTS
// ============================================

app.get('/api/leagues', async (req, res) => {
    try {
        const popularLeagueIds = [39, 140, 78, 135, 61, 2, 3, 88, 94, 128, 307, 848];
        const result = await fetchFromAPI('/leagues');
        
        if (result.success) {
            const leagues = result.data
                .filter(l => popularLeagueIds.includes(l.league.id))
                .map(l => ({
                    id: l.league.id,
                    name: l.league.name,
                    logo: l.league.logo,
                    country: l.country.name,
                    flag: l.country.flag,
                    season: l.seasons[0]?.year || 'N/A'
                }));
            
            sendSuccess(res, leagues, leagues.length);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

app.get('/api/league/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!validateId(id)) {
            return sendError(res, 'Invalid league ID', 400);
        }
        
        const result = await fetchFromAPI('/leagues', { id });
        
        if (result.success) {
            sendSuccess(res, result.data[0] || null);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

app.get('/api/standings/league/:leagueId', async (req, res) => {
    try {
        const { leagueId } = req.params;
        
        if (!validateId(leagueId)) {
            return sendError(res, 'Invalid league ID', 400);
        }
        
        const season = req.query.season || new Date().getFullYear();
        const result = await fetchFromAPI('/standings', { league: leagueId, season });
        
        if (result.success) {
            sendSuccess(res, result.data);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

// ============================================
// TEAMS ENDPOINTS
// ============================================

app.get('/api/team/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!validateId(id)) {
            return sendError(res, 'Invalid team ID', 400);
        }
        
        const result = await fetchFromAPI('/teams', { id });
        
        if (result.success) {
            sendSuccess(res, result.data[0] || null);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

app.get('/api/teams/league/:leagueId', async (req, res) => {
    try {
        const { leagueId } = req.params;
        
        if (!validateId(leagueId)) {
            return sendError(res, 'Invalid league ID', 400);
        }
        
        const season = req.query.season || new Date().getFullYear();
        const result = await fetchFromAPI('/teams', { league: leagueId, season });
        
        if (result.success) {
            const teams = result.data.map(t => ({
                id: t.team.id,
                name: t.team.name,
                logo: t.team.logo,
                country: t.team.country
            }));
            
            sendSuccess(res, teams, teams.length);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

// ============================================
// PLAYERS ENDPOINTS
// ============================================

app.get('/api/player/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!validateId(id)) {
            return sendError(res, 'Invalid player ID', 400);
        }
        
        const result = await fetchFromAPI('/players', { id });
        
        if (result.success) {
            sendSuccess(res, result.data[0] || null);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

app.get('/api/player/:id/statistics/:season', async (req, res) => {
    try {
        const { id, season } = req.params;
        
        if (!validateId(id) || !validateId(season)) {
            return sendError(res, 'Invalid player ID or season', 400);
        }
        
        const result = await fetchFromAPI('/players', { id, season });
        
        if (result.success) {
            sendSuccess(res, result.data);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

// ============================================
// HEAD TO HEAD
// ============================================

app.get('/api/fixtures/head2head/:home/:away', async (req, res) => {
    try {
        const { home, away } = req.params;
        
        if (!validateId(home) || !validateId(away)) {
            return sendError(res, 'Invalid team IDs', 400);
        }
        
        const result = await fetchFromAPI('/fixtures/headtohead', { h2h: `${home}-${away}` });
        
        if (result.success) {
            sendSuccess(res, result.data, result.data.length);
        } else {
            sendError(res, result.error, 500);
        }
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

// ============================================
// SEARCH ENDPOINT
// ============================================

app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        
        if (!query || query.length < 2) {
            return sendError(res, 'Search query must be at least 2 characters', 400);
        }
        
        const [teams, leagues, players] = await Promise.all([
            fetchFromAPI('/teams', { search: query }),
            fetchFromAPI('/leagues', { search: query }),
            fetchFromAPI('/players', { search: query })
        ]);
        
        res.json({
            success: true,
            results: {
                teams: teams.data.slice(0, 5),
                leagues: leagues.data.slice(0, 5),
                players: players.data.slice(0, 5)
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        sendError(res, error.message, 500);
    }
});

// ============================================
// 404 HANDLER
// ============================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.path,
        timestamp: new Date().toISOString()
    });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log(`
╔═════════════════════════════════════════════════════╗
║   🚀 X LODON SPORTS API v7.0 - PRODUCTION READY   ║
╠═════════════════════════════════════════════════════╣
║  📍 Port: ${PORT}
║  🌍 Environment: ${NODE_ENV}
║  🔑 API Key: ${API_KEY.substring(0, 8)}...
║  ⚡ Caching: Enabled (60s TTL)
║  🛡️  Rate Limit: 100 req/min
║  📦 Render Ready: Yes
║  📡 Data Source: API-Football (Real Data)
╚═════════════════════════════════════════════════════╝
    `);
});
