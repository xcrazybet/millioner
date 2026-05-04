// ============================================
// server.js - X Lodon Sports API
// ✅ Connected to API-Football.com
// ✅ Returns: today, week, livescores, events, odds
// ============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// API-Football configuration
const API_KEY = process.env.API_FOOTBALL_KEY || '2396236d9d5cd07468ce280da8390ad5E';
const API_URL = 'https://v3.football.api-sports.io';

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== GET FIXTURES FOR WEEK (Today + Next 7 days) =====
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        
        const from = today.toISOString().split('T')[0];
        const to = nextWeek.toISOString().split('T')[0];
        
        console.log(`📅 Fetching fixtures: ${from} to ${to}`);
        
        const response = await axios.get(`${API_URL}/fixtures`, {
            params: { from, to, timezone: 'UTC' },
            headers: { 'x-apisports-key': API_KEY }
        });
        
        if (!response.data?.response) {
            return res.json({ success: true, data: [], message: 'No fixtures found' });
        }
        
        // Transform data
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
            goals: { home: f.goals.home, away: f.goals.away },
            score: f.score
        }));
        
        console.log(`✅ Found ${fixtures.length} fixtures`);
        
        res.json({
            success: true,
            data: fixtures,
            count: fixtures.length,
            date_range: { from, to },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        res.json({ success: false, data: [], error: error.message });
    }
});

// ===== GET LIVE SCORES =====
app.get('/api/livescores', async (req, res) => {
    try {
        const response = await axios.get(`${API_URL}/fixtures`, {
            params: { live: 'all' },
            headers: { 'x-apisports-key': API_KEY }
        });
        
        const liveMatches = (response.data?.response || []).filter(f => {
            const status = f.fixture.status.short;
            return status === '1H' || status === '2H' || status === 'HT';
        });
        
        const matches = liveMatches.map(f => ({
            fixture: { id: f.fixture.id, date: f.fixture.date, status: f.fixture.status },
            league: { id: f.league.id, name: f.league.name, logo: f.league.logo },
            teams: {
                home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
                away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo }
            },
            goals: { home: f.goals.home, away: f.goals.away }
        }));
        
        res.json({ success: true, data: matches, count: matches.length });
        
    } catch (error) {
        res.json({ success: false, data: [], error: error.message });
    }
});

// ===== GET LEAGUES =====
app.get('/api/leagues', async (req, res) => {
    try {
        const response = await axios.get(`${API_URL}/leagues`, {
            headers: { 'x-apisports-key': API_KEY }
        });
        
        const leagues = (response.data?.response || []).map(l => ({
            id: l.league.id,
            name: l.league.name,
            logo: l.league.logo,
            country: l.country.name
        }));
        
        res.json({ success: true, data: leagues, count: leagues.length });
        
    } catch (error) {
        res.json({ success: false, data: [], error: error.message });
    }
});

// ===== GET MATCH EVENTS =====
app.get('/api/fixtures/events/:id', async (req, res) => {
    try {
        const response = await axios.get(`${API_URL}/fixtures/events`, {
            params: { fixture: req.params.id },
            headers: { 'x-apisports-key': API_KEY }
        });
        
        res.json({ success: true, data: response.data?.response || [] });
        
    } catch (error) {
        res.json({ success: false, data: [], error: error.message });
    }
});

// ===== GET HEAD2HEAD =====
app.get('/api/fixtures/head2head/:home/:away', async (req, res) => {
    try {
        const response = await axios.get(`${API_URL}/fixtures/headtohead`, {
            params: { h2h: `${req.params.home}-${req.params.away}` },
            headers: { 'x-apisports-key': API_KEY }
        });
        
        res.json({ success: true, data: response.data?.response || [] });
        
    } catch (error) {
        res.json({ success: false, data: [], error: error.message });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '3.0.0',
        status: 'active',
        endpoints: {
            fixtures: '/api/fixtures/week',
            livescores: '/api/livescores',
            leagues: '/api/leagues',
            events: '/api/fixtures/events/:id',
            head2head: '/api/fixtures/head2head/:home/:away'
        }
    });
});

app.listen(PORT, () => {
    console.log('========================================');
    console.log(`🚀 X Lodon API running on port ${PORT}`);
    console.log(`📍 API Key: ${API_KEY !== 'YOUR_API_KEY_HERE' ? '✓ Configured' : '✗ Missing'}`);
    console.log('========================================');
});
