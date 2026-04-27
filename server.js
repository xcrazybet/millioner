const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

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

// ===== CACHE =====
const cache = new Map();
const CACHE_TTL = 60000;

function getCached(key) {
    const item = cache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL) return item.data;
    return null;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// ===== FETCH =====
async function fetchAPI(endpoint, params = {}, useCache = true) {
    const cacheKey = endpoint + '_' + JSON.stringify(params);
    if (useCache) { const c = getCached(cacheKey); if (c) return c; }
    
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    
    for (let i = 0; i < 3; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(url.toString(), { headers: { 'x-apisports-key': API_KEY }, signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            if (data.errors && Object.keys(data.errors).length > 0) return { success: false, data: [], error: data.errors };
            const result = { success: true, data: data.response || [], count: (data.response || []).length };
            if (useCache) setCache(cacheKey, result);
            return result;
        } catch (e) { if (i === 2) return { success: false, data: [], error: e.message }; await new Promise(r => setTimeout(r, 1000)); }
    }
}

// ===== EXISTING ENDPOINTS =====
app.get('/health', (req, res) => res.json({ status: 'healthy', cacheSize: cache.size }));

app.get('/api/debug', async (req, res) => {
    const [status, leagues, fixtures] = await Promise.all([
        fetchAPI('/status', {}, false),
        fetchAPI('/leagues', {}, false),
        fetchAPI('/fixtures', { date: new Date().toISOString().split('T')[0] }, false)
    ]);
    res.json({ apiStatus: status.success, account: status.data?.account || null, subscription: status.data?.subscription || null, leaguesCount: leagues.count || 0, todayFixtures: fixtures.count || 0, sample: fixtures.data?.[0] || null });
});

app.get('/api/livescores', async (req, res) => { const r = await fetchAPI('/fixtures', { live: 'all' }); res.json(r); });
app.get('/api/fixtures/today', async (req, res) => { const r = await fetchAPI('/fixtures', { date: new Date().toISOString().split('T')[0] }); res.json(r); });
app.get('/api/fixtures/date/:date', async (req, res) => { const r = await fetchAPI('/fixtures', { date: req.params.date }); res.json(r); });

app.get('/api/fixtures/week', async (req, res) => {
    const today = new Date(); let all = [];
    const days = [0,1,2,3,4,5,6];
    const results = await Promise.all(days.map(i => { const d = new Date(today); d.setDate(today.getDate()+i); return fetchAPI('/fixtures', { date: d.toISOString().split('T')[0] }, false); }));
    results.forEach(r => { if (r.success && r.data) all = all.concat(r.data); });
    res.json({ success: true, data: all, count: all.length });
});

app.get('/api/fixtures/between/:from/:to', async (req, res) => {
    const { from, to } = req.params; let all = [];
    const start = new Date(from); const end = new Date(to);
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) days.push(new Date(d).toISOString().split('T')[0]);
    for (let i = 0; i < days.length; i += 3) {
        const batch = days.slice(i, i+3);
        const results = await Promise.all(batch.map(date => fetchAPI('/fixtures', { date }, false)));
        results.forEach(r => { if (r.success && r.data) all = all.concat(r.data); });
    }
    res.json({ success: true, data: all, count: all.length });
});

app.get('/api/leagues', async (req, res) => { const r = await fetchAPI('/leagues'); res.json(r); });
app.get('/api/fixtures/:id', async (req, res) => { const r = await fetchAPI('/fixtures', { id: req.params.id }); res.json({ success: r.success, data: r.data?.[0] || null }); });

// ===== 🆕 NEW BETTING ENDPOINTS =====

// ODDS - For Over/Under, BTTS, Double Chance, etc.
app.get('/api/odds/:fixtureId', async (req, res) => {
    const r = await fetchAPI('/odds', { fixture: req.params.fixtureId });
    res.json({ success: r.success, data: r.data?.[0] || null });
});

// PREDICTIONS - AI match predictions
app.get('/api/predictions/:fixtureId', async (req, res) => {
    const r = await fetchAPI('/predictions', { fixture: req.params.fixtureId });
    res.json({ success: r.success, data: r.data?.[0] || null });
});

// HEAD TO HEAD - Historical match data
app.get('/api/fixtures/h2h/:team1/:team2', async (req, res) => {
    const r = await fetchAPI('/fixtures/headtohead', { h2h: `${req.params.team1}-${req.params.team2}` });
    res.json({ success: r.success, data: r.data || [], count: r.count || 0 });
});

// MATCH EVENTS - Yellow cards, Red cards, Corners, Penalties
app.get('/api/fixtures/events/:fixtureId', async (req, res) => {
    const r = await fetchAPI('/fixtures/events', { fixture: req.params.fixtureId });
    res.json({ success: r.success, data: r.data || [], count: r.count || 0 });
});

// MATCH STATISTICS - Corners, possession, shots, etc.
app.get('/api/fixtures/statistics/:fixtureId', async (req, res) => {
    const r = await fetchAPI('/fixtures/statistics', { fixture: req.params.fixtureId });
    res.json({ success: r.success, data: r.data || [], count: r.count || 0 });
});

// ===== TEST =====
app.get('/api/test', async (req, res) => {
    const r = await fetchAPI('/status', {}, false);
    res.json({ success: r.success, message: r.success ? '✅ API Working' : '❌ Failed' });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => console.log(`
╔══════════════════════════════════════════════════╗
║     🚀 X LODON SPORTS PROXY v3.0                  ║
║     📡 Port: ${PORT}                                ║
║     🆕 New: Odds, H2H, Events, Stats, Predictions ║
╚══════════════════════════════════════════════════╝
`));
