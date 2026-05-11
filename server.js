// ============================================
// server.js - X Lodon Sports API
// ✅ Complete API with ALL endpoints
// ✅ 90 days range support
// ✅ All leagues worldwide
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
function getDateString(date) {
    return date.toISOString().split('T')[0];
}

async function fetchFromAPI(endpoint, params = {}) {
    try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
            params: params,
            headers: { 'x-apisports-key': API_KEY },
            timeout: 30000
        });
        return { success: true, data: response.data.response, total: response.data.results };
    } catch (error) {
        console.error(`API Error:`, error.message);
        return { success: false, data: [], error: error.message };
    }
}

// Format fixture for frontend
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
    };
}

// ============================================
// HEALTH & INFO
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// 1. FIXTURES FOR 90 DAYS
// ============================================
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + 90);
        const to = futureDate.toISOString().split('T')[0];
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data) {
            const fixtures = result.data.map(formatFixture);
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date_range: { from, to, days: 90 }
            });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 2. FIXTURES BY DATE RANGE
// ============================================
app.get('/api/fixtures/range/:from/:to', async (req, res) => {
    try {
        const { from, to } = req.params;
        console.log(`📅 Fetching fixtures from ${from} to ${to}`);
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data) {
            const fixtures = result.data.map(formatFixture);
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
// 3. FIXTURES BY SPECIFIC DATE
// ============================================
app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
        const result = await fetchFromAPI('/fixtures', { date });
        
        if (result.success && result.data) {
            const fixtures = result.data.map(formatFixture);
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
// 4. LIVE SCORES
// ============================================
app.get('/api/livescores', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures', { live: 'all' });
        
        if (result.success && result.data) {
            const liveMatches = result.data.filter(f =>
                f.fixture.status.short === '1H' ||
                f.fixture.status.short === '2H' ||
                f.fixture.status.short === 'HT'
            );
            const matches = liveMatches.map(formatFixture);
            res.json({ success: true, data: matches, count: matches.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 5. GET SINGLE FIXTURE
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
        
        if (fixtureRes.success && fixtureRes.data) {
            res.json({
                success: true,
                fixture: formatFixture(fixtureRes.data[0]),
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
// 6. MATCH EVENTS
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
// 7. MATCH STATISTICS
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
// 8. HEAD TO HEAD
// ============================================
app.get('/api/fixtures/head2head/:home/:away', async (req, res) => {
    try {
        const { home, away } = req.params;
        const result = await fetchFromAPI('/fixtures/headtohead', { h2h: `${home}-${away}` });
        
        if (result.success && result.data) {
            const matches = result.data.map(formatFixture);
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
// 9. PREDICTIONS
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
// 10. ALL LEAGUES
// ============================================
app.get('/api/leagues', async (req, res) => {
    try {
        const result = await fetchFromAPI('/leagues');
        
        if (result.success && result.data) {
            const leagues = result.data.map(l => ({
                id: l.league.id,
                name: l.league.name,
                logo: l.league.logo,
                country: l.country.name,
                flag: l.country.flag
            }));
            res.json({ success: true, data: leagues, count: leagues.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 11. LEAGUE STANDINGS
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
// 12. TEAM DETAILS
// ============================================
app.get('/api/team/:id', async (req, res) => {
    try {
        const result = await fetchFromAPI('/teams', { id: req.params.id });
        if (result.success && result.data) {
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
// 13. TOP SCORERS
// ============================================
app.get('/api/topscorers/:league/:season', async (req, res) => {
    try {
        const { league, season } = req.params;
        const result = await fetchFromAPI('/players/topscorers', { league, season });
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 14. COUNTRIES
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
// 15. DEBUG
// ============================================
app.get('/api/debug', async (req, res) => {
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 90);
    const to = futureDate.toISOString().split('T')[0];
    
    const result = await fetchFromAPI('/fixtures', { from, to });
    
    res.json({
        success: true,
        total_matches: result.total || 0,
        date_range: { from, to },
        sample: result.data ? result.data.slice(0, 3) : []
    });
});

// ============================================
// ROOT
// ============================================
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '10.0.0',
        status: 'active',
        api_configured: !!API_KEY,
        endpoints: {
            health: '/health',
            fixtures_week: '/api/fixtures/week (90 days)',
            fixtures_range: '/api/fixtures/range/:from/:to',
            fixtures_date: '/api/fixtures/date/:date',
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

app.listen(PORT, () => {
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 90);
    const to = futureDate.toISOString().split('T')[0];
    
    console.log('\n========================================');
    console.log('🚀 X Lodon Sports API Server');
    console.log(`📍 Port: ${PORT}`);
    console.log(`📅 90-Day Range: ${from} → ${to}`);
    console.log(`🔑 API Key: ${API_KEY ? '✓' : '✗'}`);
    console.log('========================================\n');
});
