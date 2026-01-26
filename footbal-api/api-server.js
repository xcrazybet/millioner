// api-server.js - Free Football Data API
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin with your existing config
const serviceAccount = {
  "type": "service_account",
  "project_id": "x-bet-prod-jd",
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": process.env.FIREBASE_CLIENT_CERT_URL
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://x-bet-prod-jd.firebaseio.com"
});

const db = admin.firestore();

// ============ PUBLIC API ENDPOINTS ============

// 1. GET PUBLIC GAMES (Works with your rules: allow read: if true)
app.get('/api/games', async (req, res) => {
  try {
    const gamesRef = db.collection('games');
    const snapshot = await gamesRef.get();
    
    const games = [];
    snapshot.forEach(doc => {
      games.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.json({
      success: true,
      count: games.length,
      data: games,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch games'
    });
  }
});

// 2. GET LEADERBOARD (Public data calculated from predictions)
app.get('/api/leaderboard', async (req, res) => {
  try {
    // Get all predictions (requires admin SDK since rules restrict to auth users)
    const predictionsRef = db.collection('predictions');
    const snapshot = await predictionsRef.get();
    
    // Calculate user scores
    const userScores = {};
    
    snapshot.forEach(doc => {
      const pred = doc.data();
      const userId = pred.userId;
      const points = pred.points || 0;
      
      if (!userScores[userId]) {
        userScores[userId] = {
          userId: userId,
          userName: pred.userName || 'Anonymous',
          userEmail: pred.userEmail || '',
          totalPoints: 0,
          totalPredictions: 0,
          correctPredictions: 0
        };
      }
      
      userScores[userId].totalPoints += points;
      userScores[userId].totalPredictions++;
      if (points > 0) userScores[userId].correctPredictions++;
    });
    
    // Convert to array and sort
    const leaderboard = Object.values(userScores)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 100)
      .map((user, index) => ({
        rank: index + 1,
        ...user
      }));
    
    res.json({
      success: true,
      count: leaderboard.length,
      data: leaderboard,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error calculating leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate leaderboard'
    });
  }
});

// 3. GET PREDICTIONS FOR A GAME
app.get('/api/games/:gameId/predictions', async (req, res) => {
  try {
    const { gameId } = req.params;
    const predictionsRef = db.collection('predictions');
    const snapshot = await predictionsRef
      .where('gameId', '==', gameId)
      .get();
    
    const predictions = [];
    snapshot.forEach(doc => {
      predictions.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.json({
      success: true,
      gameId: gameId,
      count: predictions.length,
      data: predictions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching predictions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch predictions'
    });
  }
});

// 4. GET PLATFORM STATISTICS
app.get('/api/stats', async (req, res) => {
  try {
    const [gamesSnapshot, predictionsSnapshot, usersSnapshot] = await Promise.all([
      db.collection('games').get(),
      db.collection('predictions').get(),
      db.collection('users').get()
    ]);
    
    // Calculate stats
    const totalGames = gamesSnapshot.size;
    const totalPredictions = predictionsSnapshot.size;
    const totalUsers = usersSnapshot.size;
    
    // Calculate average predictions per user
    const avgPredictionsPerUser = totalUsers > 0 ? totalPredictions / totalUsers : 0;
    
    res.json({
      success: true,
      data: {
        totalGames,
        totalPredictions,
        totalUsers,
        avgPredictionsPerUser: avgPredictionsPerUser.toFixed(2),
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// 5. GET USER PROFILE (Public info only)
app.get('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const userData = userDoc.data();
    
    // Only return public information
    const publicProfile = {
      userId: userDoc.id,
      userName: userData.userName || 'Anonymous',
      joinDate: userData.createdAt || null,
      totalPredictions: userData.totalPredictions || 0,
      totalPoints: userData.totalPoints || 0,
      rank: userData.rank || 'Not ranked'
    };
    
    res.json({
      success: true,
      data: publicProfile
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile'
    });
  }
});

// 6. GET UPCOMING GAMES
app.get('/api/games/upcoming', async (req, res) => {
  try {
    const now = new Date();
    const gamesRef = db.collection('games');
    const snapshot = await gamesRef
      .where('date', '>', now.toISOString())
      .orderBy('date', 'asc')
      .limit(20)
      .get();
    
    const games = [];
    snapshot.forEach(doc => {
      games.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.json({
      success: true,
      count: games.length,
      data: games,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching upcoming games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming games'
    });
  }
});

// ============ HEALTH CHECK ============
app.get('/', (req, res) => {
  res.json({
    name: 'Football Predictor API',
    version: '1.0.0',
    status: 'online',
    endpoints: [
      'GET /api/games',
      'GET /api/leaderboard',
      'GET /api/games/:gameId/predictions',
      'GET /api/stats',
      'GET /api/users/:userId',
      'GET /api/games/upcoming'
    ],
    documentation: 'https://xcrazybet.github.io/millioner/fot.html'
  });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Football Predictor API running on port ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  console.log(`📊 Endpoints:`);
  console.log(`   GET /api/games`);
  console.log(`   GET /api/leaderboard`);
  console.log(`   GET /api/stats`);
});
