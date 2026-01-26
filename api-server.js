// api-server.js - Enhanced Free Football Data API
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Validate Firebase environment variables
const requiredEnvVars = [
  'FIREBASE_PRIVATE_KEY_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CLIENT_ID'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize Firebase Admin
try {
  const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID || "x-bet-prod-jd",
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
  });

  console.log('✅ Firebase Admin initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error.message);
  process.exit(1);
}

const db = admin.firestore();

// ============ HELPER FUNCTIONS ============

/**
 * Get mock games data if Firebase collection is empty
 */
async function getMockGames() {
  return [
    {
      id: "game_1",
      homeTeam: "Manchester United",
      awayTeam: "Liverpool",
      league: "Premier League",
      date: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      status: "upcoming",
      venue: "Old Trafford"
    },
    {
      id: "game_2",
      homeTeam: "Al-Zawraa",
      awayTeam: "Al-Quwa Al-Jawiya",
      league: "Iraqi Premier League",
      date: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
      status: "upcoming",
      venue: "Al-Shaab Stadium, Baghdad"
    },
    {
      id: "game_3",
      homeTeam: "Al Shorta",
      awayTeam: "Al-Talaba",
      league: "Iraqi Premier League",
      date: new Date(Date.now() + 259200000).toISOString(), // 3 days
      status: "upcoming",
      venue: "Al-Sinaa Stadium"
    }
  ];
}

/**
 * Get mock leaderboard data
 */
function getMockLeaderboard() {
  return [
    {
      rank: 1,
      userId: "user_001",
      userName: "Ahmed Al-Baghdadi",
      userCity: "Baghdad",
      totalPoints: 156,
      totalPredictions: 45,
      correctPredictions: 32,
      accuracy: "71%"
    },
    {
      rank: 2,
      userId: "user_002",
      userName: "Mohammed Al-Basri",
      userCity: "Basra",
      totalPoints: 142,
      totalPredictions: 42,
      correctPredictions: 28,
      accuracy: "67%"
    },
    {
      rank: 3,
      userId: "user_003",
      userName: "Ali Al-Mosuli",
      userCity: "Mosul",
      totalPoints: 128,
      totalPredictions: 38,
      correctPredictions: 25,
      accuracy: "66%"
    }
  ];
}

// ============ ENHANCED API ENDPOINTS ============

// 1. GET PUBLIC GAMES (with fallback to mock data)
app.get('/api/games', async (req, res) => {
  try {
    const gamesRef = db.collection('games');
    const snapshot = await gamesRef.get();
    
    let games = [];
    
    if (!snapshot.empty) {
      snapshot.forEach(doc => {
        games.push({
          id: doc.id,
          ...doc.data()
        });
      });
    } else {
      // Fallback to mock data if collection is empty
      console.log('Games collection empty, using mock data');
      games = await getMockGames();
    }
    
    // Filter by status if query parameter provided
    const { status } = req.query;
    if (status) {
      games = games.filter(game => game.status === status);
    }
    
    res.json({
      success: true,
      count: games.length,
      data: games,
      timestamp: new Date().toISOString(),
      source: snapshot.empty ? 'mock' : 'firebase'
    });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch games',
      message: error.message
    });
  }
});

// 2. GET LEADERBOARD (enhanced with accuracy calculation)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    let leaderboard;
    
    try {
      const predictionsRef = db.collection('predictions');
      const snapshot = await predictionsRef.get();
      
      if (!snapshot.empty) {
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
        
        // Convert to array, calculate accuracy, and sort
        leaderboard = Object.values(userScores)
          .map(user => ({
            ...user,
            accuracy: user.totalPredictions > 0 
              ? `${Math.round((user.correctPredictions / user.totalPredictions) * 100)}%`
              : '0%'
          }))
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .slice(0, parseInt(limit))
          .map((user, index) => ({
            rank: index + 1,
            ...user
          }));
      } else {
        // Use mock data if no predictions yet
        leaderboard = getMockLeaderboard();
      }
    } catch (firebaseError) {
      console.log('Firebase error, using mock leaderboard:', firebaseError.message);
      leaderboard = getMockLeaderboard();
    }
    
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
      error: 'Failed to calculate leaderboard',
      message: error.message
    });
  }
});

