// ============================================
// server.js - X Lodon Sports API
// ✅ Fetches 3 MONTHS (90 days) of matches
// ✅ Today + next 90 days automatically
// ✅ Zero date calculation errors
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
// HELPER: Get date YYYY-MM-DD
// ============================================
function getDateString(date) {
    return date.toISOString().split('T')[0];
}

// ============================================
// HELPER: Get date range for X days
// ============================================
function getDateRange(days = 90) {
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setHours(0, 0, 0, 0);
    const from = getDateString(fromDate);
    
    const toDate = new Date(today);
    toDate.setDate(today.getDate() + days);
    toDate.setHours(23, 59, 59, 999);
    const to = getDateString(toDate);
    
    return { from, to, days };
}

// ============================================
// FETCH FROM API-FOOTBALL
// ============================================
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

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        api_configured: !!API_KEY
    });
});

// ============================================
// GET FIXTURES FOR 3 MONTHS (90 DAYS)
// ============================================
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const { from, to, days } = getDateRange(90); // 90 days = 3 months
        
        console.log(`\n========================================`);
        console.log(`📅 FETCHING ${days} DAYS OF MATCHES`);
        console.log(`📅 FROM: ${from}`);
        console.log(`📅 TO:   ${to}`);
        console.log(`========================================\n`);
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data && result.data.length > 0) {
            console.log(`✅ FOUND ${result.data.length} MATCHES FOR ${days} DAYS\n`);
            
            // Group by date for easy display
            const groupedByDate = {};
            result.data.forEach(m => {
                const date = new Date(m.fixture.date).toDateString();
                if (!groupedByDate[date]) groupedByDate[date] = [];
                groupedByDate[date].push(m);
            });
            
            console.log(`📅 DATES WITH MATCHES: ${Object.keys(groupedByDate).length} days\n`);
            
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
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date_range: { from, to, days: days },
                grouped_by_date: groupedByDate,
                total_days_with_matches: Object.keys(groupedByDate).length,
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`⚠️ No matches found for ${from} to ${to}`);
            res.json({
                success: true,
                data: [],
                count: 0,
                date_range: { from, to, days: days },
                message: 'No matches in this period',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET FIXTURES FOR SPECIFIC DATE
// ============================================
app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
        console.log(`📅 Fetching fixtures for: ${date}`);
        
        const result = await fetchFromAPI('/fixtures', { date });
        
        if (result.success && result.data && result.data.length > 0) {
            console.log(`✅ Found ${result.data.length} matches on ${date}`);
            
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET FIXTURES FOR CUSTOM DATE RANGE
// ============================================
app.get('/api/fixtures/range/:from/:to', async (req, res) => {
    try {
        const { from, to } = req.params;
        console.log(`📅 Fetching fixtures from ${from} to ${to}`);
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data && result.data.length > 0) {
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
            
            res.json({ success: true, data: fixtures, count: fixtures.length, date_range: { from, to } });
        } else {
            res.json({ success: true, data: [], count: 0, date_range: { from, to } });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET LIVE SCORES
// ============================================
app.get('/api/livescores', async (req, res) => {
    try {
        console.log(`🔴 Fetching live scores...`);
        
        const result = await fetchFromAPI('/fixtures', { live: 'all' });
        
        if (result.success && result.data) {
            const liveMatches = result.data.filter(f =>
                f.fixture.status.short === '1H' ||
                f.fixture.status.short === '2H' ||
                f.fixture.status.short === 'HT'
            );
            
            console.log(`🔴 Found ${liveMatches.length} live matches`);
            
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
                    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
                    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo }
                },
                goals: { home: f.goals.home, away: f.goals.away }
            }));
            
            res.json({ success: true, data: matches, count: matches.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET ALL LEAGUES
// ============================================
app.get('/api/leagues', async (req, res) => {
    try {
        console.log(`📋 Fetching leagues...`);
        
        const result = await fetchFromAPI('/leagues');
        
        if (result.success && result.data) {
            const leagues = result.data.slice(0, 100).map(l => ({
                id: l.league.id,
                name: l.league.name,
                logo: l.league.logo,
                country: l.country.name,
                flag: l.country.flag
            }));
            
            console.log(`📋 Found ${leagues.length} leagues`);
            res.json({ success: true, data: leagues, count: leagues.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET SINGLE FIXTURE DETAILS
// ============================================
app.get('/api/fixture/:id', async (req, res) => {
    try {
        const fixtureId = req.params.id;
        console.log(`📋 Fetching fixture details: ${fixtureId}`);
        
        const result = await fetchFromAPI('/fixtures', { id: fixtureId });
        
        if (result.success && result.data && result.data.length > 0) {
            const f = result.data[0];
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
                    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
                    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo }
                },
                goals: f.goals,
                score: f.score,
                events: await fetchFromAPI('/fixtures/events', { fixture: fixtureId }).then(r => r.data),
                statistics: await fetchFromAPI('/fixtures/statistics', { fixture: fixtureId }).then(r => r.data)
            });
        } else {
            res.json({ success: false, error: 'Fixture not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// DEBUG ENDPOINT
// ============================================
app.get('/api/debug', async (req, res) => {
    const { from, to, days } = getDateRange(90);
    
    const result = await fetchFromAPI('/fixtures', { from, to });
    
    res.json({
        api_working: result.success,
        total_matches_found: result.total || 0,
        date_range: { from, to, days_requested: days },
        is_valid_range: from <= to,
        sample_data: result.data ? result.data.slice(0, 3) : []
    });
});

// ============================================
// ROOT ENDPOINT
// ============================================
app.get('/', (req, res) => {
    const { from, to, days } = getDateRange(90);
    
    res.json({
        name: 'X Lodon Sports API',
        version: '11.0.0',
        status: 'active',
        api_key_configured: !!API_KEY,
        current_date_range: {
            from: from,
            to: to,
            total_days: days,
            description: '3 months (90 days)'
        },
        endpoints: {
            health: '/health',
            fixtures_week: '/api/fixtures/week (90 days)',
            fixtures_date: '/api/fixtures/date/:date',
            fixtures_range: '/api/fixtures/range/:from/:to',
            livescores: '/api/livescores',
            leagues: '/api/leagues',
            fixture: '/api/fixture/:id',
            events: '/api/fixtures/events/:id',
            debug: '/api/debug'
        },
        timestamp: new Date().toISOString()
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    const { from, to, days } = getDateRange(90);
    
    console.log('\n========================================');
    console.log('🚀 X Lodon Sports API Server');
    console.log(`📍 Port: ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log('========================================');
    console.log(`🔑 API Key: ${API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`📡 Data Source: API-Football (ALL matches worldwide)`);
    console.log('========================================');
    console.log(`📅 DATE RANGE CONFIGURATION:`);
    console.log(`   FROM: ${from}`);
    console.log(`   TO:   ${to}`);
    console.log(`   DAYS: ${days} days (3 months)`);
    console.log('========================================');
    console.log('\n📋 Available Endpoints:');
    console.log(`   GET /health`);
    console.log(`   GET /api/fixtures/week (${days} days of matches)`);
    console.log(`   GET /api/fixtures/date/:date`);
    console.log(`   GET /api/fixtures/range/:from/:to`);
    console.log(`   GET /api/livescores`);
    console.log(`   GET /api/leagues`);
    console.log(`   GET /api/fixture/:id`);
    console.log(`   GET /api/fixtures/events/:id`);
    console.log(`   GET /api/debug`);
    console.log('========================================\n');
});
