const express = require('express');
const router = express.Router();
const sportmonksService = require('../services/sportmonks');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  const serviceAccount = require('../serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// GET /api/matches/live - Get live matches
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
    res.status(500).json({ error: error.message });
  }
});

// GET /api/matches/upcoming - Get upcoming matches
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
    res.status(500).json({ error: error.message });
  }
});

// GET /api/matches/finished - Get finished matches
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
    res.status(500).json({ error: error.message });
  }
});

// GET /api/matches/:id - Get single match details
router.get('/matches/:id', verifyToken, async (req, res) => {
  try {
    const match = await sportmonksService.getMatchDetails(req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json({ success: true, match });
  } catch (error) {
    console.error('Match details error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/matches/:id/odds - Get odds for a match
router.get('/matches/:id/odds', verifyToken, async (req, res) => {
  try {
    const odds = await sportmonksService.getMatchOdds(req.params.id);
    res.json({ success: true, odds });
  } catch (error) {
    console.error('Odds error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/place-bet - Place a bet
router.post('/place-bet', verifyToken, async (req, res) => {
  const { matchId, matchName, amount, outcome, odds } = req.body;
  const userId = req.user.uid;
  
  // Validate input
  if (!matchId || !amount || !outcome) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (amount < 1) {
    return res.status(400).json({ error: 'Minimum bet is 1' });
  }
  
  try {
    // Get user's wallet from Firestore
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    const currentBalance = userData.balance || 0;
    
    if (currentBalance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
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
      amount,
      outcome,
      odds: odds || 2.0,
      status: 'pending',
      potentialWinnings: amount * (odds || 2.0),
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
      description: `Bet placed on ${matchName}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ 
      success: true, 
      betId: betRef.id,
      newBalance: currentBalance - amount,
      message: 'Bet placed successfully!'
    });
  } catch (error) {
    console.error('Bet placement error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/user/bets - Get user's bet history
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
    
    res.json({ success: true, bets });
  } catch (error) {
    console.error('Fetch bets error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/user/balance - Get user's current balance
router.get('/user/balance', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const balance = userDoc.data().balance || 0;
    res.json({ success: true, balance });
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
