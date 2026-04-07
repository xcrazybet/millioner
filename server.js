const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// YOUR REAL SPORTMONKS API KEY
const API_TOKEN = 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const BASE_URL = 'https://api.sportmonks.com/v3';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Log all requests (for debugging on Render)
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ============= SPORTMONKS PROXY ENDPOINTS =============

// Test endpoint - Check if API is working
app.get('/api/test', async (req, res) => {
    try {
        console.log('🧪 Testing Sportmonks API connection...');
        const response = await axios.get(`${BASE_URL}/football/livescores`, {
            params: { api_token: API_TOKEN, per_page: 1 }
        });
        
        res.json({
            success: true,
            message: '✅ Sportmonks API is WORKING!',
            liveMatchesCount: response.data?.data?.length || 0,
            apiStatus: 'Connected',
            timestamp: new Date().toISOString(),
            renderEnv: process.env.RENDER ? 'Running on Render' : 'Running locally'
        });
    } catch (error) {
        console.error('❌ API Test Failed:', error.message);
        res.json({
            success: false,
            message: 'API connection failed',
            error: error.message
        });
    }
});

// Get live scores
app.get('/api/livescores', async (req, res) => {
    try {
        console.log('🔄 Fetching REAL live scores from Sportmonks...');
        const response = await axios.get(`${BASE_URL}/football/livescores`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores'
            },
            timeout: 10000
        });
        
        const matches = response.data?.data || [];
        console.log(`✅ Found ${matches.length} matches from API`);
        res.json({ success: true, data: matches, count: matches.length });
    } catch (error) {
        console.error('❌ API Error:', error.message);
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
});

// Get fixtures by date
app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const { date } = req.params;
        console.log(`🔄 Fetching fixtures for ${date}...`);
        
        const response = await axios.get(`${BASE_URL}/football/fixtures/date/${date}`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores'
            },
            timeout: 10000
        });
        
        const matches = response.data?.data || [];
        console.log(`✅ Found ${matches.length} matches for ${date}`);
        res.json({ success: true, data: matches, count: matches.length });
    } catch (error) {
        console.error('❌ API Error:', error.message);
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
});

// Health check endpoint (for Render)
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        apiConfigured: !!API_TOKEN
    });
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════╗
    ║     🚀 MILLIONER BETTING PLATFORM - RENDER READY     ║
    ╠══════════════════════════════════════════════════════╣
    ║  📡 Port: ${PORT}                                       ║
    ║  🎯 API: Sportmonks (REAL DATA)                      ║
    ║  🔑 Token: ${API_TOKEN.substring(0, 10)}...              ║
    ║  🌍 Environment: ${process.env.RENDER ? 'RENDER CLOUD' : 'LOCAL'}     ║
    ║  🔗 URL: http://localhost:${PORT}                       ║
    ║  ✅ API Test: http://localhost:${PORT}/api/test         ║
    ╚══════════════════════════════════════════════════════╝
    `);
});
