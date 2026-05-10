// ============================================
// server.js - X Lodon Sports API
// ✅ Fetches ALL matches from ALL leagues worldwide
// ✅ No filtering - returns everything API has
// ✅ Proper date handling
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

// Helper function with better error logging
async function fetchFromAPI(endpoint, params = {}) {
    try {
        console.log(`📡 Calling API: ${endpoint} with params:`, params);
        
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
            params: params,
            headers: {
                'x-apisports-key': API_KEY
            },
            timeout: 30000
        });
        
        console.log(`✅ API Response: ${response.data.results || 0} results`);
        
        return { 
            success: true, 
            data: response.data.response, 
            results: response.data.results,
            total: response.data.results
        };
    } catch (error) {
        console.error(`❌ API Error:`, error.response?.data?.message || error.message);
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
// GET ALL FIXTURES FOR A DATE RANGE
// ============================================
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 14); // Extended to 14 days for more matches
        const to = nextWeek.toISOString().split('T')[0];
        
        console.log(`\n📅 ========================================`);
        console.log(`📅 FETCHING FIXTURES FROM ${from} TO ${to}`);
        console.log(`📅 ========================================\n`);
        
        // Fetch ALL fixtures - no filters
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data && result.data.length > 0) {
            console.log(`\n✅ SUCCESS: Found ${result.data.length} matches worldwide!\n`);
            
            // Log some sample matches
            console.log(`📊 SAMPLE MATCHES:`);
            result.data.slice(0, 5).forEach(m => {
                console.log(`   - ${m.league.name}: ${m.teams.home.name} vs ${m.teams.away.name} on ${m.fixture.date}`);
            });
            console.log(`\n`);
            
            // Format the response
            const fixtures = result.data.map(f => ({
                fixture: {
                    id: f.fixture.id,
                    date: f.fixture.date,
                    status: f.fixture.status,
                    venue: f.fixture.venue,
                    timezone: f.fixture.timezone
                },
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo,
                    country: f.league.country,
                    flag: f.league.flag,
                    season: f.league.season
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
            }));
            
            // Group by country
            const groupedByCountry = {};
            fixtures.forEach(f => {
                const country = f.league.country || 'Other';
                if (!groupedByCountry[country]) groupedByCountry[country] = [];
                groupedByCountry[country].push(f);
            });
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                grouped_by_country: groupedByCountry,
                date_range: { from, to },
                total_from_api: result.total,
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`⚠️ No fixtures found for ${from} to ${to}`);
            res.json({
                success: true,
                data: [],
                count: 0,
                date_range: { from, to },
                message: 'No fixtures found in this period',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET FIXTURES FOR SPECIFIC DATE
// ============================================
app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
        console.log(`\n📅 FETCHING FIXTURES FOR DATE: ${date}\n`);
        
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
                },
                goals: { home: f.goals.home, away: f.goals.away }
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
// GET LIVE SCORES
// ============================================
app.get('/api/livescores', async (req, res) => {
    try {
        console.log(`\n🔴 FETCHING LIVE SCORES...\n`);
        
        const result = await fetchFromAPI('/fixtures', { live: 'all' });
        
        if (result.success && result.data && result.data.length > 0) {
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
        console.log(`\n📋 FETCHING ALL LEAGUES...\n`);
        
        const result = await fetchFromAPI('/leagues');
        
        if (result.success && result.data && result.data.length > 0) {
            console.log(`✅ Found ${result.data.length} leagues worldwide`);
            
            const leagues = result.data.map(l => ({
                id: l.league.id,
                name: l.league.name,
                logo: l.league.logo,
                type: l.league.type,
                country: l.country.name,
                country_code: l.country.code,
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
// GET SINGLE FIXTURE DETAILS
// ============================================
app.get('/api/fixture/:id', async (req, res) => {
    try {
        const fixtureId = req.params.id;
        console.log(`\n📋 FETCHING FIXTURE DETAILS: ${fixtureId}\n`);
        
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
                score: f.score
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
// DEBUG ENDPOINT - Check what API returns
// ============================================
app.get('/api/debug', async (req, res) => {
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const to = nextWeek.toISOString().split('T')[0];
    
    console.log(`\n🔍 DEBUG: Checking API-Football directly\n`);
    
    const result = await fetchFromAPI('/fixtures', { from, to });
    
    res.json({
        api_working: result.success,
        total_matches_found: result.results,
        sample_data: result.data ? result.data.slice(0, 3) : [],
        date_range: { from, to },
        api_key_used: API_KEY ? 'Yes' : 'No'
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
            health: '/health',
            fixtures_week: '/api/fixtures/week',
            fixtures_date: '/api/fixtures/date/:date',
            livescores: '/api/livescores',
            leagues: '/api/leagues',
            fixture_details: '/api/fixture/:id',
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
    console.log('\n========================================');
    console.log('🚀 X Lodon Sports API Server');
    console.log(`📍 Port: ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log('========================================');
    console.log(`🔑 API Key: ${API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`📡 Data Source: API-Football (ALL matches worldwide)`);
    console.log(`🌍 Status: Fetching from ALL leagues, ALL countries`);
    console.log('========================================');
    console.log('\n📋 Available Endpoints:');
    console.log('   GET /health');
    console.log('   GET /api/fixtures/week');
    console.log('   GET /api/fixtures/date/:date');
    console.log('   GET /api/livescores');
    console.log('   GET /api/leagues');
    console.log('   GET /api/fixture/:id');
    console.log('   GET /api/fixtures/events/:id');
    console.log('   GET /api/debug');
    console.log('========================================\n');
});
