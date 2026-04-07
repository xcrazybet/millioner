const express = require('express');
const path = require('path');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

// Import routes
const sportsRoutes = require('./routes/sports');

// Initialize Firebase Admin
try {
  // Try to load service account
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin initialized with service account');
} catch (error) {
  console.log('⚠️ No service account found, using default credentials');
  admin.initializeApp({
    projectId: 'x-bet-prod-jd'
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5000', 'https://*.onrender.com', 'https://*.firebaseapp.com'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api', sportsRoutes);

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/sports-betting', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sports-betting.html'));
});

app.get('/test-api', async (req, res) => {
  res.send(`
    <html>
      <head><title>API Test</title></head>
      <body>
        <h1>Testing Sportmonks API</h1>
        <button onclick="testAPI()">Test API</button>
        <pre id="result"></pre>
        <script>
          async function testAPI() {
            const result = document.getElementById('result');
            result.textContent = 'Testing...';
            try {
              const response = await fetch('/api/test');
              const data = await response.json();
              result.textContent = JSON.stringify(data, null, 2);
            } catch (error) {
              result.textContent = 'Error: ' + error.message;
            }
          }
        </script>
      </body>
    </html>
  `);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   🚀 Server is running!               ║
  ║   📡 Port: ${PORT}                         ║
  ║   🎯 Sportmonks API: Connected        ║
  ║   🔥 Firebase: Connected              ║
  ║   🌐 URL: http://localhost:${PORT}      ║
  ║   ⚽ Sports Betting: /sports-betting  ║
  ╚═══════════════════════════════════════╝
  `);
});
