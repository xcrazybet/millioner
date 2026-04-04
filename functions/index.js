const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'x-bet-prod-jd'
});

const db = admin.firestore();

// ==================== SPORTMONKS API CONFIG ====================
const SPORTMONKS_API_TOKEN = "DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy";
const SPORTMONKS_BASE_URL = "https://api.sportmonks.com/v3/football";

// Helper function for Sportmonks API calls
async function callSportmonksAPI(endpoint, params = {}) {
    let url = `${SPORTMONKS_BASE_URL}${endpoint}?api_token=${SPORTMONKS_API_TOKEN}`;
    
    Object.keys(params).forEach(key => {
        if (params[key]) {
            url += `&${key}=${params[key]}`;
        }
    });
    
    console.log(`Calling Sportmonks API: ${endpoint}`);
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        const data = await response.json();
        return { success: true, data: data };
    } catch (error) {
        console.error(`Sportmonks API error (${endpoint}):`, error);
        return { success: false, error: error.message };
    }
}

// ==================== SPORTMONKS FUNCTIONS ====================

// Get live scores/inplay matches
exports.getLiveScores = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const include = data.include || 'participants;scores;state;league';
    const result = await callSportmonksAPI('/livescores/inplay', { include });
    return result;
});

// Get upcoming fixtures
exports.getUpcomingFixtures = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const days = data.days || 'next30days';
    const include = data.include || 'participants;state;league';
    const per_page = data.per_page || 50;
    
    const result = await callSportmonksAPI('/fixtures', { 
        filters: days, 
        include, 
        per_page 
    });
    return result;
});

// Get pre-match odds
exports.getPreMatchOdds = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const include = data.include || 'bookmakers;market';
    const per_page = data.per_page || 200;
    
    const result = await callSportmonksAPI('/odds/pre-match', { include, per_page });
    return result;
});

// Get fixture odds
exports.getFixtureOdds = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const fixtureId = data.fixtureId;
    const include = data.include || 'bookmakers;market';
    
    const result = await callSportmonksAPI(`/fixtures/${fixtureId}/odds`, { include });
    return result;
});

// Get all leagues
exports.getLeagues = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const include = data.include || 'season';
    const result = await callSportmonksAPI('/leagues', { include });
    return result;
});

// Get latest updates (for real-time sync)
exports.getLatestUpdates = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const include = data.include || 'participants;scores;events;odds';
    const result = await callSportmonksAPI('/fixtures/latest', { include });
    return result;
});

// Check API status
exports.checkSportmonksStatus = functions.https.onCall(async (data, context) => {
    const result = await callSportmonksAPI('/leagues', { per_page: 1 });
    return {
        configured: true,
        tokenPreview: SPORTMONKS_API_TOKEN.substring(0, 10) + '...',
        apiWorking: result.success,
        timestamp: new Date().toISOString()
    };
});

// ==================== BETTING FUNCTIONS ====================

