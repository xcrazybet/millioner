// ============================================
// X LODON SPORTS PROXY SERVER
// This bypasses CORS by making API calls from the server
// ============================================

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 10000;

// Enable CORS for your frontend
app.use(cors({
    origin: ['https://www.whzco.com', 'http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500']
}));

app.use(express.json());

// SportMonks configuration
const SPORTMONKS_TOKEN = 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football';

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        service: 'X Lodon Sports Proxy',
        endpoints: ['/api/livescores', '/api/fixtures', '/api/leagues']
    });
});

// Proxy endpoint for live scores
app.get('/api/livescores', async (req, res) => {
    try {
        const url = `${SPORTMONKS_BASE}/livescores?api_token=${SPORTMONKS_TOKEN}&include=league;participants;scores`;
        console.log('Fetching live scores...');
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Live scores error:', error);
        res.status(500).json({ error: 'Failed to fetch live scores' });
    }
});

// Proxy endpoint for fixtures (upcoming matches)
app.get('/api/fixtures', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const url = `${SPORTMONKS_BASE}/fixtures?api_token=${SPORTMONKS_TOKEN}&include=league;participants&filters=startingAt:${today},${tomorrow}`;
        
        console.log('Fetching fixtures...');
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Fixtures error:', error);
        res.status(500).json({ error: 'Failed to fetch fixtures' });
    }
});

// Proxy endpoint for specific fixture
app.get('/api/fixtures/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const url = `${SPORTMONKS_BASE}/fixtures/${id}?api_token=${SPORTMONKS_TOKEN}&include=league;participants;scores;odds`;
        
        console.log(`Fetching fixture ${id}...`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Fixture error:', error);
        res.status(500).json({ error: 'Failed to fetch fixture' });
    }
});

// Proxy endpoint for leagues
app.get('/api/leagues', async (req, res) => {
    try {
        const url = `${SPORTMONKS_BASE}/leagues?api_token=${SPORTMONKS_TOKEN}`;
        
        console.log('Fetching leagues...');
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Leagues error:', error);
        res.status(500).json({ error: 'Failed to fetch leagues' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 X Lodon Sports Proxy running on port ${PORT}`);
    console.log(`📡 Proxying requests to SportMonks API`);
});
