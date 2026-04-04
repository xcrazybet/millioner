const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();

const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.SPORTMONKS_API_TOKEN || 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const BASE_URL = 'https://api.sportmonks.com/v3/football';

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        status: 'running',
        message: 'Millioner Betting Platform',
        time: new Date().toISOString(),
        endpoints: ['/health', '/api/test', '/api/livescores', '/api/upcoming', '/api/finished']
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'API is working!', port: PORT, token_configured: !!API_TOKEN });
});

app.get('/api/livescores', async (req, res) => {
    try {
        const response = await fetch(`${BASE_URL}/livescores?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=50`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/upcoming', async (req, res) => {
    try {
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        const todayStr = today.toISOString().split('T')[0];
        const nextWeekStr = nextWeek.toISOString().split('T')[0];
        const response = await fetch(`${BASE_URL}/fixtures/between/${todayStr}/${nextWeekStr}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=100`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/finished', async (req, res) => {
    try {
        const today = new Date();
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        const lastWeekStr = lastWeek.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        const response = await fetch(`${BASE_URL}/fixtures/between/${lastWeekStr}/${todayStr}?api_token=${API_TOKEN}&include=participants;state;league;scores&per_page=100`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 https://millioner.onrender.com`);
});
