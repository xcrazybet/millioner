const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3000;
const API_TOKEN = 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const BASE_URL = 'https://api.sportmonks.com/v3/football';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Proxy endpoint for all API requests
app.get('/api/:endpoint', async (req, res) => {
    try {
        const { endpoint } = req.params;
        const queryParams = new URLSearchParams({
            api_token: API_TOKEN,
            include: req.query.include || 'participants;state;league;scores',
            per_page: req.query.per_page || '50',
            ...req.query
        });
        
        const url = `${BASE_URL}/${endpoint}?${queryParams}`;
        console.log('Fetching:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get matches by date range
app.get('/api/fixtures/between/:start/:end', async (req, res) => {
    try {
        const { start, end } = req.params;
        const queryParams = new URLSearchParams({
            api_token: API_TOKEN,
            include: req.query.include || 'participants;state;league;scores;venue',
            per_page: req.query.per_page || '100',
            ...req.query
        });
        
        const url = `${BASE_URL}/fixtures/between/${start}/${end}?${queryParams}`;
        console.log('Fetching fixtures:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get live scores
app.get('/api/livescores', async (req, res) => {
    try {
        const queryParams = new URLSearchParams({
            api_token: API_TOKEN,
            include: req.query.include || 'participants;state;league;scores;events',
            per_page: req.query.per_page || '50',
            ...req.query
        });
        
        const url = `${BASE_URL}/livescores?${queryParams}`;
        console.log('Fetching livescores:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Betting Platform running at http://localhost:${PORT}`);
    console.log(`📡 API Proxy ready to handle requests`);
});
