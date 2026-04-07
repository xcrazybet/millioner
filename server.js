const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Sportmonks API Configuration - YOUR REAL KEY
const API_TOKEN = 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const BASE_URL = 'https://api.sportmonks.com/v3';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Firebase Admin (optional for production)
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin initialized');
} catch (e) {
    console.log('⚠️ Running without Firebase Admin');
}

// ============= SPORTMONKS PROXY ENDPOINTS =============

// Proxy for live scores
app.get('/api/livescores', async (req, res) => {
    try {
        console.log('🔄 Fetching REAL live scores from Sportmonks API...');
        const response = await axios.get(`${BASE_URL}/football/livescores`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores'
            },
            timeout: 10000
        });
        
        console.log(`✅ Found ${response.data?.data?.length || 0} live matches`);
        res.json(response.data);
    } catch (error) {
        console.error('❌ API Error:', error.message);
        res.status(500).json({ error: error.message, data: [] });
    }
});

// Proxy for fixtures by date
app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const { date } = req.params;
        console.log(`🔄 Fetching REAL fixtures for ${date}...`);
        
        const response = await axios.get(`${BASE_URL}/football/fixtures/date/${date}`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores'
            },
            timeout: 10000
        });
        
        console.log(`✅ Found ${response.data?.data?.length || 0} matches for ${date}`);
        res.json(response.data);
    } catch (error) {
        console.error('❌ API Error:', error.message);
        res.status(500).json({ error: error.message, data: [] });
    }
});

// Proxy for specific fixture
app.get('/api/fixture/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🔄 Fetching REAL fixture ${id}...`);
        
        const response = await axios.get(`${BASE_URL}/football/fixtures/${id}`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores;events;lineups'
            },
            timeout: 10000
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('❌ API Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Proxy for team info
app.get('/api/team/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await axios.get(`${BASE_URL}/football/teams/${id}`, {
            params: { api_token: API_TOKEN }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test endpoint to verify API is working
app.get('/api/test', async (req, res) => {
    try {
        console.log('🧪 Testing Sportmonks API connection...');
        const response = await axios.get(`${BASE_URL}/football/livescores`, {
            params: { api_token: API_TOKEN, per_page: 1 }
        });
        
        res.json({
            success: true,
            message: 'Sportmonks API is working!',
            liveMatchesCount: response.data?.data?.length || 0,
            apiStatus: 'Connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            success: false,
            message: 'API connection failed',
            error: error.message
        });
    }
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════════╗
    ║     🚀 SERVER RUNNING - REAL API ACTIVE    ║
    ╠════════════════════════════════════════════╣
    ║  📡 Port: ${PORT}                              ║
    ║  🎯 API: Sportmonks (REAL DATA)            ║
    ║  🔑 Token: ${API_TOKEN.substring(0, 15)}...     ║
    ║  🌐 URL: http://localhost:${PORT}             ║
    ╚════════════════════════════════════════════╝
    `);
});
