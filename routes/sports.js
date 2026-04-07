const express = require('express');
const router = express.Router();
const sportmonksService = require('../services/sportmonks');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  try {
    // Try to load service account from file
    const serviceAccount = require('../serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Firebase Admin init error:', error.message);
    // For development without service account
    admin.initializeApp({
      projectId: 'x-bet-prod-jd'
    });
  }
}

const db = admin.firestore();

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided. Please login.' });
  }
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid or expired token. Please login again.' });
  }
};

// GET /api/matches/live
router.get('/matches/live', verifyToken, async (req, res) => {
  try {
    const matches = await sportmonksService.getLiveMatches();
    res.json({ 
      success: true, 
      matches,
      count: matches.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Live matches error:', error);
    res.status(500).json({ error: 'Failed to fetch live matches. Please try again.' });
  }
});

// GET /api/matches/upcoming
router.get('/matches/upcoming', verifyToken, async (req, res) => {
  try {
    const matches = await sportmonksService.getUpcomingMatches();
    res.json({ 
      success: true, 
      matches,
      count: matches.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Upcoming matches error:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming matches.' });
  }
});

// GET /api/matches/finished
router.get('/matches/finished', verifyToken, async (req, res) => {
  try {
    const matches = await sportmonksService.getFinishedMatches();
    res.json({ 
      success: true, 
      matches,
      count: matches.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Finished matches error:', error);
    res.status(500).json({ error: 'Failed to fetch finished matches.' });
  }
});

// GET /api/matches/:id
router.get('/matches/:id', verifyToken, async (req, res) => {
  try {
    const match = await sportmonksService.getMatchDetails(req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json({ success: true, match });
  } catch (error) {
    console.error('Match details error:', error);
    res.status(500).json({ error: 'Failed to fetch match details.' });
  }
});

// POST /api/place-bet
router.post('/place-bet', verifyToken, async (req, res) => {
  const { matchId, matchName, amount, outcome, odds } = req.body;
  const userId = req.user.uid;
  
  // Validate input
  if (!matchId || !amount || !outcome) {
    return res.status(400).json({ error: 'Missing required fields: matchId, amount, outcome' });
  }
  
  if (amount < 1) {
    return res.status(400).json({ error: 'Minimum bet amount is $1' });
  }
  
  if (amount > 10000) {
    return res.status(400).json({ error: 'Maximum bet amount is $10,000' });
  }
  
  try {
    // Get user's wallet from Firestore
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      // Create user document if it doesn't exist
      await userRef.set({
        balance: 1000, // Starting bonus
        email: req.user.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    const userData = userDoc.exists ? userDoc.data() : { balance: 1000 };
    const currentBalance = userData.balance || 0;
    
    if (currentBalance < amount) {
      return res.status(400).json({ 
        error: `Insufficient balance! Your balance is $${currentBalance.toFixed(2)}` 
      });
    }
    
    // Deduct amount from wallet
    await userRef.update({
      balance: admin.firestore.FieldValue.increment(-amount)
    });
    
    // Create bet document
    const betData = {
      userId,
      matchId,
      matchName,
      amount: amount,
      outcome: outcome,
      odds: odds || 2.0,
      potentialWinnings: amount * (odds || 2.0),
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const betRef = await db.collection('bets').add(betData);
    
    // Create transaction record
    await db.collection('transactions').add({
      userId,
      type: 'bet_placed',
      amount: -amount,
      betId: betRef.id,
      description: `Bet placed on ${matchName} - ${outcome}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ 
      success: true, 
      betId: betRef.id,
      newBalance: currentBalance - amount,
      message: `Bet placed successfully! You bet $${amount} on ${matchName}`
    });
  } catch (error) {
    console.error('Bet placement error:', error);
    res.status(500).json({ error: 'Failed to place bet. Please try again.' });
  }
});

// GET /api/user/bets
router.get('/user/bets', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  
  try {
    const betsSnapshot = await db.collection('bets')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    
    const bets = [];
    betsSnapshot.forEach(doc => {
      bets.push({ id: doc.id, ...doc.data() });
    });
    
    res.json({ success: true, bets, count: bets.length });
  } catch (error) {
    console.error('Fetch bets error:', error);
    res.status(500).json({ error: 'Failed to fetch your bets.' });
  }
});

// GET /api/user/balance
router.get('/user/balance', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      // Create user with starting balance
      await userRef.set({
        balance: 1000,
        email: req.user.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.json({ success: true, balance: 1000 });
    }
    
    const balance = userDoc.data().balance || 0;
    res.json({ success: true, balance });
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ error: 'Failed to fetch balance.' });
  }
});

// Test endpoint to verify API is working
router.get('/test', async (req, res) => {
  try {
    const matches = await sportmonksService.getLiveMatches();
    res.json({ 
      success: true, 
      message: 'Sportmonks API is working!',
      matchCount: matches.length,
      sampleMatch: matches[0] || null
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Sportmonks API test failed. Check your API key.'
    });
  }
});

module.exports = router;
