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

// ===== CACHE SYSTEM =====
const cache = new Map();
const CACHE_TTL = 60000;

function getCached(key) {
    const item = cache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL) {
        console.log(`📦 Cache hit: ${key}`);
        return item.data;
    }
    return null;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
    if (cache.size > 200) {
        const now = Date.now();
        for (const [k, v] of cache) {
            if (now - v.timestamp > CACHE_TTL * 3) cache.delete(k);
        }
    }
}

// ===== FETCH WITH RETRY, TIMEOUT & CACHE =====
async function fetchAPI(endpoint, params = {}, useCache = true) {
    const cacheKey = endpoint + '_' + JSON.stringify(params);
    
    if (useCache) {
        const cached = getCached(cacheKey);
        if (cached) return cached;
    }
    
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    
    console.log(`🔄 Fetching: ${endpoint}`);
    
    for (let i = 0; i < 3; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(url.toString(), {
                headers: { 'x-apisports-key': API_KEY },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (response.status === 429) {
                const wait = 2000 * (i + 1);
                console.warn(`⚠️ Rate limited, waiting ${wait}ms...`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            
            if (!response.ok) throw new Error('HTTP ' + response.status);
            
            const data = await response.json();
            
            if (data.errors && Object.keys(data.errors).length > 0) {
                console.error('❌ API Error:', data.errors);
                return { success: false, data: [], error: data.errors };
            }
            
            const result = {
                success: true,
                data: data.response || [],
                count: (data.response || []).length,
                rateLimit: {
                    remaining: response.headers.get('x-ratelimit-requests-remaining'),
                    limit: response.headers.get('x-ratelimit-requests-limit')
                }
            };
            
            if (useCache) setCache(cacheKey, result);
            
            console.log(`✅ ${endpoint}: ${result.count} items`);
            return result;
            
        } catch (error) {
            console.warn(`⚠️ Attempt ${i+1} failed: ${error.message}`);
            if (i === 2) return { success: false, data: [], error: error.message };
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

// ===== ROOT =====
app.get('/', (req, res) => {
    res.json({
        service: 'X Lodon Sports Proxy',
        version: '4.0.0',
        provider: 'API-Football',
        cache: 'Active (60s TTL)',
        endpoints: [
            '/api/debug',
            '/api/livescores',
            '/api/livescores/inplay',
            '/api/fixtures/today',
            '/api/fixtures/week',
            '/api/fixtures/date/:date',
            '/api/fixtures/between/:from/:to',
            '/api/fixtures/:id',
            '/api/fixtures/events/:fixtureId',
            '/api/fixtures/statistics/:fixtureId',
            '/api/fixtures/h2h/:team1/:team2',
            '/api/odds/:fixtureId',
            '/api/predictions/:fixtureId',
            '/api/leagues',
            '/api/test',
            '/api/clear-cache',
            '/health'
        ]
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        cacheSize: cache.size
    });
});

// ===== DEBUG =====
app.get('/api/debug', async (req, res) => {
    try {
        const [status, leagues, fixtures] = await Promise.all([
            fetchAPI('/status', {}, false),
            fetchAPI('/leagues', {}, false),
            fetchAPI('/fixtures', { date: new Date().toISOString().split('T')[0] }, false)
        ]);
        
        res.json({
            apiStatus: status.success,
            account: status.data?.account || null,
            subscription: status.data?.subscription || null,
            leaguesCount: leagues.count || 0,
            todayFixtures: fixtures.count || 0,
            rateLimit: fixtures.rateLimit || null,
            sample: fixtures.data?.[0] || null,
            cacheSize: cache.size
        });
    } catch(e) {
        res.json({ error: e.message });
    }
});

// ===== LIVE SCORES =====
app.get('/api/livescores', async (req, res) => {
    const result = await fetchAPI('/fixtures', { live: 'all' });
    res.json(result);
});

app.get('/api/livescores/inplay', async (req, res) => {
    const result = await fetchAPI('/fixtures', { live: 'all' });
    if (result.success) {
        result.data = result.data.filter(m =>
            ['1H','HT','2H','ET','P','LIVE'].includes(m.fixture?.status?.short)
        );
        result.count = result.data.length;
    }
    res.json(result);
});

// ===== FIXTURES =====
app.get('/api/fixtures/today', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const result = await fetchAPI('/fixtures', { date: today });
    res.json(result);
});

app.get('/api/fixtures/date/:date', async (req, res) => {
    const result = await fetchAPI('/fixtures', { date: req.params.date });
    res.json(result);
});

app.get('/api/fixtures/week', async (req, res) => {
    const cacheKey = 'week_' + new Date().toISOString().split('T')[0];
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);
    
    const today = new Date();
    let allMatches = [];
    
    // Fetch 7 days in parallel (3 at a time to respect rate limits)
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        days.push(date.toISOString().split('T')[0]);
    }
    
    for (let i = 0; i < days.length; i += 3) {
        const batch = days.slice(i, i + 3);
        const results = await Promise.all(
            batch.map(date => fetchAPI('/fixtures', { date }, false))
        );
        for (const result of results) {
            if (result.success && result.data) {
                allMatches = allMatches.concat(result.data);
            }
        }
    }
    
    const response = { success: true, data: allMatches, count: allMatches.length };
    setCache(cacheKey, response);
    
    console.log(`📅 Week total: ${allMatches.length} fixtures`);
    res.json(response);
});

app.get('/api/fixtures/between/:from/:to', async (req, res) => {
    const { from, to } = req.params;
    const start = new Date(from);
    const end = new Date(to);
    let allMatches = [];
    
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d).toISOString().split('T')[0]);
    }
    
    for (let i = 0; i < days.length; i += 3) {
        const batch = days.slice(i, i + 3);
        const results = await Promise.all(
            batch.map(date => fetchAPI('/fixtures', { date }, false))
        );
        for (const result of results) {
            if (result.success && result.data) {
                allMatches = allMatches.concat(result.data);
            }
        }
    }
    
    res.json({ success: true, data: allMatches, count: allMatches.length });
});

