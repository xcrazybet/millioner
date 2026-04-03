// server.js - Complete betting backend with all missing features
const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const NodeCache = require('node-cache');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Security middleware
app.use(helmet());
app.use(cors({
    origin: ['https://www.xlodon.co.uk', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many requests, please try again later.'
});
app.use('/api/', limiter);

// Cache for API responses (5 seconds as recommended)
const cache = new NodeCache({ stdTTL: 5, checkperiod: 6 });

// Initialize Firebase Admin
const serviceAccount = require('./firebase-key.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// JWT Secret (store in environment variables!)
const JWT_SECRET = 'your-super-secret-jwt-key-change-this';
const SPORTMONKS_TOKEN = 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';

// WebSocket connections for real-time updates
const clients = new Map();

wss.on('connection', (ws, req) => {
    const userId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('userId');
    if (userId) {
        clients.set(userId, ws);
        console.log(`Client ${userId} connected`);
        
        ws.on('close', () => {
            clients.delete(userId);
            console.log(`Client ${userId} disconnected`);
        });
    }
});

// Broadcast real-time updates to specific user
function sendRealTimeUpdate(userId, data) {
    const client = clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
    }
}

// Middleware: Verify JWT
const authenticate = async (req, res, next) => {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Middleware: Check responsible gambling limits
const checkGamblingLimits = async (req, res, next) => {
    const userId = req.user.userId;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    
    const today = new Date().toISOString().split('T')[0];
    const todayBets = await db.collection('bets')
        .where('userId', '==', userId)
        .where('date', '==', today)
        .get();
    
    const todayTotal = todayBets.docs.reduce((sum, doc) => sum + doc.data().stake, 0);
    
    if (userData.dailyLimit && todayTotal >= userData.dailyLimit) {
        return res.status(403).json({ error: 'Daily betting limit reached' });
    }
    
    if (userData.weeklyLimit) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weeklyBets = await db.collection('bets')
            .where('userId', '==', userId)
            .where('createdAt', '>=', weekStart)
            .get();
        const weeklyTotal = weeklyBets.docs.reduce((sum, doc) => sum + doc.data().stake, 0);
        
        if (weeklyTotal >= userData.weeklyLimit) {
            return res.status(403).json({ error: 'Weekly betting limit reached' });
        }
    }
    
    req.userData = userData;
    next();
};

// ============= AUTHENTICATION ENDPOINTS =============

// Register new user
app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body;
    
    try {
        // Check if user exists
        const existingUser = await db.collection('users').where('email', '==', email).get();
        if (!existingUser.empty) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user in Firebase Auth
        const firebaseUser = await admin.auth().createUser({
            email,
            password,
            displayName: name
        });
        
        // Store user in Firestore
        const userData = {
            userId: firebaseUser.uid,
            email,
            name,
            balance: 1000, // Starting balance in credits
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            dailyLimit: null,
            weeklyLimit: null,
            coolOffUntil: null,
            isActive: true,
            totalBets: 0,
            totalWon: 0,
            totalLost: 0
        };
        
        await db.collection('users').doc(firebaseUser.uid).set(userData);
        
        // Generate JWT
        const token = jwt.sign({ userId: firebaseUser.uid, email }, JWT_SECRET, { expiresIn: '24h' });
        
        res.json({ token, user: { id: firebaseUser.uid, email, name, balance: userData.balance } });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // Get Firebase user
        const firebaseUser = await admin.auth().getUserByEmail(email);
        
        // Get user data from Firestore
        const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userDoc.data();
        
        // Check cool-off period
        if (userData.coolOffUntil && userData.coolOffUntil.toDate() > new Date()) {
            return res.status(403).json({ error: 'Account is in cool-off period' });
        }
        
        // Generate JWT
        const token = jwt.sign({ userId: firebaseUser.uid, email }, JWT_SECRET, { expiresIn: '24h' });
        
        res.json({
            token,
            user: {
                id: firebaseUser.uid,
                email: userData.email,
                name: userData.name,
                balance: userData.balance,
                dailyLimit: userData.dailyLimit,
                weeklyLimit: userData.weeklyLimit
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// ============= BETTING ENDPOINTS =============

// Get live fixtures (with caching)
app.get('/api/fixtures/live', authenticate, async (req, res) => {
    const cacheKey = 'live_fixtures';
    let fixtures = cache.get(cacheKey);
    
    if (!fixtures) {
        try {
            const response = await axios.get(
                `https://api.sportmonks.com/v3/football/fixtures/latest?api_token=${SPORTMONKS_TOKEN}&include=participants;scores;events;odds;league`
            );
            fixtures = response.data;
            cache.set(cacheKey, fixtures);
        } catch (error) {
            console.error('Sportmonks API error:', error);
            return res.status(500).json({ error: 'Failed to fetch fixtures' });
        }
    }
    
    res.json(fixtures);
});

// Get fixtures by date
app.get('/api/fixtures/date/:date', authenticate, async (req, res) => {
    const { date } = req.params;
    
    try {
        const response = await axios.get(
            `https://api.sportmonks.com/v3/football/fixtures/date/${date}?api_token=${SPORTMONKS_TOKEN}&include=participants;scores;odds`
        );
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch fixtures' });
    }
});

// Get deleted fixtures for syncing
app.get('/api/fixtures/deleted/:date', authenticate, async (req, res) => {
    const { date } = req.params;
    
    try {
        const response = await axios.get(
            `https://api.sportmonks.com/v3/football/fixtures/date/${date}?api_token=${SPORTMONKS_TOKEN}&filters=deleted`
        );
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch deleted fixtures' });
    }
});

// Place bet with transaction
app.post('/api/bets/place', authenticate, checkGamblingLimits, async (req, res) => {
    const { fixtureId, odds, stake, betType, selection } = req.body;
    const userId = req.user.userId;
    
    // Validation
    if (!fixtureId || !odds || !stake || !betType) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (stake < 0.5) {
        return res.status(400).json({ error: 'Minimum stake is £0.50' });
    }
    
    if (stake > 1000) {
        return res.status(400).json({ error: 'Maximum stake is £1000' });
    }
    
    try {
        // Run Firestore transaction
        const result = await db.runTransaction(async (transaction) => {
            // Get user with current balance
            const userRef = db.collection('users').doc(userId);
            const userDoc = await transaction.get(userRef);
            
            if (!userDoc.exists) {
                throw new Error('User not found');
            }
            
            const currentBalance = userDoc.data().balance;
            
            if (currentBalance < stake) {
                throw new Error('Insufficient balance');
            }
            
            // Verify fixture is still active from Sportmonks
            const fixtureCheck = await axios.get(
                `https://api.sportmonks.com/v3/football/fixtures/${fixtureId}?api_token=${SPORTMONKS_TOKEN}&include=state`
            );
            
            const fixtureState = fixtureCheck.data.data.state;
            if (fixtureState !== 'inplay' && fixtureState !== 'scheduled') {
                throw new Error('Fixture is not available for betting');
            }
            
            // Calculate potential win
            const potentialWin = (stake * odds).toFixed(2);
            
            // Create bet
            const betRef = db.collection('bets').doc();
            const betData = {
                betId: betRef.id,
                userId,
                fixtureId,
                odds: parseFloat(odds),
                stake: parseFloat(stake),
                betType,
                selection,
                potentialWin: parseFloat(potentialWin),
                status: 'active',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                date: new Date().toISOString().split('T')[0],
                fixtureName: fixtureCheck.data.data.name || 'Unknown Fixture'
            };
            
            // Deduct balance and save bet
            transaction.update(userRef, { 
                balance: currentBalance - stake,
                totalBets: admin.firestore.FieldValue.increment(1)
            });
            transaction.set(betRef, betData);
            
            return { betId: betRef.id, newBalance: currentBalance - stake, betData };
        });
        
        // Send real-time notification via WebSocket
        sendRealTimeUpdate(userId, {
            type: 'bet_placed',
            betId: result.betId,
            stake: stake,
            potentialWin: result.betData.potentialWin,
            newBalance: result.newBalance
        });
        
        res.json({
            success: true,
            betId: result.betId,
            newBalance: result.newBalance,
            potentialWin: result.betData.potentialWin
        });
        
    } catch (error) {
        console.error('Bet placement error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Get user's active bets
app.get('/api/bets/active', authenticate, async (req, res) => {
    const userId = req.user.userId;
    
    try {
        const betsSnapshot = await db.collection('bets')
            .where('userId', '==', userId)
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        
        const bets = betsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        res.json(bets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bets' });
    }
});

// Get user's bet history
app.get('/api/bets/history', authenticate, async (req, res) => {
    const userId = req.user.userId;
    const { limit = 100, status } = req.query;
    
    try {
        let query = db.collection('bets')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(parseInt(limit));
        
        if (status) {
            query = query.where('status', '==', status);
        }
        
        const betsSnapshot = await query.get();
        const bets = betsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        res.json(bets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bet history' });
    }
});

// ============= USER MANAGEMENT =============

// Get user balance and stats
app.get('/api/user/balance', authenticate, async (req, res) => {
    const userId = req.user.userId;
    
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userDoc.data();
        
        // Get today's betting summary
        const today = new Date().toISOString().split('T')[0];
        const todayBets = await db.collection('bets')
            .where('userId', '==', userId)
            .where('date', '==', today)
            .get();
        
        const todayStats = {
            totalStake: todayBets.docs.reduce((sum, doc) => sum + doc.data().stake, 0),
            betCount: todayBets.size,
            activeBets: todayBets.docs.filter(doc => doc.data().status === 'active').length
        };
        
        res.json({
            balance: userData.balance,
            totalBets: userData.totalBets || 0,
            totalWon: userData.totalWon || 0,
            totalLost: userData.totalLost || 0,
            dailyLimit: userData.dailyLimit,
            weeklyLimit: userData.weeklyLimit,
            todayStats
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

// Set responsible gambling limits
app.post('/api/user/limits', authenticate, async (req, res) => {
    const { dailyLimit, weeklyLimit } = req.body;
    const userId = req.user.userId;
    
    try {
        await db.collection('users').doc(userId).update({
            dailyLimit: dailyLimit || null,
            weeklyLimit: weeklyLimit || null,
            limitsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({ success: true, message: 'Limits updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update limits' });
    }
});

// Cool-off period (temporary self-exclusion)
app.post('/api/user/cooloff', authenticate, async (req, res) => {
    const { days } = req.body; // 1, 7, 30 days
    const userId = req.user.userId;
    
    const coolOffUntil = new Date();
    coolOffUntil.setDate(coolOffUntil.getDate() + days);
    
    try {
        await db.collection('users').doc(userId).update({
            coolOffUntil: admin.firestore.Timestamp.fromDate(coolOffUntil),
            isActive: false
        });
        
        res.json({ 
            success: true, 
            message: `Account cooled off until ${coolOffUntil.toLocaleDateString()}` 
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to set cool-off period' });
    }
});

// ============= ADMIN ENDPOINTS (Protected) =============

// Admin middleware
const isAdmin = async (req, res, next) => {
    const userDoc = await db.collection('users').doc(req.user.userId).get();
    if (userDoc.data().role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Get all users (admin only)
app.get('/api/admin/users', authenticate, isAdmin, async (req, res) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        const users = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            password: undefined // Remove sensitive data
        }));
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get platform stats (admin only)
app.get('/api/admin/stats', authenticate, isAdmin, async (req, res) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        const betsSnapshot = await db.collection('bets').get();
        
        const totalBets = betsSnapshot.size;
        const totalStake = betsSnapshot.docs.reduce((sum, doc) => sum + doc.data().stake, 0);
        const totalPayouts = betsSnapshot.docs
            .filter(doc => doc.data().status === 'won')
            .reduce((sum, doc) => sum + (doc.data().potentialWin || 0), 0);
        
        const activeBets = betsSnapshot.docs.filter(doc => doc.data().status === 'active').length;
        
        res.json({
            totalUsers: usersSnapshot.size,
            totalBets,
            totalStake,
            totalPayouts,
            activeBets,
            platformProfit: totalStake - totalPayouts
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ============= BET SETTLEMENT SYSTEM =============

// Background job: Settle completed matches (run every minute)
async function settleMatches() {
    console.log('Running bet settlement check...');
    
    try {
        // Get active bets
        const activeBets = await db.collection('bets')
            .where('status', '==', 'active')
            .get();
        
        for (const betDoc of activeBets.docs) {
            const bet = betDoc.data();
            
            // Check fixture status from Sportmonks
            try {
                const response = await axios.get(
                    `https://api.sportmonks.com/v3/football/fixtures/${bet.fixtureId}?api_token=${SPORTMONKS_TOKEN}&include=scores;state`
                );
                
                const fixture = response.data.data;
                const state = fixture.state;
                
                if (state === 'finished') {
                    // Determine if bet won (simplified - implement actual logic based on bet type)
                    const homeScore = fixture.scores?.find(s => s.type === 'home')?.score || 0;
                    const awayScore = fixture.scores?.find(s => s.type === 'away')?.score || 0;
                    
                    let isWin = false;
                    // Implement win logic based on betType
                    if (bet.betType === 'match_winner') {
                        if (bet.selection === 'home' && homeScore > awayScore) isWin = true;
                        else if (bet.selection === 'away' && awayScore > homeScore) isWin = true;
                        else if (bet.selection === 'draw' && homeScore === awayScore) isWin = true;
                    }
                    
                    await db.runTransaction(async (transaction) => {
                        if (isWin) {
                            // Update user balance with winnings
                            const userRef = db.collection('users').doc(bet.userId);
                            const userDoc = await transaction.get(userRef);
                            const newBalance = userDoc.data().balance + bet.potentialWin;
                            
                            transaction.update(userRef, { 
                                balance: newBalance,
                                totalWon: admin.firestore.FieldValue.increment(bet.potentialWin)
                            });
                            transaction.update(betDoc.ref, { 
                                status: 'won',
                                settledAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            
                            // Send notification
                            sendRealTimeUpdate(bet.userId, {
                                type: 'bet_won',
                                betId: bet.betId,
                                amount: bet.potentialWin,
                                newBalance
                            });
                        } else {
                            // Bet lost
                            transaction.update(betDoc.ref, { 
                                status: 'lost',
                                settledAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            await db.collection('users').doc(bet.userId).update({
                                totalLost: admin.firestore.FieldValue.increment(bet.stake)
                            });
                            
                            sendRealTimeUpdate(bet.userId, {
                                type: 'bet_lost',
                                betId: bet.betId,
                                stake: bet.stake
                            });
                        }
                    });
                }
            } catch (error) {
                console.error(`Error settling bet ${bet.betId}:`, error.message);
            }
        }
    } catch (error) {
        console.error('Settlement job error:', error);
    }
}

// Run settlement every minute
setInterval(settleMatches, 60000);

// ============= START SERVER =============
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Betting server running on port ${PORT}`);
    console.log(`WebSocket server ready for real-time updates`);
});
