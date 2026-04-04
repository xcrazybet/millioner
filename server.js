const express = require('express');
const cors = require('cors');

// IMPORTANT: For Node.js 18+, fetch is built-in, but we'll use a fallback
let fetch;
try {
    fetch = require('node-fetch');
} catch (e) {
    // Node.js 18+ has built-in fetch
    fetch = global.fetch;
}

const path = require('path');

const app = express();

// ========== CRITICAL: This is what you're missing! ==========
const PORT = process.env.PORT || 3000;

// ========== API Configuration ==========
const API_TOKEN = process.env.SPORTMONKS_API_TOKEN || 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const BASE_URL = 'https://api.sportmonks.com/v3/football';

// ========== Middleware ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// ========== Health Check ==========
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        port: PORT,
        message: 'Server is running!'
    });
});

// ========== Root Endpoint ==========
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Betting Platform API</title>
                <style>
                    body { font-family: Arial; padding: 20px; background: #1a1a2e; color: white; }
                    .status { color: #0f0; }
                    .error { color: #f00; }
                    .card { background: #16213e; padding: 20px; border-radius: 10px; margin: 10px 0; }
                    a { color: #e94560; }
                </style>
            </head>
            <body>
                <h1>🚀 Betting Platform API</h1>
                <div class="card">
                    <h2>Status: <span class="status">✅ RUNNING</span></h2>
                    <p>Port: ${PORT}</p>
                    <p>API Token: ${API_TOKEN ? '<span class="status">✅ Configured</span>' : '<span class="error">❌ Missing</span>'}</p>
                </div>
                <div class="card">
                    <h3>📡 Available Endpoints:</h3>
                    <ul>
                        <li><a href="/health">/health</a> - Health check</li>
                        <li><a href="/api/test">/api/test</a> - Test API connection</li>
                        <li><a href="/api/livescores">/api/livescores</a> - Live scores</li>
                        <li><a href="/api/upcoming">/api/upcoming</a> - Upcoming matches</li>
                        <li><a href="/api/finished">/api/finished</a> - Finished matches</li>
                    </ul>
                </div>
            </body>
        </html>
    `);
});

// ========== Test Endpoint ==========
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API is working!',
        port: PORT,
        token_configured: !!API_TOKEN,
        timestamp: new Date().toISOString()
    });
});

// ========== Live Scores ==========
app.get('/api/livescores', async (req, res) => {
    try {
        console.log('📡 Fetching live scores...');
        const url = `${BASE_URL}/livescores?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=20`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log(`✅ Fetched ${data.data?.length || 0} live matches`);
        res.json(data);
    } catch (error) {
        console.error('❌ Error fetching live scores:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ========== Upcoming Matches ==========
app.get('/api/upcoming', async (req, res) => {
    try {
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        
        const todayStr = today.toISOString().split('T')[0];
        const nextWeekStr = nextWeek.toISOString().split('T')[0];
        
        const url = `${BASE_URL}/fixtures/between/${todayStr}/${nextWeekStr}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=50`;
        
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

// ========== Finished Matches ==========
app.get('/api/finished', async (req, res) => {
    try {
        const today = new Date();
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        
        const lastWeekStr = lastWeek.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        
        const url = `${BASE_URL}/fixtures/between/${lastWeekStr}/${todayStr}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=50`;
        
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

// ========== Start Server ==========
app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log('🚀 Betting Platform Server Started!');
    console.log('========================================');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔑 API Token: ${API_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`🌍 Public: https://millioner.onrender.com`);
    console.log('========================================');
});
