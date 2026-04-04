const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();

// ========== CRITICAL: PORT Configuration for Render ==========
const PORT = process.env.PORT || 3000;

// ========== API Configuration ==========
// Try both possible environment variable names
const API_TOKEN = process.env.SPORTMONKS_API_TOKEN || process.env.API_TOKEN || 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const BASE_URL = 'https://api.sportmonks.com/v3/football';

// ========== Middleware ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// ========== Health Check (Required for Render) ==========
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        port: PORT,
        api_token_configured: !!API_TOKEN
    });
});

// ========== Root Endpoint ==========
app.get('/', (req, res) => {
    // Try to serve betting/index.html if exists
    const bettingIndex = path.join(__dirname, 'betting', 'index.html');
    const nodeHtmlIndex = path.join(__dirname, 'node-html', 'match.html');
    
    if (require('fs').existsSync(bettingIndex)) {
        res.sendFile(bettingIndex);
    } else if (require('fs').existsSync(nodeHtmlIndex)) {
        res.sendFile(nodeHtmlIndex);
    } else {
        res.send(`
            <html>
                <head><title>Betting Platform</title></head>
                <body>
                    <h1>🚀 Betting Platform API</h1>
                    <p>Server is running!</p>
                    <p>Port: ${PORT}</p>
                    <p>API Token: ${API_TOKEN ? '✅ Configured' : '❌ Missing'}</p>
                    <hr>
                    <h3>Available Endpoints:</h3>
                    <ul>
                        <li><a href="/health">/health</a> - Health check</li>
                        <li><a href="/api/test">/api/test</a> - Test API</li>
                        <li><a href="/api/livescores">/api/livescores</a> - Live scores</li>
                        <li><a href="/api/upcoming">/api/upcoming</a> - Upcoming matches</li>
                        <li><a href="/api/finished">/api/finished</a> - Finished matches</li>
                    </ul>
                </body>
            </html>
        `);
    }
});

// ========== Test Endpoint ==========
app.get('/api/test', (req, res) => {
    res.json({
        message: 'API is working!',
        port: PORT,
        api_token_exists: !!API_TOKEN,
        api_token_length: API_TOKEN ? API_TOKEN.length : 0,
        environment: process.env.NODE_ENV || 'development'
    });
});

// ========== Live Scores ==========
app.get('/api/livescores', async (req, res) => {
    try {
        console.log('Fetching live scores...');
        const url = `${BASE_URL}/livescores?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=50`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching live scores:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== Upcoming Matches (Next 7 days) ==========
app.get('/api/upcoming', async (req, res) => {
    try {
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        
        const todayStr = today.toISOString().split('T')[0];
        const nextWeekStr = nextWeek.toISOString().split('T')[0];
        
        const url = `${BASE_URL}/fixtures/between/${todayStr}/${nextWeekStr}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=100`;
        
        console.log(`Fetching upcoming matches: ${todayStr} to ${nextWeekStr}`);
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching upcoming matches:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== Finished Matches (Last 7 days) ==========
app.get('/api/finished', async (req, res) => {
    try {
        const today = new Date();
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        
        const lastWeekStr = lastWeek.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        
        const url = `${BASE_URL}/fixtures/between/${lastWeekStr}/${todayStr}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=100`;
        
        console.log(`Fetching finished matches: ${lastWeekStr} to ${todayStr}`);
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching finished matches:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== Fixtures by Date ==========
app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const url = `${BASE_URL}/fixtures/date/${date}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=50`;
        
        console.log(`Fetching fixtures for date: ${date}`);
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching fixtures:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== 404 Handler ==========
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.url} not found` });
});

// ========== Error Handler ==========
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ========== Start Server ==========
app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 Betting Platform Server Started!');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔑 API Token: ${API_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`🌍 Render: https://millioner-betting.onrender.com`);
    console.log('========================================');
});
