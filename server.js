const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());

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

// Health check
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

// Debug
app.get('/api/debug', async (req, res) => {
    const status = await fetchAPI('/status');
    const leagues = await fetchAPI('/leagues', { current: 'true' });
    const today = new Date().toISOString().split('T')[0];
    const fixtures = await fetchAPI('/fixtures', { date: today });
    
    res.json({
        status: status.success,
        leaguesCount: leagues.data?.length || 0,
        todayFixtures: fixtures.data?.length || 0,
        sample: fixtures.data?.[0] || null
    });
});

// LIVE SCORES
app.get('/api/livescores', async (req, res) => {
    const result = await fetchAPI('/fixtures', { live: 'all' });
    res.json(result);
});

// TODAY'S FIXTURES
app.get('/api/fixtures/today', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const result = await fetchAPI('/fixtures', { date: today });
    res.json(result);
});

// FIXTURES BY DATE
app.get('/api/fixtures/date/:date', async (req, res) => {
    const result = await fetchAPI('/fixtures', { date: req.params.date });
    res.json(result);
});

// NEXT 7 DAYS - Fetch date by date
app.get('/api/fixtures/week', async (req, res) => {
    const today = new Date();
    let allMatches = [];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        const result = await fetchAPI('/fixtures', { date: dateStr });
        if (result.success && result.data) {
            allMatches = allMatches.concat(result.data);
        }
        await new Promise(r => setTimeout(r, 300));
    }
    
    console.log(`📅 Week total: ${allMatches.length} fixtures`);
    res.json({ success: true, data: allMatches, count: allMatches.length });
});

// BETWEEN DATES
app.get('/api/fixtures/between/:from/:to', async (req, res) => {
    const { from, to } = req.params;
    const start = new Date(from);
    const end = new Date(to);
    let allMatches = [];
    
    for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const result = await fetchAPI('/fixtures', { date: dateStr });
        if (result.success && result.data) {
            allMatches = allMatches.concat(result.data);
        }
        await new Promise(r => setTimeout(r, 300));
    }
    
    res.json({ success: true, data: allMatches, count: allMatches.length });
});

// LEAGUES
app.get('/api/leagues', async (req, res) => {
    const result = await fetchAPI('/leagues');
    res.json(result);
});

// SINGLE FIXTURE
app.get('/api/fixtures/:id', async (req, res) => {
    const result = await fetchAPI('/fixtures', { id: req.params.id });
    res.json({ success: result.success, data: result.data?.[0] || null });
});

// TEST
app.get('/api/test', async (req, res) => {
    const result = await fetchAPI('/status');
    res.json({ success: result.success, message: result.success ? '✅ API Working' : '❌ Failed' });
});

app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
