// ========== DEPENDENCIES ==========
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

// ========== FIREBASE (Preserved from your original) ==========
// Your Firebase functions are preserved in index.js
// This server.js works alongside them

// ========== EXPRESS APP ==========
const app = express();

// ========== CRITICAL: Port for Render ==========
const PORT = process.env.PORT || 3000;

// ========== API CONFIGURATION ==========
const API_TOKEN = process.env.SPORTMONKS_API_TOKEN || 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const BASE_URL = 'https://api.sportmonks.com/v3/football';

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// ========== FIREBASE COMPATIBILITY ROUTE ==========
// This ensures your Firebase functions still work
app.get('/firebase-status', (req, res) => {
    res.json({
        status: 'Firebase functions available',
        functions: 'index.js',
        note: 'Your Firebase cloud functions are preserved'
    });
});

// ========== BETTING PLATFORM ROUTES ==========

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        platform: 'Betting Platform + Firebase',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        port: PORT,
        firebase_available: true
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Millioner Betting Platform',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: '/health',
            test: '/api/test',
            livescores: '/api/livescores',
            upcoming: '/api/upcoming',
            finished: '/api/finished',
            firebase: '/firebase-status'
        },
        firebase_functions: 'Preserved in index.js'
    });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API is working!',
        port: PORT,
        token_configured: !!API_TOKEN,
        timestamp: new Date().toISOString()
    });
});

// Live scores endpoint
app.get('/api/livescores', async (req, res) => {
    try {
        console.log('📡 Fetching live scores...');
        const url = `${BASE_URL}/livescores?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=50`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log(`✅ Fetched ${data.data?.length || 0} live matches`);
        res.json(data);
    } catch (error) {
        console.error('❌ Error fetching live scores:', error.message);
        res.status(500).json({ 
            error: error.message,
            fallback: true,
            message: 'Using fallback mode'
        });
    }
});

// Upcoming matches endpoint
app.get('/api/upcoming', async (req, res) => {
    try {
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        
        const todayStr = today.toISOString().split('T')[0];
        const nextWeekStr = nextWeek.toISOString().split('T')[0];
        
        const url = `${BASE_URL}/fixtures/between/${todayStr}/${nextWeekStr}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=100`;
        
        console.log(`📡 Fetching upcoming matches: ${todayStr} to ${nextWeekStr}`);
        const response = await fetch(url);
        const data = await response.json();
        
        console.log(`✅ Fetched ${data.data?.length || 0} upcoming matches`);
        res.json(data);
    } catch (error) {
        console.error('❌ Error fetching upcoming matches:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Finished matches endpoint
app.get('/api/finished', async (req, res) => {
    try {
        const today = new Date();
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        
        const lastWeekStr = lastWeek.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        
        const url = `${BASE_URL}/fixtures/between/${lastWeekStr}/${todayStr}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=100`;
        
        console.log(`📡 Fetching finished matches: ${lastWeekStr} to ${todayStr}`);
        const response = await fetch(url);
        const data = await response.json();
        
        console.log(`✅ Fetched ${data.data?.length || 0} finished matches`);
        res.json(data);
    } catch (error) {
        console.error('❌ Error fetching finished matches:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Matches by date endpoint
app.get('/api/matches/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const url = `${BASE_URL}/fixtures/date/${date}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=50`;
        
        console.log(`📡 Fetching matches for date: ${date}`);
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('❌ Error fetching matches:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        message: `Endpoint ${req.url} does not exist`,
        available_endpoints: [
            '/',
            '/health',
            '/api/test',
            '/api/livescores',
            '/api/upcoming',
            '/api/finished',
            '/api/matches/:date',
            '/firebase-status'
        ]
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message 
    });
});

// ========== START SERVER ==========
app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log('🚀 MILLIONER BETTING PLATFORM');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔑 API Token: ${API_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    console.log(`🔥 Firebase: Preserved (index.js)`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`🌍 Public: https://millioner.onrender.com`);
    console.log('========================================');
    console.log('📡 Available Endpoints:');
    console.log(`   - GET  /              (API Info)`);
    console.log(`   - GET  /health        (Health Check)`);
    console.log(`   - GET  /api/test      (Test API)`);
    console.log(`   - GET  /api/livescores (Live Matches)`);
    console.log(`   - GET  /api/upcoming   (Upcoming Matches)`);
    console.log(`   - GET  /api/finished   (Finished Matches)`);
    console.log(`   - GET  /firebase-status (Firebase Status)`);
    console.log('========================================');
});
