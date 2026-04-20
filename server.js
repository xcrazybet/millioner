const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ===== API-FOOTBALL CONFIGURATION =====
const API_KEY = '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';

// ===== CORS =====
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());

// ===== PROPER FETCH WITH API KEY IN HEADERS =====
async function fetchAPI(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    
    console.log(`🔄 Fetching: ${endpoint}`);
    
    try {
        // CRITICAL: API-Football requires 'x-rapidapi-key' or 'x-apisports-key'
        const response = await fetch(url.toString(), {
            headers: {
                'x-rapidapi-key': API_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            }
        });
        
        const data = await response.json();
        
        // Check for errors
        if (data.errors && Object.keys(data.errors).length > 0) {
            console.error('❌ API Error:', data.errors);
            return { success: false, data: [], error: data.errors };
        }
        
        console.log(`✅ Received ${data.response?.length || 0} items`);
        return { success: true, data: data.response || [] };
        
    } catch (error) {
        console.error('❌ Fetch failed:', error.message);
        return { success: false, data: [], error: error.message };
    }
}

// ===== DEBUG - Shows exactly what's happening =====
app.get('/api/debug', async (req, res) => {
    try {
        // Test with RapidAPI headers
        const response = await fetch('https://v3.football.api-sports.io/status', {
            headers: {
                'x-rapidapi-key': API_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            }
        });
        
        const data = await response.json();
        const remaining = response.headers.get('x-ratelimit-requests-remaining');
        const limit = response.headers.get('x-ratelimit-requests-limit');
        
        res.json({
            success: !data.errors,
            statusCode: response.status,
            rateLimit: { remaining, limit },
            errors: data.errors || null,
            data: data.response || data
        });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ===== TEST ENDPOINT =====
app.get('/api/test', async (req, res) => {
    const result = await fetchAPI('/status');
    res.json({
        success: result.success,
        message: result.success ? '✅ API Working' : '❌ API Failed',
        error: result.error || null
    });
});

// ===== LIVE SCORES =====
app.get('/api/livescores', async (req, res) => {
    const result = await fetchAPI('/fixtures', { live: 'all' });
    res.json({ success: result.success, data: result.data, count: result.data.length });
});

// ===== TODAY'S FIXTURES =====
app.get('/api/fixtures/today', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const result = await fetchAPI('/fixtures', { date: today });
    res.json({ success: result.success, data: result.data, count: result.data.length });
});

// ===== FIXTURES BY DATE =====
app.get('/api/fixtures/date/:date', async (req, res) => {
    const result = await fetchAPI('/fixtures', { date: req.params.date });
    res.json({ success: result.success, data: result.data, count: result.data.length });
});

// ===== NEXT 7 DAYS =====
app.get('/api/fixtures/week', async (req, res) => {
    const today = new Date();
    let all = [];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        const result = await fetchAPI('/fixtures', { date: dateStr });
        if (result.data) all = all.concat(result.data);
        await new Promise(r => setTimeout(r, 300));
    }
    
    res.json({ success: true, data: all, count: all.length });
});

// ===== BETWEEN DATES =====
app.get('/api/fixtures/between/:from/:to', async (req, res) => {
    const { from, to } = req.params;
    let all = [];
    
    const start = new Date(from);
    const end = new Date(to);
    
    for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const result = await fetchAPI('/fixtures', { date: dateStr });
        if (result.data) all = all.concat(result.data);
        await new Promise(r => setTimeout(r, 300));
    }
    
    res.json({ success: true, data: all, count: all.length });
});

// ===== SINGLE FIXTURE =====
app.get('/api/fixtures/:id', async (req, res) => {
    const result = await fetchAPI('/fixtures', { id: req.params.id });
    res.json({ success: result.success, data: result.data?.[0] || null });
});

// ===== LEAGUES =====
app.get('/api/leagues', async (req, res) => {
    const result = await fetchAPI('/leagues');
    res.json({ success: result.success, data: result.data, count: result.data.length });
});

// ===== HEALTH =====
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ===== HOME =====
app.get('/', (req, res) => {
    res.json({
        service: 'X Lodon Sports Proxy',
        version: '6.0.0',
        provider: 'API-Football (RapidAPI)',
        endpoints: ['/api/debug', '/api/test', '/api/livescores', '/api/fixtures/today', '/api/fixtures/week']
    });
});

// ===== 404 =====
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// ===== START =====
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════╗
    ║     🚀 X LODON SPORTS PROXY v6.0             ║
    ║     📡 Port: ${PORT}                            ║
    ║     🔑 API: API-Football (RapidAPI Headers)  ║
    ║     ✅ Ready                                  ║
    ╚══════════════════════════════════════════════╝
    `);
});
