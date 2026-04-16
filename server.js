const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Use token from environment variable (GitHub Secret) or fallback
const API_TOKEN = process.env.SPORTMONKS_API_TOKEN || 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const BASE_URL = 'https://api.sportmonks.com/v3';

// Middleware - ALLOW ALL ORIGINS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: false
}));
app.use(express.json());
app.use(express.static('public'));

// Log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ============= ROOT ENDPOINTS =============

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        apiConfigured: !!API_TOKEN,
        renderEnv: process.env.RENDER ? true : false
    });
});

app.get('/', (req, res) => {
    res.json({
        service: 'X Lodon Sports Proxy',
        version: '3.0.0',
        endpoints: ['/api/test', '/api/livescores', '/api/livescores/inplay', '/api/fixtures/date/:date', '/api/fixtures/between/:from/:to', '/api/fixtures/:id']
    });
});

// ============= SPORTMONKS PROXY ENDPOINTS =============

app.get('/api/test', async (req, res) => {
    try {
        console.log('🧪 Testing Sportmonks API...');
        const response = await axios.get(`${BASE_URL}/football/livescores`, {
            params: { api_token: API_TOKEN, per_page: 1 },
            timeout: 10000
        });
        
        res.json({
            success: true,
            message: '✅ Sportmonks API is WORKING!',
            liveMatchesCount: response.data?.data?.length || 0,
            apiStatus: 'Connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ API Test Failed:', error.message);
        res.json({ success: false, message: 'API connection failed', error: error.message });
    }
});

app.get('/api/livescores', async (req, res) => {
    try {
        console.log('🔄 Fetching live scores...');
        const response = await axios.get(`${BASE_URL}/football/livescores`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores'
            },
            timeout: 15000,
            headers: { 'Accept': 'application/json' }
        });
        
        const matches = response.data?.data || [];
        console.log(`✅ Found ${matches.length} live matches`);
        res.json({ success: true, data: matches, count: matches.length });
    } catch (error) {
        console.error('❌ Live scores Error:', error.message);
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
});

app.get('/api/livescores/inplay', async (req, res) => {
    try {
        console.log('🔄 Fetching in-play matches...');
        const response = await axios.get(`${BASE_URL}/football/livescores/inplay`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores'
            },
            timeout: 15000
        });
        
        const matches = response.data?.data || [];
        console.log(`✅ Found ${matches.length} in-play matches`);
        res.json({ success: true, data: matches, count: matches.length });
    } catch (error) {
        console.error('❌ In-play Error:', error.message);
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
});

app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const { date } = req.params;
        console.log(`🔄 Fetching fixtures for ${date}...`);
        
        const response = await axios.get(`${BASE_URL}/football/fixtures/date/${date}`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores'
            },
            timeout: 15000
        });
        
        const matches = response.data?.data || [];
        console.log(`✅ Found ${matches.length} matches for ${date}`);
        res.json({ success: true, data: matches, count: matches.length });
    } catch (error) {
        console.error('❌ Fixtures Error:', error.message);
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
});

app.get('/api/fixtures/between/:from/:to', async (req, res) => {
    try {
        const { from, to } = req.params;
        console.log(`🔄 Fetching fixtures from ${from} to ${to}...`);
        
        let allMatches = [];
        let page = 1;
        let hasMore = true;
        
        // Fetch up to 5 pages (500 matches max)
        while (hasMore && page <= 5) {
            const response = await axios.get(`${BASE_URL}/football/fixtures/between/${from}/${to}`, {
                params: {
                    api_token: API_TOKEN,
                    include: 'participants;state;league;scores',
                    per_page: 100,
                    page: page
                },
                timeout: 20000
            });
            
            const matches = response.data?.data || [];
            allMatches = allMatches.concat(matches);
            
            const totalPages = response.data?.pagination?.total_pages || 1;
            hasMore = page < totalPages;
            page++;
            
            console.log(`📄 Page ${page-1}: ${matches.length} matches (Total: ${allMatches.length})`);
        }
        
        console.log(`✅ Found ${allMatches.length} total matches between ${from} and ${to}`);
        res.json({ success: true, data: allMatches, count: allMatches.length });
        
    } catch (error) {
        console.error('❌ Fixtures between Error:', error.message);
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
});

app.get('/api/fixtures/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🔄 Fetching fixture ${id}...`);
        
        const response = await axios.get(`${BASE_URL}/football/fixtures/${id}`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores;odds'
            },
            timeout: 15000
        });
        
        res.json({ success: true, data: response.data?.data || null });
    } catch (error) {
        console.error('❌ Fixture Error:', error.message);
        res.status(500).json({ success: false, error: error.message, data: null });
    }
});

app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║     🚀 X LODON SPORTS BETTING - RENDER BACKEND v3.0      ║
    ╠══════════════════════════════════════════════════════════╣
    ║  📡 Port: ${PORT}                                           ║
    ║  🎯 API: Sportmonks (REAL DATA)                          ║
    ║  🌍 CORS: All Origins Allowed                            ║
    ║  📄 Pagination: Up to 500 matches                         ║
    ╚══════════════════════════════════════════════════════════╝
    `);
});
