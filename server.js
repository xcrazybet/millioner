// ============================================
// server.js - X Lodon Sports API
// ✅ REAL DATA from API-Football
// ✅ Fixed date ranges (from ≤ to)
// ✅ Correct 7-day calculation
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
            }
        });
        return { success: true, data: response.data.response };
    } catch (error) {
        console.error(`API Error ${endpoint}:`, error.response?.data?.message || error.message);
        return { success: false, data: [], error: error.message };
    }
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        api_key_configured: !!API_KEY,
        timestamp: new Date().toISOString() 
    });
});

// ============================================
// GET FIXTURES FOR WEEK (Today + Next 7 days)
// ============================================
app.get('/api/fixtures/week', async (req, res) => {
    try {
        // FIXED: Correct date calculation
        const today = new Date();
        const fromDate = new Date(today);
        fromDate.setHours(0, 0, 0, 0);
        
        const toDate = new Date(today);
        toDate.setDate(today.getDate() + 7);
        toDate.setHours(23, 59, 59, 999);
        
        const from = fromDate.toISOString().split('T')[0];
        const to = toDate.toISOString().split('T')[0];
        
        console.log(`📅 Fetching fixtures from ${from} to ${to}`);
        
        // Ensure from is not after to
        if (from > to) {
            console.error('Invalid date range: from is after to');
            return res.json({ success: false, error: 'Invalid date range', data: [] });
        }
        
        const result = await fetchFromAPI('/fixtures', { from: from, to: to });
        
        if (result.success && result.data.length > 0) {
            console.log(`✅ Found ${result.data.length} fixtures`);
            
            // Transform data to match your frontend format
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
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date_range: { from: from, to: to },
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`⚠️ No fixtures found for date range ${from} to ${to}`);
            res.json({
                success: true,
                data: [],
                count: 0,
                date_range: { from: from, to: to },
                message: 'No matches scheduled for this period',
                timestamp: new Date().toISOString()
            });
        }
        
    } catch (error) {
        console.error('Error in /api/fixtures/week:', error.message);
        res.json({ success: false, data: [], error: error.message });
    }
});

// ============================================
// GET LIVE SCORES
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

// ============================================
// GET FIXTURES FOR SPECIFIC DATE
// ============================================
app.get('/api/fixture/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
        const result = await fetchFromAPI('/fixtures', { date: date });
        
        if (result.success && result.data.length > 0) {
            res.json({ success: true, data: result.data, count: result.data.length, date: date });
        } else {
            res.json({ success: true, data: [], count: 0, date: date });
        }
    } catch (error) {
        res.json({ success: false, data: [], error: error.message });
    }
});

// ============================================
// GET SINGLE FIXTURE DETAILS
// ============================================
app.get('/api/fixture/:id', async (req, res) => {
    try {
        const fixtureId = req.params.id;
        const fixture = await fetchFromAPI('/fixtures', { id: fixtureId });
        const events = await fetchFromAPI('/fixtures/events', { fixture: fixtureId });
        const stats = await fetchFromAPI('/fixtures/statistics', { fixture: fixtureId });
        const odds = await fetchFromAPI('/odds', { fixture: fixtureId });
        
        res.json({
            success: true,
            fixture: fixture.data[0] || null,
            events: events.data || [],
            statistics: stats.data || [],
            odds: odds.data || []
        });
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
        res.json({ success: false, data: [], error: error.message });
    }
});

// ============================================
// GET LEAGUES
// ============================================
app.get('/api/leagues', async (req, res) => {
    try {
        // Get popular leagues only
        const popularLeagueIds = [39, 140, 78, 135, 61, 2, 3, 88, 94, 128];
        const result = await fetchFromAPI('/leagues');
        
        if (result.success && result.data.length > 0) {
            const popularLeagues = result.data.filter(l => popularLeagueIds.includes(l.league.id));
            const leagues = popularLeagues.map(l => ({
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
        res.json({ success: false, data: [], error: error.message });
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
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.json({ success: false, data: [], error: error.message });
    }
});

// ============================================
// ROOT ENDPOINT
// ============================================
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '6.0.0',
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
            head2head: '/api/fixtures/head2head/:home/:away'
        },
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 X Lodon Sports API Server');
    console.log(`📍 Port: ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    console.log(`📍 Fixtures: http://localhost:${PORT}/api/fixtures/week`);
    console.log('========================================');
    console.log(`🔑 API Key: ${API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`📡 Data Source: API-Football (Real Data)`);
    console.log('========================================');
});
