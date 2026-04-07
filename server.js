const express = require('express');
const path = require('path');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 60 });

// Sportmonks API Configuration
const SPORTMONKS_TOKEN = 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
const SPORTMONKS_URL = 'https://soccer.sportmonks.com/api/v2.0';

// Initialize Firebase Admin
try {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin initialized');
} catch (e) {
  console.log('⚠️ Running without Firebase Admin');
  admin.initializeApp({ projectId: 'x-bet-prod-jd' });
}

const db = admin.firestore();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============ SPORTMONKS API ENDPOINTS ============

// Test endpoint
app.get('/api/test', async (req, res) => {
  try {
    const response = await axios.get(`${SPORTMONKS_URL}/livescores`, {
      params: { api_token: SPORTMONKS_TOKEN, include: 'localTeam,visitorTeam' }
    });
    res.json({ success: true, message: 'API Working', count: response.data.data?.length || 0 });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Get live matches
app.get('/api/matches/live', async (req, res) => {
  const cached = cache.get('live_matches');
  if (cached) return res.json({ success: true, matches: cached, source: 'cache' });
  
  try {
    const response = await axios.get(`${SPORTMONKS_URL}/livescores`, {
      params: { api_token: SPORTMONKS_TOKEN, include: 'localTeam,visitorTeam,league' }
    });
    const matches = response.data.data || [];
    cache.set('live_matches', matches);
    res.json({ success: true, matches, count: matches.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get upcoming matches
app.get('/api/matches/upcoming', async (req, res) => {
  const cached = cache.get('upcoming_matches');
  if (cached) return res.json({ success: true, matches: cached });
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
    const response = await axios.get(`${SPORTMONKS_URL}/fixtures/between/${today}/${nextWeek}`, {
      params: { api_token: SPORTMONKS_TOKEN, include: 'localTeam,visitorTeam,league' }
    });
    const matches = response.data.data || [];
    cache.set('upcoming_matches', matches);
    res.json({ success: true, matches, count: matches.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get finished matches
app.get('/api/matches/finished', async (req, res) => {
  const cached = cache.get('finished_matches');
  if (cached) return res.json({ success: true, matches: cached });
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const lastWeek = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
    const response = await axios.get(`${SPORTMONKS_URL}/fixtures/between/${lastWeek}/${today}`, {
      params: { api_token: SPORTMONKS_TOKEN, include: 'localTeam,visitorTeam,league' }
    });
    const matches = (response.data.data || []).filter(m => m.status === 'FT');
    cache.set('finished_matches', matches);
    res.json({ success: true, matches, count: matches.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ BETTING ENDPOINTS ============

// Get user balance
app.get('/api/user/balance', async (req, res) => {
  const userId = req.headers.userid;
  if (!userId) return res.json({ success: true, balance: 1000 });
  
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const balance = userDoc.exists ? userDoc.data().balance : 1000;
    res.json({ success: true, balance });
  } catch (e) {
    res.json({ success: true, balance: 1000 });
  }
});

// Place bet
app.post('/api/place-bet', async (req, res) => {
  const { userId, matchId, matchName, amount, outcome, odds } = req.body;
  
  if (!amount || amount < 1) return res.status(400).json({ error: 'Minimum bet $1' });
  if (amount > 10000) return res.status(400).json({ error: 'Maximum bet $10000' });
  
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const currentBalance = userDoc.exists ? userDoc.data().balance : 1000;
    
    if (currentBalance < amount) {
      return res.status(400).json({ error: `Insufficient balance. You have $${currentBalance}` });
    }
    
    await userRef.set({ balance: currentBalance - amount }, { merge: true });
    
    const bet = {
      userId, matchId, matchName, amount, outcome, odds,
      potentialWinnings: amount * odds,
      status: 'pending',
      createdAt: new Date()
    };
    
    const betRef = await db.collection('bets').add(bet);
    
    res.json({ 
      success: true, 
      betId: betRef.id, 
      newBalance: currentBalance - amount,
      message: `Bet placed: $${amount} on ${matchName}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user bets
app.get('/api/user/bets', async (req, res) => {
  const userId = req.headers.userid;
  if (!userId) return res.json({ success: true, bets: [] });
  
  try {
    const betsSnapshot = await db.collection('bets')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    
    const bets = [];
    betsSnapshot.forEach(doc => bets.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, bets });
  } catch (error) {
    res.json({ success: true, bets: [] });
  }
});

// Serve HTML pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/sports', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sports.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
