// server.js - WITH REAL FOOTBALL DATA
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// API-Football configuration
const API_FOOTBALL_KEY = 'YOUR_API_KEY_HERE'; // Get from https://www.api-football.com/
const API_FOOTBALL_URL = 'https://v3.football.api-sports.io';

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get fixtures for the week (today + next 7 days)
app.get('/api/fixtures/week', async (req, res) => {
    try {
        // Calculate date range
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        
        const from = today.toISOString().split('T')[0];
        const to = nextWeek.toISOString().split('T')[0];
        
        console.log(`📅 Fetching fixtures from ${from} to ${to}`);
        
        const response = await axios.get(`${API_FOOTBALL_URL}/fixtures`, {
            params: {
                from: from,
                to: to,
                timezone: 'UTC'
            },
            headers: {
                'x-rapidapi-key': API_FOOTBALL_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            }
        });
        
        // Transform data to match your frontend format
        const fixtures = response.data.response.map(fixture => ({
            fixture: {
                id: fixture.fixture.id,
                date: fixture.fixture.date,
                status: fixture.fixture.status
            },
            league: {
                id: fixture.league.id,
                name: fixture.league.name,
                logo: fixture.league.logo
            },
            teams: {
                home: {
                    id: fixture.teams.home.id,
                    name: fixture.teams.home.name,
                    logo: fixture.teams.home.logo
                },
                away: {
                    id: fixture.teams.away.id,
                    name: fixture.teams.away.name,
                    logo: fixture.teams.away.logo
                }
            },
            goals: {
                home: fixture.goals.home,
                away: fixture.goals.away
            }
        }));
        
        res.json({
            success: true,
            data: fixtures,
            count: fixtures.length,
            date_range: { from, to },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error fetching fixtures:', error.message);
        res.json({
            success: false,
            data: [],
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get live scores
app.get('/api/livescores', async (req, res) => {
    try {
        const response = await axios.get(`${API_FOOTBALL_URL}/fixtures`, {
            params: { live: 'all' },
            headers: {
                'x-rapidapi-key': API_FOOTBALL_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            }
        });
        
        const liveMatches = response.data.response.filter(f => 
            f.fixture.status.short === '1H' || 
            f.fixture.status.short === '2H' || 
            f.fixture.status.short === 'HT'
        );
        
        res.json({
            success: true,
            data: liveMatches,
            count: liveMatches.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.json({ success: false, data: [], error: error.message });
    }
});

// Get leagues
app.get('/api/leagues', async (req, res) => {
    try {
        const response = await axios.get(`${API_FOOTBALL_URL}/leagues`, {
            headers: {
                'x-rapidapi-key': API_FOOTBALL_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            }
        });
        
        const leagues = response.data.response.map(l => ({
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

// Get match events
app.get('/api/fixtures/events/:id', async (req, res) => {
    try {
        const fixtureId = req.params.id;
        const response = await axios.get(`${API_FOOTBALL_URL}/fixtures/events`, {
            params: { fixture: fixtureId },
            headers: {
                'x-rapidapi-key': API_FOOTBALL_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            }
        });
        
        res.json({ success: true, data: response.data.response });
        
    } catch (error) {
        res.json({ success: false, data: [], error: error.message });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '2.0.0',
        status: 'active',
        endpoints: {
            fixtures: '/api/fixtures/week',
            livescores: '/api/livescores',
            leagues: '/api/leagues',
            events: '/api/fixtures/events/:id'
        }
    });
});

app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 API Server running on port ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    console.log(`📍 Fixtures: http://localhost:${PORT}/api/fixtures/week`);
    console.log(`========================================`);
});
