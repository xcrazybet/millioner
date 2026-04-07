const express = require('express');
const path = require('path');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

// Import routes
const sportsRoutes = require('./routes/sports');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Routes
app.use('/api', sportsRoutes);

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/sports-betting', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sports-betting.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}/sports-betting`);
});
