const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();

// Use environment variable for PORT (Render sets this automatically)
const PORT = process.env.PORT || 3000;

// API Token from environment variable (set in Render dashboard)
const API_TOKEN = process.env.SPORTMONKS_API_TOKEN || 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const BASE_URL = 'https://api.sportmonks.com/v3/football';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// Health check endpoint (required for Render)
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Root endpoint - serve your betting HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'betting', 'index.html'));
});

// Test endpoint to verify API is working
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'API is working!', 
        token_exists: !!API_TOKEN,
        token_length: API_TOKEN ? API_TOKEN.length : 0
    });
});

// Get live scores
app.get('/api/livescores', async (req, res) => {
    try {
        const url = `${BASE_URL}/livescores?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=50`;
        console.log('Fetching live scores...');
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching live scores:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get fixtures by date
app.get('/api/fixtures/date/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const url = `${BASE_URL}/fixtures/date/${date}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=50`;
        console.log(`Fetching fixtures for date: ${date}`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching fixtures:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get fixtures between dates
app.get('/api/fixtures/between/:start/:end', async (req, res) => {
    try {
        const { start, end } = req.params;
        const url = `${BASE_URL}/fixtures/between/${start}/${end}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=100`;
        console.log(`Fetching fixtures between ${start} and ${end}`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching fixtures between dates:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get specific match details
app.get('/api/fixtures/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const url = `${BASE_URL}/fixtures/${id}?api_token=${API_TOKEN}&include=participants;state;league;scores;events`;
        console.log(`Fetching match details for ID: ${id}`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching match details:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get upcoming matches (next 7 days)
app.get('/api/upcoming', async (req, res) => {
    try {
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        
        const todayStr = today.toISOString().split('T')[0];
        const nextWeekStr = nextWeek.toISOString().split('T')[0];
        
        const url = `${BASE_URL}/fixtures/between/${todayStr}/${nextWeekStr}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=100`;
        console.log(`Fetching upcoming matches from ${todayStr} to ${nextWeekStr}`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching upcoming matches:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get finished matches (last 7 days)
app.get('/api/finished', async (req, res) => {
    try {
        const today = new Date();
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        
        const lastWeekStr = lastWeek.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        
        const url = `${BASE_URL}/fixtures/between/${lastWeekStr}/${todayStr}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=100`;
        console.log(`Fetching finished matches from ${lastWeekStr} to ${todayStr}`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching finished matches:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get leagues
app.get('/api/leagues', async (req, res) => {
    try {
        const url = `${BASE_URL}/leagues?api_token=${API_TOKEN}&per_page=50`;
        console.log('Fetching leagues...');
        
        const response = await fetch(url);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching leagues:', error);
        res.status(500).json({ error: error.message });
    }
});

// 404 handler for unknown routes
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 Betting Platform Server Started!`);
    console.log(`========================================`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`🔑 API Token configured: ${API_TOKEN ? '✅ Yes' : '❌ No'}`);
    console.log(`========================================`);
});
