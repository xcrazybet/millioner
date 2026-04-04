const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// SportMonks API configuration
const SPORTMONKS_API_TOKEN = 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const SPORTMONKS_BASE_URL = 'https://api.sportmonks.com/v3/football';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// API Routes - Proxy to SportMonks
app.get('/api/test', async (req, res) => {
    try {
        console.log('🧪 Testing SportMonks API...');
        
        // Test resources endpoint
        const resourcesResponse = await fetch(`${SPORTMONKS_BASE_URL}/../my/resources?api_token=${SPORTMONKS_API_TOKEN}`);
        const resourcesData = await resourcesResponse.json();
        
        // Test livescores endpoint
        const livescoresResponse = await fetch(`${SPORTMONKS_BASE_URL}/livescores?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores&per_page=5`);
        const livescoresData = await livescoresResponse.json();
        
        // Test fixtures endpoint
        const fixturesResponse = await fetch(`${SPORTMONKS_BASE_URL}/fixtures?api_token=${SPORTMONKS_API_TOKEN}&per_page=5`);
        const fixturesData = await fixturesResponse.json();
        
        res.json({
            success: true,
            resources: resourcesData,
            livescores: livescoresData,
            fixtures: fixturesData,
            message: 'API Test Complete'
        });
        
    } catch (error) {
        console.error('❌ API Test Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'API Test Failed'
        });
    }
});

app.get('/api/livescores', async (req, res) => {
    try {
        console.log('🔥 Fetching live scores...');
        
        // Try inplay first
        let response = await fetch(`${SPORTMONKS_BASE_URL}/livescores/inplay?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores;events`);
        let data = await response.json();
        
        if (data.data && data.data.length > 0) {
            console.log(`✅ ${data.data.length} live matches found (inplay)`);
            return res.json({ success: true, data: data.data, source: 'inplay' });
        }
        
        // Fallback to general livescores
        response = await fetch(`${SPORTMONKS_BASE_URL}/livescores?api_token=${SPORTMONKS_API_TOKEN}&include=state;participants;league;scores`);
        data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const liveMatches = data.data.filter(match => [2, 3, 4, 5, 6].includes(match.state_id));
            console.log(`✅ ${liveMatches.length} live matches found (general)`);
            return res.json({ success: true, data: liveMatches, source: 'general' });
        }
        
        console.log('❌ No live matches found');
        res.json({ success: true, data: [], source: 'none', message: 'No live matches available' });
        
    } catch (error) {
        console.error('❌ Live scores error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/upcoming', async (req, res) => {
    try {
        console.log('📅 Fetching upcoming matches...');
        
        const today = new Date().toISOString().split('T')[0];
        
        // Try today first
        let response = await fetch(`${SPORTMONKS_BASE_URL}/fixtures/date/${today}?api_token=${SPORTMONKS_API_TOKEN}&include=participants;state;league;scores&per_page=15`);
        let data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const upcoming = data.data.filter(match => [1, 45, 46].includes(match.state_id));
            if (upcoming.length > 0) {
                console.log(`✅ ${upcoming.length} upcoming matches found (today)`);
                return res.json({ success: true, data: upcoming, source: 'today' });
            }
        }
        
        // Try tomorrow
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        response = await fetch(`${SPORTMONKS_BASE_URL}/fixtures/date/${tomorrow}?api_token=${SPORTMONKS_API_TOKEN}&include=participants;state;league;scores&per_page=15`);
        data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const tomorrowMatches = data.data.filter(match => [1, 45, 46].includes(match.state_id));
            if (tomorrowMatches.length > 0) {
                console.log(`✅ ${tomorrowMatches.length} upcoming matches found (tomorrow)`);
                return res.json({ success: true, data: tomorrowMatches, source: 'tomorrow' });
            }
        }
        
        console.log('❌ No upcoming matches found');
        res.json({ success: true, data: [], source: 'none', message: 'No upcoming matches available' });
        
    } catch (error) {
        console.error('❌ Upcoming matches error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/finished', async (req, res) => {
    try {
        console.log('🏁 Fetching finished matches...');
        
        // Try general fixtures first
        let response = await fetch(`${SPORTMONKS_BASE_URL}/fixtures?api_token=${SPORTMONKS_API_TOKEN}&include=participants;state;league;scores&per_page=20`);
        let data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const finished = data.data.filter(match => [100, 90, 5].includes(match.state_id))
                .sort((a, b) => new Date(b.starting_at) - new Date(a.starting_at))
                .slice(0, 15);
            
            if (finished.length > 0) {
                console.log(`✅ ${finished.length} finished matches found (general)`);
                return res.json({ success: true, data: finished, source: 'general' });
            }
        }
        
        // Try yesterday
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        response = await fetch(`${SPORTMONKS_BASE_URL}/fixtures/date/${yesterday}?api_token=${SPORTMONKS_API_TOKEN}&include=participants;state;league;scores&per_page=15`);
        data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const yesterdayFinished = data.data.filter(match => [100, 90, 5].includes(match.state_id));
            if (yesterdayFinished.length > 0) {
                console.log(`✅ ${yesterdayFinished.length} finished matches found (yesterday)`);
                return res.json({ success: true, data: yesterdayFinished, source: 'yesterday' });
            }
        }
        
        console.log('❌ No finished matches found');
        res.json({ success: true, data: [], source: 'none', message: 'No finished matches available' });
        
    } catch (error) {
        console.error('❌ Finished matches error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'betting-fixed.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Betting App Server Running!`);
    console.log(`📱 Open: http://localhost:${PORT}`);
    console.log(`🔗 API Endpoints:`);
    console.log(`   - GET /api/test`);
    console.log(`   - GET /api/livescores`);
    console.log(`   - GET /api/upcoming`);
    console.log(`   - GET /api/finished`);
    console.log(`🎯 SportMonks API Token: ${SPORTMONKS_API_TOKEN.substring(0, 10)}...`);
});
