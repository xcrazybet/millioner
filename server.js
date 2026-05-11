// ============================================
// server.js - UNIFIED API + WORKER
// ✅ Runs both API server AND background sync
// ✅ FIXED: No exposed keys (uses process.env)
// ✅ Single deployment - no separate worker service
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const { createClient } = require('@supabase/supabase-js');

// ===== CONFIGURATION (from ENV - NOT hardcoded) =====
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jnazybaeajyynpyoszmy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';
const PORT = process.env.PORT || 3000;

// ===== VALIDATE REQUIRED ENV VARIABLES =====
if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set in environment variables!');
    process.exit(1);
}
if (!API_KEY) {
    console.error('❌ API_FOOTBALL_KEY not set in environment variables!');
    process.exit(1);
}

// ===== INITIALIZE SUPABASE =====
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
console.log('✅ Supabase connected (Service Role)');

// ===== EXPRESS APP =====
const app = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(cors({ origin: ['https://xlodon.co.uk', 'https://www.xlodon.co.uk', 'http://localhost:5500'] }));
app.use(express.json());

// Rate limiting
app.use('/api/', rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests' }
}));

// Cache
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatFixture(f) {
    return {
        fixture_id: f.fixture.id,
        status: getMatchStatus(f.fixture.status?.short),
        odds: {
            home: (1.80 + ((f.fixture.id % 20) / 100)).toFixed(2),
            draw: (3.20 + ((f.fixture.id % 15) / 100)).toFixed(2),
            away: (2.80 + ((f.fixture.id % 25) / 100)).toFixed(2)
        },
        league_id: f.league.id,
        league_name: f.league.name,
        home_team: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
        away_team: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo },
        start_time: f.fixture.date,
        score: { home: f.goals.home || 0, away: f.goals.away || 0 },
        updated_at: new Date().toISOString()
    };
}

function getMatchStatus(short) {
    if (!short || short === 'NS') return 'upcoming';
    if (['1H', '2H', 'HT', 'ET'].includes(short)) return 'live';
    if (['FT', 'AET', 'PEN'].includes(short)) return 'finished';
    return 'upcoming';
}

async function fetchFromAPI(endpoint, params = {}) {
    try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
            params, headers: { 'x-apisports-key': API_KEY }, timeout: 30000
        });
        return { success: true, data: response.data.response, total: response.data.results || 0 };
    } catch (error) {
        console.error(`API Error:`, error.message);
        return { success: false, data: [], total: 0 };
    }
}

// ============================================
// API ENDPOINTS (Frontend-facing)
// ============================================

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/fixtures/date/:date', async (req, res) => {
    const result = await fetchFromAPI('/fixtures', { date: req.params.date });
    const fixtures = (result.data || []).map(formatFixture);
    res.json({ success: true, data: fixtures, count: fixtures.length });
});

app.get('/api/fixtures/week', async (req, res) => {
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const to = nextWeek.toISOString().split('T')[0];
    const result = await fetchFromAPI('/fixtures', { from, to });
    const fixtures = (result.data || []).map(formatFixture);
    res.json({ success: true, data: fixtures, count: fixtures.length, date_range: { from, to } });
});

app.get('/api/livescores', async (req, res) => {
    const result = await fetchFromAPI('/fixtures', { live: 'all' });
    const liveMatches = (result.data || []).filter(f => ['1H', '2H', 'HT', 'ET'].includes(f.fixture.status?.short));
    const matches = liveMatches.map(formatFixture);
    res.json({ success: true, data: matches, count: matches.length });
});

app.get('/api/leagues', async (req, res) => {
    let leagues = cache.get('leagues');
    if (!leagues) {
        const result = await fetchFromAPI('/leagues');
        leagues = (result.data || []).map(l => ({ id: l.league.id, name: l.league.name, logo: l.league.logo, country: l.country.name }));
        cache.set('leagues', leagues, 86400);
    }
    res.json({ success: true, data: leagues, count: leagues.length });
});

app.get('/api/fixture/:id', async (req, res) => {
    const result = await fetchFromAPI('/fixtures', { id: req.params.id });
    if (result.data && result.data.length > 0) {
        res.json({ success: true, fixture: formatFixture(result.data[0]) });
    } else {
        res.status(404).json({ success: false, error: 'Fixture not found' });
    }
});

app.get('/api/debug', (req, res) => {
    res.json({ success: true, message: 'API is running', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.json({ name: 'X Lodon Sports API', version: '14.0.0', status: 'active' });
});

// ============================================
// BACKGROUND WORKER (Runs in same process)
// ============================================

let isSyncing = false;
let lastSync = { live: 0, today: 0, future: 0 };

async function backgroundSync() {
    if (isSyncing) return;
    isSyncing = true;
    const now = Date.now();
    
    try {
        // Live matches - every 30 seconds
        if (now - lastSync.live >= 30000) {
            console.log('🔴 Syncing live matches...');
            const result = await fetchFromAPI('/fixtures', { live: 'all' });
            if (result.data.length) {
                const liveMatches = result.data.filter(f => ['1H', '2H', 'HT', 'ET'].includes(f.fixture.status?.short));
                for (let i = 0; i < liveMatches.length; i += 50) {
                    const batch = liveMatches.slice(i, i + 50);
                    await supabase.from('sports_matches').upsert(batch.map(formatFixture), { onConflict: 'fixture_id' });
                }
                console.log(`✅ Synced ${liveMatches.length} live matches`);
            }
            lastSync.live = now;
        }
        
        // Today's matches - every 5 minutes
        if (now - lastSync.today >= 300000) {
            const today = new Date().toISOString().split('T')[0];
            console.log(`📅 Syncing today's matches (${today})...`);
            const result = await fetchFromAPI('/fixtures', { date: today });
            if (result.data.length) {
                await supabase.from('sports_matches').upsert(result.data.map(formatFixture), { onConflict: 'fixture_id' });
                console.log(`✅ Synced ${result.data.length} today's matches`);
            }
            lastSync.today = now;
        }
        
        // Future matches - every hour
        if (now - lastSync.future >= 3600000) {
            const today = new Date();
            const from = today.toISOString().split('T')[0];
            const futureDate = new Date(today);
            futureDate.setDate(today.getDate() + 30);
            const to = futureDate.toISOString().split('T')[0];
            console.log(`📆 Syncing future matches (${from} → ${to})...`);
            const result = await fetchFromAPI('/fixtures', { from, to });
            if (result.data.length) {
                const upcoming = result.data.filter(f => f.fixture.status?.short === 'NS');
                for (let i = 0; i < upcoming.length; i += 50) {
                    const batch = upcoming.slice(i, i + 50);
                    await supabase.from('sports_matches').upsert(batch.map(formatFixture), { onConflict: 'fixture_id' });
                }
                console.log(`✅ Synced ${upcoming.length} future matches`);
            }
            lastSync.future = now;
        }
        
    } catch(e) {
        console.error('Background sync error:', e);
    } finally {
        isSyncing = false;
    }
}

// ============================================
// START SERVER + BACKGROUND WORKER
// ============================================

app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🚀 X Lodon Sports API Server');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🔑 API Key: ${API_KEY ? '✓' : '✗'}`);
    console.log(`💾 Supabase: ${SUPABASE_SERVICE_KEY ? '✓' : '✗'}`);
    console.log('========================================\n');
    
    // Start background worker
    backgroundSync();
    setInterval(backgroundSync, 10000); // Check every 10 seconds
});
