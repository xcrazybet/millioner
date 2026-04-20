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

// ===== FETCH FUNCTION =====
async function fetchAPI(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    
    console.log(`🔄 Fetching: ${endpoint}`, params);
    
    try {
        const response = await fetch(url.toString(), {
            headers: { 'x-apisports-key': API_KEY }
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

// ===== LIVE SCORES =====
app.get('/api/livescores', async (req, res) => {
    const result = await fetchAPI('/fixtures', { live: 'all' });
    res.json(result);
});

// ===== TODAY'S FIXTURES =====
app.get('/api/fixtures/today', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const result = await fetchAPI('/fixtures', { date: today });
    res.json(result);
});

// ===== FIXTURES BY DATE =====
app.get('/api/fixtures/date/:date', async (req, res) => {
    const result = await fetchAPI('/fixtures', { date: req.params.date });
    res.json(result);
});

// ===== NEXT 7 DAYS (FIXED) =====
app.get('/api/fixtures/week', async (req, res) => {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    const from = today.toISOString().split('T')[0];
    const to = nextWeek.toISOString().split('T')[0];
    const season = today.getFullYear();
    
    // API-Football requires season when using from/to
    const result = await fetchAPI('/fixtures', { from, to, season });
    res.json(result);
});

// ===== BETWEEN DATES (FIXED) =====
app.get('/api/fixtures/between/:from/:to', async (req, res) => {
    const { from, to } = req.params;
    const season = new Date(from).getFullYear();
    const result = await fetchAPI('/fixtures', { from, to, season });
    res.json(result);
});

// ===== LEAGUES =====
app.get('/api/leagues', async (req, res) => {
    const result = await fetchAPI('/leagues');
    res.json(result);
});

// ===== SINGLE FIXTURE =====
app.get('/api/fixtures/:id', async (req, res) => {
    const result = await fetchAPI('/fixtures', { id: req.params.id });
    res.json({ success: result.success, data: result.data?.[0] || null });
});

// ===== ODDS (FIXED) =====
app.get('/api/odds/:fixtureId', async (req, res) => {
    const result = await fetchAPI('/odds', { fixture: req.params.fixtureId });
    res.json({ success: result.success, data: result.data?.[0] || null });
});

// ===== TEST =====
app.get('/api/test', async (req, res) => {
    const result = await fetchAPI('/status');
    res.json({ success: result.success, account: result.data?.account || null });
});

// ===== HEALTH =====
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
