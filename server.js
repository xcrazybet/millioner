// Simple working server for Render
const express = require('express');
const cors = require('cors');
const app = express();

// CRITICAL: Port for Render
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple route to test if server is working
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        message: 'Betting Platform API is working!',
        port: PORT,
        time: new Date().toISOString()
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API test successful',
        port: PORT
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
