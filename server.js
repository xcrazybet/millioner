const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ===== API-FOOTBALL CONFIGURATION =====
const API_KEY = '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';

// ===== COMPLETELY PERMISSIVE CORS =====
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());
app.use(express.static('public'));

// Log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ===== FETCH FUNCTION FOR API-FOOTBALL =====
async function fetchAPIFootball(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
    
    console.log(`🔄 Fetching: ${endpoint}`);
    
    try {
        const response = await fetch(url.toString(), {
            headers: {
                'x-apisports-key': API_KEY,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.error(`❌ API Error (${response.status}): ${response.statusText}`);
            return { success: false, data: [], error: `HTTP ${response.status}` };
        }
        
        const data = await response.json();
        console.log(`✅ Received ${data.response?.length || 0} items`);
        return { success: true, data: data.response || [] };
        
    } catch (error) {
        console.error(`❌ Fetch failed: ${error.message}`);
        return { success: false, data: [], error: error.message };
    }
}

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        apiConfigured: !!API_KEY,
        apiProvider: 'API-Football'
    });
});

app.get('/', (req, res) => {
    res.json({ 
        service: 'X Lodon Sports Proxy',
        version: '5.0.0',
        provider: 'API-Football',
        endpoints: [
            '/api/test',
            '/api/livescores',
            '/api/livescores/inplay',
            '/api/fixtures/date/:date',
            '/api/fixtures/between/:from/:to',
            '/api/fixtures/:id',
            '/api/leagues',
            '/health'
        ]
    });
});

// ===== API ENDPOINTS =====

// Test endpoint
app.get('/api/test', async (req, res) => {
    const result = await fetchAPIFootball('/status');
    res.json({
        success: result.success,
        message: result.success ? '✅ API-Football Working' : '❌ API Failed',
        timestamp: new Date().toISOString()
    });
});

// Get available leagues
app.get('/api/leagues', async (req, res) => {
    const result = await fetchAPIFootball('/leagues');
    res.json({ success: result.success, data: result.data, count: result.data.length });
});

// Get live scores (all live matches)
app.get('/api/livescores', async (req, res) => {
    const result = await fetchAPIFootball('/fixtures', { live: 'all' });
    
    // Enhance with league names if needed
    const matches = result.data || [];
    
    res.json({ 
        success: result.success, 
        data: matches, 
        count: matches.length 
    });
});

// Get in-play matches only (alternative endpoint)
app.get('/api/livescores/inplay', async (req, res) => {
    const result = await fetchAPIFootball('/fixtures', { live: 'all' });
    const liveMatches = (result.data || []).filter(m => 
        ['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(m.fixture?.status?.short)
    );
    res.json({ success: result.success, data: liveMatches, count: liveMatches.length });
});

// Get fixtures by date
app.get('/api/fixtures/date/:date', async (req, res) => {
    const { date } = req.params;
    const result = await fetchAPIFootball('/fixtures', { date });
    res.json({ success: result.success, data: result.data, count: result.data.length });
});

// Get fixtures between dates (with pagination)
app.get('/api/fixtures/between/:from/:to', async (req, res) => {
    const { from, to } = req.params;
    let allMatches = [];
    
    console.log(`📅 Fetching fixtures from ${from} to ${to}`);
    
    // API-Football doesn't have direct "between" endpoint, so we fetch by date range
    const startDate = new Date(from);
    const endDate = new Date(to);
    const dates = [];
    
    for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d).toISOString().split('T')[0]);
    }
    
    // Fetch each date (limit to avoid rate limits)
    for (const date of dates.slice(0, 7)) {
        const result = await fetchAPIFootball('/fixtures', { date });
        if (result.success) {
            allMatches = allMatches.concat(result.data);
        }
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`✅ Total fixtures: ${allMatches.length}`);
    res.json({ success: true, data: allMatches, count: allMatches.length });
});

// Get single fixture by ID
app.get('/api/fixtures/:id', async (req, res) => {
    const { id } = req.params;
    const result = await fetchAPIFootball('/fixtures', { id });
    res.json({ 
        success: result.success, 
        data: result.data?.[0] || null 
    });
});

// Get fixtures by league
app.get('/api/fixtures/league/:leagueId', async (req, res) => {
    const { leagueId } = req.params;
    const today = new Date().toISOString().split('T')[0];
    const result = await fetchAPIFootball('/fixtures', { 
        league: leagueId, 
        date: today 
    });
    res.json({ success: result.success, data: result.data, count: result.data.length });
});

// Get today's fixtures
app.get('/api/fixtures/today', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const result = await fetchAPIFootball('/fixtures', { date: today });
    res.json({ success: result.success, data: result.data, count: result.data.length });
});

// Get next 7 days fixtures
app.get('/api/fixtures/week', async (req, res) => {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    const from = today.toISOString().split('T')[0];
    const to = nextWeek.toISOString().split('T')[0];
    
    let allMatches = [];
    const dates = [];
    
    for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d).toISOString().split('T')[0]);
    }
    
    for (const date of dates) {
        const result = await fetchAPIFootball('/fixtures', { date });
        if (result.success) {
            allMatches = allMatches.concat(result.data);
        }
        await new Promise(r => setTimeout(r, 100));
    }
    
    res.json({ success: true, data: allMatches, count: allMatches.length });
});

// Get odds for fixture
app.get('/api/odds/:fixtureId', async (req, res) => {
    const { fixtureId } = req.params;
    const result = await fetchAPIFootball('/odds', { fixture: fixtureId });
    res.json({ success: result.success, data: result.data?.[0] || null });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║     🚀 X LODON SPORTS PROXY - v5.0.0                     ║
    ╠══════════════════════════════════════════════════════════╣
    ║  📡 Port: ${PORT}                                           ║
    ║  🎯 API: API-Football (v3)                              ║
    ║  🔑 Key: ${API_KEY.substring(0, 8)}...                              ║
    ║  🌍 CORS: Fully Permissive                               ║
    ║  ✅ Ready for production                                 ║
    ╚══════════════════════════════════════════════════════════╝
    `);
});
