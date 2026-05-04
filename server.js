// ============================================
// server.js - Clean Backend API Server
// ✅ No browser code - Node.js compatible
// ✅ Works on Render Web Service
// ============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ===== SPORTS API ENDPOINTS =====

// Get fixtures for the week
app.get('/api/fixtures/week', async (req, res) => {
    try {
        // You can replace this with your actual data source
        // For now, returns sample structure
        res.json({
            success: true,
            data: [],
            message: 'API endpoint working. Configure your data source.',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in /api/fixtures/week:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get live scores
app.get('/api/livescores', async (req, res) => {
    try {
        res.json({
            success: true,
            data: [],
            message: 'Live scores endpoint working',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get fixtures for today
app.get('/api/fixtures/today', async (req, res) => {
    try {
        res.json({
            success: true,
            data: [],
            message: 'Today fixtures endpoint working',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get leagues
app.get('/api/leagues', async (req, res) => {
    try {
        res.json({
            success: true,
            data: [],
            message: 'Leagues endpoint working',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get match events
app.get('/api/fixtures/events/:id', async (req, res) => {
    try {
        const fixtureId = req.params.id;
        res.json({
            success: true,
            data: [],
            fixtureId: fixtureId,
            message: 'Events endpoint working'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'X Lodon Sports API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            fixtures: '/api/fixtures/week',
            livescores: '/api/livescores',
            today: '/api/fixtures/today',
            leagues: '/api/leagues',
            events: '/api/fixtures/events/:id'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 API Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`========================================`);
});
