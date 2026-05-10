// ============================================
// server.js - X Lodon Sports API
// ✅ CORRECT API-Football integration
// ✅ Fetches real matches
// ============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Your API-Football key
const API_KEY = '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';

app.use(cors());
app.use(express.json());

// ============================================
// TEST ENDPOINT - First verify API-Football works
// ============================================
app.get('/api/test-football', async (req, res) => {
    try {
        // Test with a known date that has matches (April 15, 2026)
        const response = await axios.get(`${BASE_URL}/fixtures`, {
            params: { date: '2026-04-15' },
            headers: { 'x-apisports-key': API_KEY }
        });
        
        res.json({
            success: true,
            message: 'API-Football is working!',
            total_matches: response.data.results,
            sample: response.data.response ? response.data.response.slice(0, 3) : []
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// ============================================
// GET FIXTURES FOR A SPECIFIC DATE
// ============================================
app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
        console.log(`📅 Fetching fixtures for: ${date}`);
        
        const response = await axios.get(`${BASE_URL}/fixtures`, {
            params: { date: date },
            headers: { 'x-apisports-key': API_KEY }
        });
        
        if (response.data.response && response.data.response.length > 0) {
            const fixtures = response.data.response.map(f => ({
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
                date: date
            });
        } else {
            res.json({
                success: true,
                data: [],
                count: 0,
                date: date,
                message: 'No matches on this date'
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET FIXTURES FOR DATE RANGE (NEXT 7 DAYS)
// ============================================
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        const to = nextWeek.toISOString().split('T')[0];
        
        console.log(`📅 Fetching fixtures from ${from} to ${to}`);
        
        const response = await axios.get(`${BASE_URL}/fixtures`, {
            params: { from: from, to: to },
            headers: { 'x-apisports-key': API_KEY }
        });
        
        console.log(`✅ API returned ${response.data.results || 0} matches`);
        
        if (response.data.response && response.data.response.length > 0) {
            const fixtures = response.data.response.map(f => ({
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
                }
            }));
            
            res.json({
                success: true,
                data: fixtures,
                count: fixtures.length,
                date_range: { from, to }
            });
        } else {
            res.json({
                success: true,
                data: [],
                count: 0,
                date_range: { from, to },
                message: 'No matches in this period'
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET LIVE SCORES
// ============================================
app.get('/api/livescores', async (req, res) => {
    try {
        const response = await axios.get(`${BASE_URL}/fixtures`, {
            params: { live: 'all' },
            headers: { 'x-apisports-key': API_KEY }
        });
        
        if (response.data.response) {
            const liveMatches = response.data.response.filter(f => 
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
        const response = await axios.get(`${BASE_URL}/leagues`, {
            headers: { 'x-apisports-key': API_KEY }
        });
        
        if (response.data.response) {
            const leagues = response.data.response.slice(0, 50).map(l => ({
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET SINGLE FIXTURE
// ============================================
app.get('/api/fixture/:id', async (req, res) => {
    try {
        const response = await axios.get(`${BASE_URL}/fixtures`, {
            params: { id: req.params.id },
            headers: { 'x-apisports-key': API_KEY }
        });
        
        if (response.data.response && response.data.response.length > 0) {
            res.json({ success: true, data: response.data.response[0] });
        } else {
            res.json({ success: false, error: 'Fixture not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// ROOT ENDPOINT
// ============================================
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '10.0.0',
        status: 'active',
        endpoints: {
            test: '/api/test-football',
            fixtures_week: '/api/fixtures/week',
            fixtures_date: '/api/fixtures/date/:date',
            livescores: '/api/livescores',
            leagues: '/api/leagues',
            fixture: '/api/fixture/:id'
        }
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`🔑 API Key: ${API_KEY ? 'Configured ✅' : 'Missing ❌'}`);
    console.log(`\n📋 Test URLs:`);
    console.log(`   http://localhost:${PORT}/api/test-football`);
    console.log(`   http://localhost:${PORT}/api/fixtures/date/2026-04-15`);
    console.log(`   http://localhost:${PORT}/api/fixtures/week\n`);
});
