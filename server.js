const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = '2396236d9d5cd07468ce280da8390ad5';
const BASE_URL = 'https://v3.football.api-sports.io';

app.use(cors());
app.use(express.json());

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'API is working!' });
});

// Get fixtures for today + next 7 days
app.get('/api/fixtures/week', async (req, res) => {
    try {
        const today = new Date();
        const from = today.toISOString().split('T')[0];
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        const to = nextWeek.toISOString().split('T')[0];
        
        const response = await axios.get(`${BASE_URL}/fixtures`, {
            params: { from, to },
            headers: { 'x-apisports-key': API_KEY }
        });
        
        res.json({
            success: true,
            data: response.data.response,
            count: response.data.results,
            date_range: { from, to }
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get live scores
app.get('/api/livescores', async (req, res) => {
    try {
        const response = await axios.get(`${BASE_URL}/fixtures`, {
            params: { live: 'all' },
            headers: { 'x-apisports-key': API_KEY }
        });
        
        const live = response.data.response.filter(f => 
            ['1H', '2H', 'HT'].includes(f.fixture.status.short)
        );
        
        res.json({ success: true, data: live, count: live.length });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get leagues
app.get('/api/leagues', async (req, res) => {
    try {
        const response = await axios.get(`${BASE_URL}/leagues`, {
            headers: { 'x-apisports-key': API_KEY }
        });
        res.json({ success: true, data: response.data.response, count: response.data.results });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get single fixture
app.get('/api/fixture/:id', async (req, res) => {
    try {
        const response = await axios.get(`${BASE_URL}/fixtures`, {
            params: { id: req.params.id },
            headers: { 'x-apisports-key': API_KEY }
        });
        res.json({ success: true, data: response.data.response[0] });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get match events
app.get('/api/fixtures/events/:id', async (req, res) => {
    try {
        const response = await axios.get(`${BASE_URL}/fixtures/events`, {
            params: { fixture: req.params.id },
            headers: { 'x-apisports-key': API_KEY }
        });
        res.json({ success: true, data: response.data.response });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