app.get('/api/fixtures/:id', async (req, res) => {
    const result = await fetchAPI('/fixtures', { id: req.params.id });
    res.json({ success: result.success, data: result.data?.[0] || null });
});

// ===== MATCH EVENTS (Yellow/Red Cards, Goals, Subs) =====
app.get('/api/fixtures/events/:fixtureId', async (req, res) => {
    const result = await fetchAPI('/fixtures/events', { fixture: req.params.fixtureId });
    res.json(result);
});

// ===== MATCH STATISTICS (Corners, Possession, Shots) =====
app.get('/api/fixtures/statistics/:fixtureId', async (req, res) => {
    const result = await fetchAPI('/fixtures/statistics', { fixture: req.params.fixtureId });
    res.json(result);
});

// ===== HEAD TO HEAD =====
app.get('/api/fixtures/h2h/:team1/:team2', async (req, res) => {
    const result = await fetchAPI('/fixtures/headtohead', {
        h2h: `${req.params.team1}-${req.params.team2}`
    });
    res.json(result);
});

// ===== ODDS =====
app.get('/api/odds/:fixtureId', async (req, res) => {
    const result = await fetchAPI('/odds', { fixture: req.params.fixtureId });
    res.json({ success: result.success, data: result.data?.[0] || null });
});

// ===== PREDICTIONS =====
app.get('/api/predictions/:fixtureId', async (req, res) => {
    const result = await fetchAPI('/predictions', { fixture: req.params.fixtureId });
    res.json({ success: result.success, data: result.data?.[0] || null });
});

// ===== LEAGUES =====
app.get('/api/leagues', async (req, res) => {
    const result = await fetchAPI('/leagues');
    res.json(result);
});

// ===== TEST =====
app.get('/api/test', async (req, res) => {
    const result = await fetchAPI('/status', {}, false);
    res.json({
        success: result.success,
        message: result.success ? '✅ API Working' : '❌ Failed',
        cacheSize: cache.size
    });
});

// ===== CLEAR CACHE =====
app.get('/api/clear-cache', (req, res) => {
    cache.clear();
    res.json({ success: true, message: 'Cache cleared', cacheSize: 0 });
});

// ===== CACHE STATS =====
app.get('/api/cache-stats', (req, res) => {
    const items = [];
    for (const [key, value] of cache) {
        items.push({
            key: key.substring(0, 60),
            age: Math.floor((Date.now() - value.timestamp) / 1000) + 's'
        });
    }
    res.json({ cacheSize: cache.size, items: items.slice(0, 20) });
});

// ===== 404 =====
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// ===== START =====
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════╗
    ║     🚀 X LODON SPORTS PROXY v4.0                  ║
    ╠══════════════════════════════════════════════════╣
    ║  📡 Port: ${PORT}                                    ║
    ║  🎯 API: API-Football                             ║
    ║  📦 Cache: Active (60s TTL)                       ║
    ║  🔄 Retries: 3 with backoff                       ║
    ║  ⚡ Parallel: Batch fetching                       ║
    ║  📊 Endpoints: 20+                                ║
    ║  ✅ Production Ready                               ║
    ╚══════════════════════════════════════════════════╝
    `);
});
