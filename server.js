// ============================================
// server.js - X Lodon Sports API
// ✅ FIXED: Correct date range (from <= to)
// ✅ Returns ALL matches worldwide
// ============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';

app.use(cors());
app.use(express.json());

async function fetchFromAPI(endpoint, params = {}) {
    try {
        console.log(`📡 API Call: ${endpoint}`, params);
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
            params: params,
            headers: { 'x-apisports-key': API_KEY },
            timeout: 30000
        });
        return { success: true, data: response.data.response, results: response.data.results };
    } catch (error) {
        console.error(`API Error:`, error.message);
        return { success: false, data: [], error: error.message };
    }
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// FIXED: GET FIXTURES FOR WEEK
// ============================================
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const today = new Date();
        
        // FIXED: Correct date calculation
        const fromDate = new Date(today);
        fromDate.setHours(0, 0, 0, 0);
        const from = fromDate.toISOString().split('T')[0];
        
        const toDate = new Date(today);
        toDate.setDate(today.getDate() + 7);
        toDate.setHours(23, 59, 59, 999);
        const to = toDate.toISOString().split('T')[0];
        
        console.log(`\n📅 ========================================`);
        console.log(`📅 FROM: ${from}`);
        console.log(`📅 TO:   ${to}`);
        console.log(`📅 VALID: ${from <= to ? 'YES ✅' : 'NO ❌'}`);
        console.log(`📅 ========================================\n`);
        
        const result = await fetchFromAPI('/fixtures', { from, to });
        
        if (result.success && result.data && result.data.length > 0) {
            console.log(`✅ Found ${result.data.length} matches!`);
            
            const fixtures = result.data.map(f => ({
                fixture: {
                    id: f.fixture.id,
                    date: f.fixture.date,
                    status: f.fixture.status
                },
                league: {
                    id: f.league.id,
                    name: f.league.name,
                    logo: f.league.logo,
                    country: f.league.country
                },
                teams: {
                    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
                    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo }
                },
                goals: { home: f.goals.home, away: f.goals.away }
            }));
            
            res.json({ success: true, data: fixtures, count: fixtures.length, date_range: { from, to } });
        } else {
            console.log(`⚠️ No matches found for ${from} to ${to}`);
            res.json({ success: true, data: [], count: 0, date_range: { from, to } });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// FIXED: GET FIXTURES FOR SPECIFIC DATE
// ============================================
app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const date = req.params.date;
        console.log(`📅 Fetching fixtures for: ${date}`);
        
        const result = await fetchFromAPI('/fixtures', { date });
        
        if (result.success && result.data && result.data.length > 0) {
            const fixtures = result.data.map(f => ({
                fixture: { id: f.fixture.id, date: f.fixture.date, status: f.fixture.status },
                league: { id: f.league.id, name: f.league.name, logo: f.league.logo, country: f.league.country },
                teams: {
                    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
                    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo }
                }
            }));
            
            res.json({ success: true, data: fixtures, count: fixtures.length, date: date });
        } else {
            res.json({ success: true, data: [], count: 0, date: date });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET LIVE SCORES
// ============================================
app.get('/api/livescores', async (req, res) => {
    try {
        const result = await fetchFromAPI('/fixtures', { live: 'all' });
        
        if (result.success && result.data) {
            const liveMatches = result.data.filter(f =>
                f.fixture.status.short === '1H' ||
                f.fixture.status.short === '2H' ||
                f.fixture.status.short === 'HT'
            );
            res.json({ success: true, data: liveMatches, count: liveMatches.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// GET ALL LEAGUES
// ============================================
app.get('/api/leagues', async (req, res) => {
    try {
        const result = await fetchFromAPI('/leagues');
        
        if (result.success && result.data) {
            const leagues = result.data.map(l => ({
                id: l.league.id,
                name: l.league.name,
                logo: l.league.logo,
                country: l.country.name
            }));
            res.json({ success: true, data: leagues, count: leagues.length });
        } else {
            res.json({ success: true, data: [], count: 0 });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// DEBUG ENDPOINT (FIXED)
// ============================================
app.get('/api/debug', async (req, res) => {
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setHours(0, 0, 0, 0);
    const from = fromDate.toISOString().split('T')[0];
    
    const toDate = new Date(today);
    toDate.setDate(today.getDate() + 7);
    toDate.setHours(23, 59, 59, 999);
    const to = toDate.toISOString().split('T')[0];
    
    console.log(`🔍 DEBUG: from=${from}, to=${to}`);
    
    const result = await fetchFromAPI('/fixtures', { from, to });
    
    res.json({
        api_working: result.success,
        total_matches_found: result.results || 0,
        date_range: { from, to },
        is_valid_range: from <= to,
        sample_data: result.data ? result.data.slice(0, 3) : []
    });
});

// ============================================
// ROOT
// ============================================
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '10.0.0',
        status: 'active',
        endpoints: {
            health: '/health',
            fixtures_week: '/api/fixtures/week',
            fixtures_date: '/api/fixtures/date/:date',
            livescores: '/api/livescores',
            leagues: '/api/leagues',
            debug: '/api/debug'
        }
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🔑 API Key: ${API_KEY ? 'Configured ✅' : 'Missing ❌'}\n`);
});
