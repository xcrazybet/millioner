const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Use token from environment variable or fallback
const API_TOKEN = process.env.SPORTMONKS_API_TOKEN || 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const BASE_URL = 'https://api.sportmonks.com/v3';

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

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        apiConfigured: !!API_TOKEN
    });
});

app.get('/', (req, res) => {
    res.json({ 
        service: 'X Lodon Sports Proxy',
        version: '4.0.0',
        endpoints: ['/api/livescores', '/api/fixtures/between/:from/:to', '/api/test']
    });
});

// ===== GENERIC FETCH FUNCTION =====
async function fetchSportmonks(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    url.searchParams.append('api_token', API_TOKEN);
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
    
    console.log(`🔄 Fetching: ${endpoint}`);
    
    try {
        const response = await fetch(url.toString());
        if (!response.ok) {
            console.error(`❌ API Error (${response.status}): ${response.statusText}`);
            return { success: false, data: [], error: `HTTP ${response.status}` };
        }
        const data = await response.json();
        console.log(`✅ Received ${data.data?.length || 0} items`);
        return { success: true, data: data.data || [] };
    } catch (error) {
        console.error(`❌ Fetch failed: ${error.message}`);
        return { success: false, data: [], error: error.message };
    }
}

// ===== API ENDPOINTS =====

// Test endpoint
app.get('/api/test', async (req, res) => {
    const result = await fetchSportmonks('/football/livescores', { per_page: 1 });
    res.json({
        success: result.success,
        message: result.success ? '✅ API Working' : '❌ API Failed',
        liveMatchesCount: result.data.length,
        timestamp: new Date().toISOString()
    });
});

// Live scores
app.get('/api/livescores', async (req, res) => {
    const result = await fetchSportmonks('/football/livescores', { 
        include: 'participants;state;league;scores' 
    });
    res.json({ success: result.success, data: result.data, count: result.data.length });
});

// In-play matches
app.get('/api/livescores/inplay', async (req, res) => {
    const result = await fetchSportmonks('/football/livescores/inplay', { 
        include: 'participants;state;league;scores' 
    });
    res.json({ success: result.success, data: result.data, count: result.data.length });
});

// Fixtures between dates
app.get('/api/fixtures/between/:from/:to', async (req, res) => {
    const { from, to } = req.params;
    let allMatches = [];
    let page = 1;
    let hasMore = true;
    
    console.log(`📅 Fetching fixtures from ${from} to ${to}`);
    
    while (hasMore && page <= 5) {
        const result = await fetchSportmonks(`/football/fixtures/between/${from}/${to}`, {
            include: 'participants;state;league;scores',
            per_page: 100,
            page: page
        });
        
        if (!result.success) {
            return res.status(500).json({ success: false, data: [], error: result.error });
        }
        
        allMatches = allMatches.concat(result.data);
        hasMore = result.data.length === 100;
        page++;
        
        console.log(`📄 Page ${page-1}: ${result.data.length} matches`);
    }
    
    console.log(`✅ Total fixtures: ${allMatches.length}`);
    res.json({ success: true, data: allMatches, count: allMatches.length });
});

// Fixtures by date
app.get('/api/fixtures/date/:date', async (req, res) => {
    const { date } = req.params;
    const result = await fetchSportmonks(`/football/fixtures/date/${date}`, {
        include: 'participants;state;league;scores'
    });
    res.json({ success: result.success, data: result.data, count: result.data.length });
});

// Single fixture
app.get('/api/fixtures/:id', async (req, res) => {
    const { id } = req.params;
    const result = await fetchSportmonks(`/football/fixtures/${id}`, {
        include: 'participants;state;league;scores;odds'
    });
    res.json({ success: result.success, data: result.data });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║     🚀 X LODON SPORTS PROXY - v4.0.0                     ║
    ╠══════════════════════════════════════════════════════════╣
    ║  📡 Port: ${PORT}                                           ║
    ║  🎯 API: Sportmonks                                      ║
    ║  🌍 CORS: Fully Permissive                               ║
    ║  ✅ Ready for production                                 ║
    ╚══════════════════════════════════════════════════════════╝
    `);
});