// Place a bet
exports.placeBet = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const { selections, stake, betType = 'single' } = data;
    
    if (!selections || !selections.length || selections.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'No selections provided');
    }
    
    if (!stake || stake < 1 || stake > 5000) {
        throw new functions.https.HttpsError('invalid-argument', 'Stake must be $1-$5000');
    }
    
    const userId = context.auth.uid;
    const totalOdds = selections.reduce((acc, sel) => acc * sel.odds, 1);
    const potentialReturn = stake * totalOdds;
    const ticketNumber = `TKT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    try {
        const walletRef = db.collection('wallets').doc(userId);
        
        await db.runTransaction(async (transaction) => {
            const walletDoc = await transaction.get(walletRef);
            
            if (!walletDoc.exists) {
                throw new Error('Wallet not found');
            }
            
            const walletData = walletDoc.data();
            
            if (walletData.balance < stake) {
                throw new Error(`Insufficient balance. Available: $${walletData.balance}`);
            }
            
            const newBalance = walletData.balance - stake;
            
            transaction.update(walletRef, {
                balance: newBalance,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            const betRef = db.collection('football_bets').doc(ticketNumber);
            transaction.set(betRef, {
                ticketNumber: ticketNumber,
                userId: userId,
                selections: selections,
                stake: stake,
                totalOdds: totalOdds,
                potentialReturn: potentialReturn,
                betType: betType,
                status: 'pending',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        
        return {
            success: true,
            ticketNumber: ticketNumber,
            stake: stake,
            totalOdds: totalOdds,
            potentialReturn: potentialReturn,
            message: `Bet placed successfully! Ticket: ${ticketNumber}`
        };
        
    } catch (error) {
        console.error('Place bet failed:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// Get user's open bets
exports.getOpenBets = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const userId = context.auth.uid;
    
    try {
        const betsSnapshot = await db.collection('football_bets')
            .where('userId', '==', userId)
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        
        const bets = [];
        betsSnapshot.forEach(doc => {
            bets.push({ id: doc.id, ...doc.data() });
        });
        
        return {
            success: true,
            bets: bets,
            count: bets.length
        };
        
    } catch (error) {
        console.error('Get open bets failed:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// Get betting history
exports.getBettingHistory = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const userId = context.auth.uid;
    const limit = data.limit || 50;
    
    try {
        const betsSnapshot = await db.collection('football_bets')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        
        const bets = [];
        betsSnapshot.forEach(doc => {
            bets.push({ id: doc.id, ...doc.data() });
        });
        
        return {
            success: true,
            bets: bets,
            count: bets.length
        };
        
    } catch (error) {
        console.error('Get betting history failed:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// Cash out a bet
exports.cashOutBet = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const { ticketNumber } = data;
    
    if (!ticketNumber) {
        throw new functions.https.HttpsError('invalid-argument', 'Ticket number required');
    }
    
    const userId = context.auth.uid;
    
    try {
        const betDoc = await db.collection('football_bets').doc(ticketNumber).get();
        
        if (!betDoc.exists) {
            throw new Error('Bet not found');
        }
        
        const betData = betDoc.data();
        
        if (betData.userId !== userId) {
            throw new Error('Unauthorized');
        }
        
        if (betData.status !== 'pending') {
            throw new Error(`Cannot cash out bet with status: ${betData.status}`);
        }
        
        const cashoutValue = betData.stake * 0.7;
        const walletRef = db.collection('wallets').doc(userId);
        
        await db.runTransaction(async (transaction) => {
            const walletDoc = await transaction.get(walletRef);
            
            if (!walletDoc.exists) {
                throw new Error('Wallet not found');
            }
            
            const newBalance = walletDoc.data().balance + cashoutValue;
            
            transaction.update(walletRef, {
                balance: newBalance,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            transaction.update(db.collection('football_bets').doc(ticketNumber), {
                status: 'cashed_out',
                cashoutValue: cashoutValue,
                cashedOutAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        
        return {
            success: true,
            ticketNumber: ticketNumber,
            cashoutValue: cashoutValue,
            message: `Cashed out for $${cashoutValue.toFixed(2)}`
        };
        
    } catch (error) {
        console.error('Cash out failed:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ==================== WALLET FUNCTIONS ====================

// Create wallet for new user
exports.createUserWallet = functions.auth.user().onCreate(async (user) => {
    try {
        console.log(`Creating wallet for user: ${user.uid}`);
        
        const walletData = {
            userId: user.uid,
            email: user.email || '',
            username: user.email ? user.email.split('@')[0] : `user_${user.uid.substring(0, 8)}`,
            balance: 100.0,
            bonusBalance: 0.0,
            status: 'active',
            currency: 'USD',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            totalDeposited: 0.0,
            totalWithdrawn: 0.0,
            totalWon: 0.0,
            totalLost: 0.0
        };
        
        await db.collection('wallets').doc(user.uid).set(walletData);
        console.log(`Wallet created successfully for ${user.email}`);
        return { success: true, userId: user.uid };
        
    } catch (error) {
        console.error('Error creating wallet:', error);
        return { success: false, error: error.message };
    }
});

// Get user balance
exports.getBalance = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const userId = context.auth.uid;
    
    try {
        const walletDoc = await db.collection('wallets').doc(userId).get();
        
        if (!walletDoc.exists) {
            throw new Error('Wallet not found');
        }
        
        return {
            success: true,
            balance: walletDoc.data().balance,
            currency: walletDoc.data().currency
        };
        
    } catch (error) {
        console.error('Get balance failed:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// Simple function to test deployment
exports.helloWorld = functions.https.onRequest((req, res) => {
    res.json({ message: "Hello from Firebase Functions!", timestamp: new Date().toISOString() });
});
