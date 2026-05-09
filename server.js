// ============================================
// server.js - X Lodon Sports API
// ✅ Using REAL API-Football data
// ✅ API Key: 2396236d9d5cd07468ce280da8390ad5
// ============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// API-Football configuration
const API_KEY = '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';

app.use(cors());
app.use(express.json());

// API request helper
async function fetchAPI(endpoint, params = {}) {
    try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
            params,
            headers: { 'x-apisports-key': API_KEY }
        });
        return { success: true, data: response.data.response };
    } catch (error) {
        console.error(`API Error:`, error.response?.data || error.message);
        return { success: false, data: [], error: error.message };
    }
}

// ========== ENDPOINTS ==========

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'API is working!' });
});

// Live scores
app.get('/api/livescores', async (req, res) => {
    const result = await fetchAPI('/fixtures', { live: 'all' });
    const live = result.data.filter(f => ['1H', '2H', 'HT'].includes(f.fixture.status.short));
    res.json({ success: true, data: live, count: live.length });
});

// Upcoming matches (today + 7 days)
app.get('/api/fixtures/week', async (req, res) => {
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const to = new Date(today.setDate(today.getDate() + 7)).toISOString().split('T')[0];
    
    const result = await fetchAPI('/fixtures', { from, to });
    const upcoming = result.data.filter(f => f.fixture.status.short === 'NS');
    
    res.json({ success: true, data: upcoming, count: upcoming.length, from, to });
});

// Fixtures by date
app.get('/api/fixture/date/:date', async (req, res) => {
    const result = await fetchAPI('/fixtures', { date: req.params.date });
    res.json({ success: true, data: result.data, count: result.data.length });
});

// Fixtures between dates
app.get('/api/fixture/between/:from/:to', async (req, res) => {
    const result = await fetchAPI('/fixtures', { from: req.params.from, to: req.params.to });
    res.json({ success: true, data: result.data, count: result.data.length });
});

// Single fixture details
app.get('/api/fixture/:id', async (req, res) => {
    const [fixture, events, stats, odds] = await Promise.all([
        fetchAPI('/fixtures', { id: req.params.id }),
        fetchAPI('/fixtures/events', { fixture: req.params.id }),
        fetchAPI('/fixtures/statistics', { fixture: req.params.id }),
        fetchAPI('/odds', { fixture: req.params.id })
    ]);
    
    res.json({
        success: true,
        fixture: fixture.data[0],
        events: events.data,
        statistics: stats.data,
        odds: odds.data
    });
});

// Leagues
app.get('/api/leagues', async (req, res) => {
    const result = await fetchAPI('/leagues');
    const top = [39, 140, 78, 135, 61, 2, 3];
    const filtered = result.data.filter(l => top.includes(l.league.id));
    res.json({ success: true, data: filtered, count: filtered.length });
});

// Head to head
app.get('/api/fixtures/head2head/:home/:away', async (req, res) => {
    const result = await fetchAPI('/fixtures/headtohead', { h2h: `${req.params.home}-${req.params.away}` });
    res.json({ success: true, data: result.data });
});

// Match events
app.get('/api/fixtures/events/:id', async (req, res) => {
    const result = await fetchAPI('/fixtures/events', { fixture: req.params.id });
    res.json({ success: true, data: result.data });
});

// Predictions
app.get('/api/predictions/:id', async (req, res) => {
    const result = await fetchAPI('/predictions', { fixture: req.params.id });
    res.json({ success: true, data: result.data[0] || null });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔑 API Key: ${API_KEY ? 'Configured' : 'Missing'}`);
});
