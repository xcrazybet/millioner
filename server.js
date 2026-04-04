const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
// IMPORTANT: Use PORT from environment variable
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.SPORTMONKS_API_TOKEN || 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const BASE_URL = 'https://api.sportmonks.com/v3/football';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Serve your betting HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'betting', 'index.html'));
});

// API Proxy endpoints
app.get('/api/livescores', async (req, res) => {
    try {
        const url = `${BASE_URL}/livescores?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=50`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/fixtures/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const url = `${BASE_URL}/fixtures/date/${date}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=50`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint (required for Render)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Betting Platform running on port ${PORT}`);
    console.log(`📡 API Proxy ready`);
    console.log(`🌐 Open at http://localhost:${PORT}`);
});