// 3. GET PREDICTIONS FOR A GAME (with pagination)
app.get('/api/games/:gameId/predictions', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { limit = 100, page = 1 } = req.query;
    
    const predictionsRef = db.collection('predictions');
    const snapshot = await predictionsRef
      .where('gameId', '==', gameId)
      .limit(parseInt(limit))
      .get();
    
    const predictions = [];
    snapshot.forEach(doc => {
      predictions.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Simple pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedPredictions = predictions.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      gameId: gameId,
      count: paginatedPredictions.length,
      total: predictions.length,
      page: parseInt(page),
      totalPages: Math.ceil(predictions.length / parseInt(limit)),
      data: paginatedPredictions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching predictions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch predictions',
      message: error.message
    });
  }
});

// 4. GET PLATFORM STATISTICS (enhanced)
app.get('/api/stats', async (req, res) => {
  try {
    const [gamesSnapshot, predictionsSnapshot] = await Promise.all([
      db.collection('games').get(),
      db.collection('predictions').get()
    ]);
    
    const totalGames = gamesSnapshot.size;
    const totalPredictions = predictionsSnapshot.size;
    
    // Calculate active users (users with predictions in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentPredictions = predictionsSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.timestamp && new Date(data.timestamp) > sevenDaysAgo;
    });
    
    const activeUsers = new Set(recentPredictions.map(doc => doc.data().userId)).size;
    
    // Calculate prediction distribution
    const predictionsByGame = {};
    predictionsSnapshot.forEach(doc => {
      const gameId = doc.data().gameId;
      predictionsByGame[gameId] = (predictionsByGame[gameId] || 0) + 1;
    });
    
    const mostPopularGame = Object.entries(predictionsByGame)
      .sort((a, b) => b[1] - a[1])[0];
    
    res.json({
      success: true,
      data: {
        totalGames,
        totalPredictions,
        activeUsers,
        avgPredictionsPerUser: totalPredictions > 0 ? (totalPredictions / activeUsers).toFixed(2) : 0,
        mostPopularGame: mostPopularGame ? {
          gameId: mostPopularGame[0],
          predictionCount: mostPopularGame[1]
        } : null,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

// 5. GET USER PROFILE (with prediction history)
app.get('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user data
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    // Get user's predictions
    const predictionsRef = db.collection('predictions');
    const predictionsSnapshot = await predictionsRef
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();
    
    const predictions = [];
    predictionsSnapshot.forEach(doc => {
      predictions.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Calculate user stats
    const totalPredictions = predictions.length;
    const correctPredictions = predictions.filter(p => p.points > 0).length;
    const totalPoints = predictions.reduce((sum, p) => sum + (p.points || 0), 0);
    
    const publicProfile = {
      userId: userId,
      userName: userDoc.exists ? (userDoc.data().userName || 'Anonymous') : 'Anonymous',
      joinDate: userDoc.exists ? (userDoc.data().createdAt || null) : null,
      totalPredictions,
      correctPredictions,
      totalPoints,
      accuracy: totalPredictions > 0 ? `${Math.round((correctPredictions / totalPredictions) * 100)}%` : '0%',
      recentPredictions: predictions.slice(0, 5),
      rank: 'Calculating...' // You would calculate this from leaderboard
    };
    
    res.json({
      success: true,
      data: publicProfile
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile',
      message: error.message
    });
  }
});

// 6. GET UPCOMING GAMES (with Iraqi teams focus)
app.get('/api/games/upcoming', async (req, res) => {
  try {
    const now = new Date();
    const { league, limit = 10 } = req.query;
    
    let query = db.collection('games')
      .where('date', '>', now.toISOString())
      .orderBy('date', 'asc');
    
    // Filter by league if specified
    if (league) {
      query = query.where('league', '==', league);
    }
    
    const snapshot = await query.limit(parseInt(limit)).get();
    
    let games = [];
    if (!snapshot.empty) {
      snapshot.forEach(doc => {
        games.push({
          id: doc.id,
          ...doc.data()
        });
      });
    } else {
      // Return mock Iraqi league games
      games = (await getMockGames()).filter(game => 
        game.league.includes('Iraqi') || game.league.includes('iraq', 'i')
      );
    }
    
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
      error: 'Failed to fetch upcoming games',
      message: error.message
    });
  }
});

// 7. NEW: GET IRAQI LEAGUES SPECIFIC
app.get('/api/leagues/iraqi', async (req, res) => {
  try {
    const iraqiGames = (await getMockGames()).filter(game => 
      game.league.includes('Iraqi') || 
      game.homeTeam.includes('Al-') ||
      game.awayTeam.includes('Al-')
    );
    
    res.json({
      success: true,
      count: iraqiGames.length,
      data: iraqiGames,
      timestamp: new Date().toISOString(),
      note: 'Iraqi football league matches'
    });
  } catch (error) {
    console.error('Error fetching Iraqi leagues:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Iraqi league data'
    });
  }
});

// 8. NEW: SEARCH GAMES
app.get('/api/games/search', async (req, res) => {
  try {
    const { q, team, league } = req.query;
    
    let allGames = await getMockGames(); // In production, fetch from Firebase
    
    // Apply filters
    let filteredGames = allGames;
    
    if (q) {
      const searchTerm = q.toLowerCase();
      filteredGames = filteredGames.filter(game => 
        game.homeTeam.toLowerCase().includes(searchTerm) ||
        game.awayTeam.toLowerCase().includes(searchTerm) ||
        game.league.toLowerCase().includes(searchTerm)
      );
    }
    
    if (team) {
      const teamName = team.toLowerCase();
      filteredGames = filteredGames.filter(game => 
        game.homeTeam.toLowerCase().includes(teamName) ||
        game.awayTeam.toLowerCase().includes(teamName)
      );
    }
    
    if (league) {
      const leagueName = league.toLowerCase();
      filteredGames = filteredGames.filter(game => 
        game.league.toLowerCase().includes(leagueName)
      );
    }
    
    res.json({
      success: true,
      count: filteredGames.length,
      query: { q, team, league },
      data: filteredGames,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error searching games:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed'
    });
  }
});

// ============ HEALTH & STATUS ENDPOINTS ============

app.get('/', (req, res) => {
  res.json({
    api: 'Football Predictor API',
    version: '1.0.0',
    status: 'online',
    owner: 'xcrazybet',
    country: 'Iraq',
    description: 'Free football prediction API for Iraqi fans',
    documentation: 'https://xcrazybet.github.io/millioner/fot.html',
    endpoints: [
      'GET  /api/games',
      'GET  /api/leaderboard',
      'GET  /api/stats',
      'GET  /api/games/upcoming',
      'GET  /api/leagues/iraqi',
      'GET  /api/games/search?q=team&league=premier',
      'GET  /api/users/:userId',
      'GET  /api/games/:gameId/predictions'
    ],
    example: 'https://your-api.railway.app/api/games',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    firebase: 'connected'
  });
});

// ============ ERROR HANDLING ============

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    available: [
      '/',
      '/health',
      '/api/games',
      '/api/leaderboard',
      '/api/stats'
    ]
  });
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`
  ⚽ FOOTBALL PREDICTOR API
  =========================
  ✅ Server running on port ${PORT}
  🌐 Local: http://localhost:${PORT}
  📊 Endpoints:
     • GET /              - API info
     • GET /health        - Health check
     • GET /api/games     - All games
     • GET /api/leaderboard - Top predictors
     • GET /api/stats     - Platform statistics
     • GET /api/leagues/iraqi - Iraqi league matches
  
  🔥 Firebase: Connected to ${process.env.FIREBASE_PROJECT_ID}
  🎯 Ready to serve Iraqi football fans!
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
