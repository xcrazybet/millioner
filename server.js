const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Use token from environment variable (GitHub Secret) or fallback
const API_TOKEN = process.env.SPORTMONKS_API_TOKEN || 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const BASE_URL = 'https://api.sportmonks.com/v3';

// Middleware
app.use(cors({
    origin: ['https://www.whzco.com', 'https://xcrazybet.github.io', 'http://localhost:3000', 'http://127.0.0.1:5500', 'http://xlodon.co.uk'],
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ============= ROOT ENDPOINTS =============

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        apiConfigured: !!API_TOKEN,
        renderEnv: process.env.RENDER ? true : false
    });
});

// Home
app.get('/', (req, res) => {
    res.json({
        service: 'X Lodon Sports Proxy',
        version: '2.0.0',
        endpoints: [
            '/api/test',
            '/api/livescores',
            '/api/livescores/inplay',
            '/api/fixtures/date/:date',
            '/api/fixtures/between/:from/:to',
            '/api/fixtures/:id',
            '/health'
        ]
    });
});

// ============= SPORTMONKS PROXY ENDPOINTS =============

// Test endpoint - Check if API is working
app.get('/api/test', async (req, res) => {
    try {
        console.log('🧪 Testing Sportmonks API connection...');
        const response = await axios.get(`${BASE_URL}/football/livescores`, {
            params: { api_token: API_TOKEN, per_page: 1 },
            timeout: 10000
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
        console.log('🔄 Fetching live scores from Sportmonks...');
        const response = await axios.get(`${BASE_URL}/football/livescores`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores'
            },
            timeout: 15000
        });
        
        const matches = response.data?.data || [];
        console.log(`✅ Found ${matches.length} live matches`);
        res.json({ success: true, data: matches, count: matches.length });
    } catch (error) {
        console.error('❌ Live scores Error:', error.message);
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
});

// Get in-play matches only
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

// Get fixtures between dates (CRITICAL - This was missing!)
app.get('/api/fixtures/between/:from/:to', async (req, res) => {
    try {
        const { from, to } = req.params;
        console.log(`🔄 Fetching fixtures from ${from} to ${to}...`);
        
        // Sportmonks expects from and to in specific format
        const response = await axios.get(`${BASE_URL}/football/fixtures/between/${from}/${to}`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores',
                per_page: 100
            },
            timeout: 20000
        });
        
        const matches = response.data?.data || [];
        console.log(`✅ Found ${matches.length} matches between ${from} and ${to}`);
        
        // Log first few matches for debugging
        if (matches.length > 0) {
            console.log('📋 Sample matches:');
            matches.slice(0, 3).forEach(m => {
                const home = m.participants?.find(p => p.meta?.location === 'home')?.name || 'Home';
                const away = m.participants?.find(p => p.meta?.location === 'away')?.name || 'Away';
                console.log(`   - ${home} vs ${away} | ${m.starting_at}`);
            });
        }
        
        res.json({ success: true, data: matches, count: matches.length });
    } catch (error) {
        console.error('❌ Fixtures between Error:', error.message);
        
        // Check if it's a 404 (Sportmonks API structure issue)
        if (error.response?.status === 404) {
            console.log('⚠️ Trying alternative endpoint structure...');
            try {
                // Alternative: fixtures with date filters
                const altResponse = await axios.get(`${BASE_URL}/football/fixtures`, {
                    params: {
                        api_token: API_TOKEN,
                        include: 'participants;state;league;scores',
                        'filters[startingAt]': `${from},${to}`,
                        per_page: 100
                    },
                    timeout: 20000
                });
                
                const matches = altResponse.data?.data || [];
                console.log(`✅ Alternative endpoint found ${matches.length} matches`);
                res.json({ success: true, data: matches, count: matches.length });
                return;
            } catch (altError) {
                console.error('❌ Alternative also failed:', altError.message);
            }
        }
        
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
});

// Get single fixture by ID
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

// Get today's fixtures (convenience endpoint)
app.get('/api/fixtures/today', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        console.log(`🔄 Fetching today's fixtures (${today})...`);
        
        const response = await axios.get(`${BASE_URL}/football/fixtures/date/${today}`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores'
            },
            timeout: 15000
        });
        
        const matches = response.data?.data || [];
        console.log(`✅ Found ${matches.length} matches for today`);
        res.json({ success: true, data: matches, count: matches.length });
    } catch (error) {
        console.error('❌ Today fixtures Error:', error.message);
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
});

// Get next 7 days fixtures (convenience endpoint)
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        
        const from = today.toISOString().split('T')[0];
        const to = nextWeek.toISOString().split('T')[0];
        
        console.log(`🔄 Fetching week fixtures (${from} to ${to})...`);
        
        const response = await axios.get(`${BASE_URL}/football/fixtures/between/${from}/${to}`, {
            params: {
                api_token: API_TOKEN,
                include: 'participants;state;league;scores',
                per_page: 100
            },
            timeout: 20000
        });
        
        const matches = response.data?.data || [];
        console.log(`✅ Found ${matches.length} matches for next 7 days`);
        res.json({ success: true, data: matches, count: matches.length });
    } catch (error) {
        console.error('❌ Week fixtures Error:', error.message);
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
});

// 404 handler for undefined API routes
app.use('/api/*', (req, res) => {
    console.log(`⚠️ 404 - Unknown API endpoint: ${req.originalUrl}`);
    res.status(404).json({ 
        success: false, 
        error: 'Endpoint not found',
        availableEndpoints: [
            '/api/test',
            '/api/livescores',
            '/api/livescores/inplay',
            '/api/fixtures/date/:date',
            '/api/fixtures/between/:from/:to',
            '/api/fixtures/today',
            '/api/fixtures/week',
            '/api/fixtures/:id'
        ]
    });
});

// Catch-all 404 for other routes
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║     🚀 X LODON SPORTS BETTING - RENDER BACKEND v2.0      ║
    ╠══════════════════════════════════════════════════════════╣
    ║  📡 Port: ${PORT}                                           ║
    ║  🎯 API: Sportmonks (REAL DATA)                          ║
    ║  🔑 Token: ${API_TOKEN ? API_TOKEN.substring(0, 10) + '...' : 'NOT SET'}              ║
    ║  🌍 Environment: ${process.env.RENDER ? 'RENDER CLOUD' : 'LOCAL'}         ║
    ║                                                          ║
    ║  ✅ Available Endpoints:                                  ║
    ║     - /api/test                                          ║
    ║     - /api/livescores                                    ║
    ║     - /api/livescores/inplay                             ║
    ║     - /api/fixtures/date/:date                           ║
    ║     - /api/fixtures/between/:from/:to                    ║
    ║     - /api/fixtures/today                                ║
    ║     - /api/fixtures/week                                 ║
    ║     - /api/fixtures/:id                                  ║
    ║     - /health                                            ║
    ╚══════════════════════════════════════════════════════════╝
    `);
});
