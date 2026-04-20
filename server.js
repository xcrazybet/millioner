const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ===== YOUR ACTIVE API KEY =====
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

// ===== FETCH WITH CORRECT HEADERS =====
async function fetchAPI(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    
    console.log(`🔄 Fetching: ${endpoint}`, params);
    
    try {
        const response = await fetch(url.toString(), {
            headers: {
                'x-apisports-key': API_KEY
            }
        });
        
        const data = await response.json();
        
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

// ===== DEBUG =====
app.get('/api/debug', async (req, res) => {
    const result = await fetchAPI('/status');
    res.json(result);
});

// ===== LIVE SCORES (FIXED - uses 'live' parameter) =====
app.get('/api/livescores', async (req, res) => {
    const result = await fetchAPI('/fixtures', { live: 'all' });
    res.json(result);
});

// ===== FIXTURES BY DATE (Working) =====
app.get('/api/fixtures/date/:date', async (req, res) => {
    const result = await fetchAPI('/fixtures', { date: req.params.date });
    res.json(result);
});

// ===== TODAY'S FIXTURES =====
app.get('/api/fixtures/today', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const result = await fetchAPI('/fixtures', { date: today });
    res.json(result);
});

// ===== NEXT 7 DAYS (FIXED - uses date range) =====
app.get('/api/fixtures/week', async (req, res) => {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    const from = today.toISOString().split('T')[0];
    const to = nextWeek.toISOString().split('T')[0];
    
    // API-Football supports 'from' and 'to' parameters directly
    const result = await fetchAPI('/fixtures', { from, to });
    res.json(result);
});

// ===== BETWEEN DATES (FIXED) =====
app.get('/api/fixtures/between/:from/:to', async (req, res) => {
    const { from, to } = req.params;
    const result = await fetchAPI('/fixtures', { from, to });
    res.json(result);
});

// ===== LEAGUES =====
app.get('/api/leagues', async (req, res) => {
    const result = await fetchAPI('/leagues');
    res.json(result);
});

// ===== FIXTURES BY LEAGUE =====
app.get('/api/fixtures/league/:leagueId', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const to = nextWeek.toISOString().split('T')[0];
    
    const result = await fetchAPI('/fixtures', { 
        league: req.params.leagueId, 
        from: today, 
        to: to 
    });
    res.json(result);
});

// ===== SINGLE FIXTURE =====
app.get('/api/fixtures/:id', async (req, res) => {
    const result = await fetchAPI('/fixtures', { id: req.params.id });
    res.json({ 
        success: result.success, 
        data: result.data?.[0] || null 
    });
});

// ===== ODDS =====
app.get('/api/odds/:fixtureId', async (req, res) => {
    const result = await fetchAPI('/odds', { fixture: req.params.fixtureId });
    res.json({ 
        success: result.success, 
        data: result.data?.[0] || null 
    });
});

// ===== TEST =====
app.get('/api/test', async (req, res) => {
    const result = await fetchAPI('/status');
    res.json({
        success: result.success,
        message: result.success ? '✅ API Working' : '❌ API Failed',
        account: result.data?.account || null
    });
});

// ===== HEALTH =====
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ===== HOME =====
app.get('/', (req, res) => {
    res.json({
        service: 'X Lodon Sports Proxy',
        version: '7.0.0',
        provider: 'API-Football Ultra',
        endpoints: [
            '/api/debug',
            '/api/livescores',
            '/api/fixtures/today',
            '/api/fixtures/week',
            '/api/fixtures/between/:from/:to'
        ]
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
    ║     🚀 X LODON SPORTS PROXY v7.0             ║
    ║     📡 Port: ${PORT}                            ║
    ║     🎯 API: API-Football (Ultra Plan)        ║
    ║     ✅ Endpoints: /fixtures?from=&to=        ║
    ╚══════════════════════════════════════════════╝
    `);
});
