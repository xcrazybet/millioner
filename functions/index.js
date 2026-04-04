const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialize with your project
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'x-bet-prod-jd'
});

const db = admin.firestore();
const auth = admin.auth();

// ==================== SPORTMONKS API CONFIGURATION ====================
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
  // Optional: Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { include = 'participants;scores;state;league' } = data;
  const result = await callSportmonksAPI('/livescores/inplay', { include });
  return result;
});

// Get upcoming fixtures
exports.getUpcomingFixtures = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { days = 'next30days', include = 'participants;state;league', per_page = 50 } = data;
  const result = await callSportmonksAPI('/fixtures', { 
    filters: days, 
    include, 
    per_page 
  });
  return result;
});

// Get fixture odds
exports.getFixtureOdds = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { fixtureId, include = 'bookmakers;market' } = data;
  const result = await callSportmonksAPI(`/fixtures/${fixtureId}/odds`, { include });
  return result;
});

// Get pre-match odds
exports.getPreMatchOdds = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { include = 'bookmakers;market', per_page = 100 } = data;
  const result = await callSportmonksAPI('/odds/pre-match', { include, per_page });
  return result;
});

// Get all leagues
exports.getLeagues = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { include = 'season' } = data;
  const result = await callSportmonksAPI('/leagues', { include });
  return result;
});

// Get latest updates (for real-time sync)
exports.getLatestUpdates = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { include = 'participants;scores;events;odds' } = data;
  const result = await callSportmonksAPI('/fixtures/latest', { include });
  return result;
});

// Get standings/table
exports.getStandings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { leagueId, seasonId, include = 'participants' } = data;
  let endpoint = '/standings';
  if (leagueId) endpoint = `/standings/leagues/${leagueId}`;
  if (seasonId) endpoint = `/standings/seasons/${seasonId}`;
  
  const result = await callSportmonksAPI(endpoint, { include });
  return result;
});

// Get top scorers
exports.getTopScorers = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { seasonId = '2026', include = 'player;team' } = data;
  const result = await callSportmonksAPI(`/topscorers/seasons/${seasonId}`, { include });
  return result;
});

// Get team info
exports.getTeamInfo = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { teamId, include = 'squad;coach;venue' } = data;
  const result = await callSportmonksAPI(`/teams/${teamId}`, { include });
  return result;
});

// Get match statistics
exports.getMatchStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { fixtureId } = data;
  const result = await callSportmonksAPI(`/fixtures/${fixtureId}/statistics`);
  return result;
});

// HTTP endpoint for direct API access (bypasses CORS)
exports.sportmonksProxy = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  const endpoint = req.path;
  let url = `${SPORTMONKS_BASE_URL}${endpoint}?api_token=${SPORTMONKS_API_TOKEN}`;
  
  // Forward query parameters
  Object.keys(req.query).forEach(key => {
    if (key !== 'api_token') {
      url += `&${key}=${req.query[key]}`;
    }
  });
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Diagnostic function to check API status
exports.checkSportmonksStatus = functions.https.onCall(async (data, context) => {
  const result = await callSportmonksAPI('/leagues', { per_page: 1 });
  return {
    configured: true,
    tokenPreview: SPORTMONKS_API_TOKEN.substring(0, 10) + '...',
    apiWorking: result.success,
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  };
});

// ==================== WALLET & BETTING CONFIGURATION ====================
const CONFIG = {
  MIN_DEPOSIT: 10,
  MAX_DEPOSIT: 10000,
  MIN_WITHDRAWAL: 20,
  MAX_WITHDRAWAL: 5000,
  DAILY_WITHDRAWAL_LIMIT: 10000,
  MAX_ADJUSTMENT: 1000000,
  MIN_BET: 1,
  MAX_BET: 5000,
  CURRENCIES: ['USD', 'EUR', 'GBP'],
  PAYMENT_METHODS: ['bank_transfer', 'credit_card', 'crypto', 'paypal']
};

// ==================== HELPER FUNCTIONS ====================
async function validateAdmin(context, requiredRole = null) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  try {
    const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
    
    if (!adminDoc.exists || !adminDoc.data().active) {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
    
    const adminData = adminDoc.data();
    
    // Role hierarchy check
    if (requiredRole) {
      const roleHierarchy = {
        'super_admin': 100,
        'finance': 75,
        'support': 50,
        'moderator': 25
      };
      
      const userLevel = roleHierarchy[adminData.role] || 0;
      const requiredLevel = roleHierarchy[requiredRole] || 0;
      
      if (userLevel < requiredLevel) {
        throw new functions.https.HttpsError(
          'permission-denied', 
          `Insufficient permissions. Required role: ${requiredRole}`
        );
      }
    }
    
    return adminData;
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Unable to verify admin status');
  }
}

function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

async function logAdminAction(adminId, action, data) {
  try {
    await db.collection('admin_logs').add({
      adminId,
      action,
      ...data,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}

// ==================== WALLET CREATION ====================
exports.createUserWallet = functions.auth.user().onCreate(async (user) => {
  try {
    console.log(`Creating wallet for user: ${user.uid}`);
    
    const walletData = {
      userId: user.uid,
      email: user.email || '',
      phone: user.phoneNumber || '',
      username: user.email ? user.email.split('@')[0] : `user_${user.uid.substring(0, 8)}`,
      balance: 0.0,
      bonusBalance: 0.0,
      status: 'active',
      kycStatus: 'pending',
      currency: 'USD',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: null,
      totalDeposited: 0.0,
      totalWithdrawn: 0.0,
      totalWon: 0.0,
      totalLost: 0.0,
      totalTransferred: 0.0,
      totalReceived: 0.0,
      referralCode: generateId().substring(0, 8).toUpperCase(),
      referredBy: null,
      vipLevel: 0
    };
    
    await db.collection('wallets').doc(user.uid).set(walletData);
    
    console.log(`Wallet created successfully for ${user.email}`);
    return { success: true, userId: user.uid };
    
  } catch (error) {
    console.error(`Error creating wallet:`, error);
    throw error;
  }
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
  
  if (!stake || stake < CONFIG.MIN_BET || stake > CONFIG.MAX_BET) {
    throw new functions.https.HttpsError('invalid-argument', `Stake must be $${CONFIG.MIN_BET}-$${CONFIG.MAX_BET}`);
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
      
      // Create bet document
      const betRef = db.collection('football_bets').doc(ticketNumber);
      transaction.set(betRef, {
        ticketNumber,
        userId,
        selections,
        stake,
        totalOdds,
        potentialReturn,
        betType,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    return {
      success: true,
      ticketNumber,
      stake,
      totalOdds,
      potentialReturn,
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
      bets,
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
  const { limit = 50, status = null } = data;
  
  try {
    let query = db.collection('football_bets')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit);
    
    if (status && ['won', 'lost', 'cashed_out', 'pending'].includes(status)) {
      query = query.where('status', '==', status);
    }
    
    const betsSnapshot = await query.get();
    
    const bets = [];
    betsSnapshot.forEach(doc => {
      bets.push({ id: doc.id, ...doc.data() });
    });
    
    return {
      success: true,
      bets,
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
    
    const cashoutValue = betData.stake * 0.7; // 70% cashout value
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
        cashoutValue,
        cashedOutAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    return {
      success: true,
      ticketNumber,
      cashoutValue,
      message: `Cashed out for $${cashoutValue.toFixed(2)}`
    };
    
  } catch (error) {
    console.error('Cash out failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== EXISTING WALLET FUNCTIONS (YOUR ORIGINAL CODE) ====================

exports.transferToUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { toUserId, amount, note = '' } = data;
  
  if (!toUserId || !amount || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parameters');
  }
  
  if (amount > 10000) {
    throw new functions.https.HttpsError('invalid-argument', 'Maximum transfer is $10,000');
  }
  
  const fromUserId = context.auth.uid;
  
  if (fromUserId === toUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot transfer to yourself');
  }
  
  try {
    const [fromWalletDoc, toWalletDoc] = await Promise.all([
      db.collection('wallets').doc(fromUserId).get(),
      db.collection('wallets').doc(toUserId).get()
    ]);
    
    if (!fromWalletDoc.exists || !toWalletDoc.exists) {
      throw new Error('One or both wallets not found');
    }
    
    const fromWallet = fromWalletDoc.data();
    const toWallet = toWalletDoc.data();
    
    if (fromWallet.balance < amount) {
      throw new Error(`Insufficient balance. Available: $${fromWallet.balance}`);
    }
    
    if (toWallet.status !== 'active') {
      throw new Error('Recipient wallet is not active');
    }
    
    const newFromBalance = fromWallet.balance - amount;
    const newToBalance = toWallet.balance + amount;
    const transactionId = generateId();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    await db.runTransaction(async (transaction) => {
      const fromRef = db.collection('wallets').doc(fromUserId);
      const toRef = db.collection('wallets').doc(toUserId);
      
      transaction.update(fromRef, {
        balance: newFromBalance,
        totalTransferred: (fromWallet.totalTransferred || 0) + amount,
        updatedAt: timestamp
      });
      
      transaction.update(toRef, {
        balance: newToBalance,
        totalReceived: (toWallet.totalReceived || 0) + amount,
        updatedAt: timestamp
      });
      
      transaction.set(db.collection('transactions').doc(`${transactionId}_out`), {
        transactionId,
        userId: fromUserId,
        type: 'transfer_out',
        toUserId,
        amount,
        note,
        previousBalance: fromWallet.balance,
        newBalance: newFromBalance,
        status: 'completed',
        timestamp
      });
      
      transaction.set(db.collection('transactions').doc(`${transactionId}_in`), {
        transactionId,
        userId: toUserId,
        type: 'transfer_in',
        fromUserId,
        amount,
        note,
        previousBalance: toWallet.balance,
        newBalance: newToBalance,
        status: 'completed',
        timestamp
      });
    });
    
    await db.collection('notifications').add({
      userId: toUserId,
      type: 'transfer_received',
      title: 'Money Received!',
      message: `You received $${amount.toFixed(2)} from ${fromWallet.email}`,
      data: { fromUserId, amount, transactionId },
      read: false,
      timestamp
    });
    
    return {
      success: true,
      transactionId,
      amount,
      fromNewBalance: newFromBalance,
      toNewBalance: newToBalance,
      message: `Transferred $${amount.toFixed(2)} to ${toWallet.email}`
    };
    
  } catch (error) {
    console.error('Transfer failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Create deposit request
exports.createDepositRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { amount, paymentMethod, currency = 'USD', reference = '' } = data;
  
  if (!amount || amount < CONFIG.MIN_DEPOSIT || amount > CONFIG.MAX_DEPOSIT) {
    throw new functions.https.HttpsError('invalid-argument', `Amount must be $${CONFIG.MIN_DEPOSIT}-$${CONFIG.MAX_DEPOSIT}`);
  }
  
  if (!CONFIG.PAYMENT_METHODS.includes(paymentMethod)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid payment method');
  }
  
  const userId = context.auth.uid;
  
  try {
    const walletDoc = await db.collection('wallets').doc(userId).get();
    if (!walletDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const walletData = walletDoc.data();
    const requestId = generateId();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    await db.collection('deposit_requests').doc(requestId).set({
      requestId,
      userId,
      userEmail: walletData.email,
      amount: parseFloat(amount),
      currency,
      paymentMethod,
      reference,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp
    });
    
    await db.collection('transactions').add({
      transactionId: generateId(),
      userId,
      type: 'deposit_request',
      amount: parseFloat(amount),
      currency,
      paymentMethod,
      requestId,
      status: 'pending',
      timestamp
    });
    
    return {
      success: true,
      requestId,
      amount: parseFloat(amount),
      status: 'pending',
      message: 'Deposit request created. Please complete payment.'
    };
    
  } catch (error) {
    console.error('Create deposit failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Process deposit (Admin only)
exports.processDeposit = functions.https.onCall(async (data, context) => {
  const adminData = await validateAdmin(context, 'finance');
  
  const { requestId, action, notes = '' } = data;
  
  if (!requestId || !['approve', 'reject'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parameters');
  }
  
  try {
    const requestDoc = await db.collection('deposit_requests').doc(requestId).get();
    if (!requestDoc.exists) {
      throw new Error('Deposit request not found');
    }
    
    const requestData = requestDoc.data();
    
    if (requestData.status !== 'pending') {
      throw new Error(`Request already ${requestData.status}`);
    }
    
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    if (action === 'approve') {
      const walletDoc = await db.collection('wallets').doc(requestData.userId).get();
      if (!walletDoc.exists) {
        throw new Error('Wallet not found');
      }
      
      const walletData = walletDoc.data();
      const newBalance = walletData.balance + requestData.amount;
      
      await db.runTransaction(async (transaction) => {
        transaction.update(db.collection('deposit_requests').doc(requestId), {
          status: newStatus,
          processedBy: context.auth.uid,
          processedByEmail: adminData.email,
          processedAt: timestamp,
          notes,
          updatedAt: timestamp
        });
        
        transaction.update(db.collection('wallets').doc(requestData.userId), {
          balance: newBalance,
          totalDeposited: (walletData.totalDeposited || 0) + requestData.amount,
          updatedAt: timestamp
        });
        
        transaction.set(db.collection('transactions').doc(), {
          transactionId: generateId(),
          userId: requestData.userId,
          type: 'deposit',
          amount: requestData.amount,
          currency: requestData.currency || 'USD',
          requestId,
          previousBalance: walletData.balance,
          newBalance,
          status: 'completed',
          processedBy: context.auth.uid,
          timestamp
        });
      });
      
      await db.collection('notifications').add({
        userId: requestData.userId,
        type: 'deposit_approved',
        title: 'Deposit Approved!',
        message: `Your deposit of $${requestData.amount.toFixed(2)} was approved`,
        data: { requestId, amount: requestData.amount, newBalance },
        read: false,
        timestamp
      });
      
      await logAdminAction(context.auth.uid, 'deposit_approved', {
        requestId,
        userId: requestData.userId,
        amount: requestData.amount
      });
      
      return {
        success: true,
        action: 'approved',
        amount: requestData.amount,
        newBalance,
        message: `Deposit approved. New balance: $${newBalance.toFixed(2)}`
      };
      
    } else {
      await db.collection('deposit_requests').doc(requestId).update({
        status: newStatus,
        processedBy: context.auth.uid,
        processedByEmail: adminData.email,
        processedAt: timestamp,
        notes,
        updatedAt: timestamp
      });
      
      await db.collection('notifications').add({
        userId: requestData.userId,
        type: 'deposit_rejected',
        title: 'Deposit Rejected',
        message: `Your deposit of $${requestData.amount.toFixed(2)} was rejected`,
        data: { requestId, amount: requestData.amount, reason: notes },
        read: false,
        timestamp
      });
      
      return {
        success: true,
        action: 'rejected',
        message: 'Deposit request rejected'
      };
    }
    
  } catch (error) {
    console.error('Process deposit failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Create withdrawal request
exports.createWithdrawalRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { amount, walletAddress, network = 'ETH', notes = '' } = data;
  
  if (!amount || amount < CONFIG.MIN_WITHDRAWAL || amount > CONFIG.MAX_WITHDRAWAL) {
    throw new functions.https.HttpsError('invalid-argument', `Amount must be $${CONFIG.MIN_WITHDRAWAL}-$${CONFIG.MAX_WITHDRAWAL}`);
  }
  
  if (!walletAddress || walletAddress.length < 26) {
    throw new functions.https.HttpsError('invalid-argument', 'Valid wallet address required');
  }
  
  const userId = context.auth.uid;
  
  try {
    const walletDoc = await db.collection('wallets').doc(userId).get();
    if (!walletDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const walletData = walletDoc.data();
    
    if (walletData.balance < amount) {
      throw new Error(`Insufficient balance. Available: $${walletData.balance}`);
    }
    
    const withdrawalId = generateId();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    await db.collection('withdrawals').doc(withdrawalId).set({
      withdrawalId,
      userId,
      userEmail: walletData.email,
      amount: parseFloat(amount),
      walletAddress,
      network,
      notes,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp
    });
    
    return {
      success: true,
      withdrawalId,
      amount: parseFloat(amount),
      status: 'pending',
      message: 'Withdrawal request created. Waiting for admin approval.'
    };
    
  } catch (error) {
    console.error('Create withdrawal failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Process withdrawal (Admin only)
exports.processWithdrawal = functions.https.onCall(async (data, context) => {
  const adminData = await validateAdmin(context, 'finance');
  
  const { withdrawalId, action, txHash = '', notes = '' } = data;
  
  if (!withdrawalId || !['approve', 'reject'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parameters');
  }
  
  if (action === 'approve' && !txHash) {
    throw new functions.https.HttpsError('invalid-argument', 'Transaction hash required');
  }
  
  try {
    const withdrawalDoc = await db.collection('withdrawals').doc(withdrawalId).get();
    if (!withdrawalDoc.exists) {
      throw new Error('Withdrawal request not found');
    }
    
    const withdrawalData = withdrawalDoc.data();
    
    if (withdrawalData.status !== 'pending') {
      throw new Error(`Withdrawal already ${withdrawalData.status}`);
    }
    
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    if (action === 'approve') {
      const walletDoc = await db.collection('wallets').doc(withdrawalData.userId).get();
      if (!walletDoc.exists) {
        throw new Error('Wallet not found');
      }
      
      const walletData = walletDoc.data();
      
      if (walletData.balance < withdrawalData.amount) {
        throw new Error('Insufficient balance for withdrawal');
      }
      
      const newBalance = walletData.balance - withdrawalData.amount;
      
      await db.runTransaction(async (transaction) => {
        transaction.update(db.collection('withdrawals').doc(withdrawalId), {
          status: newStatus,
          processedBy: context.auth.uid,
          processedByEmail: adminData.email,
          processedAt: timestamp,
          txHash,
          notes,
          updatedAt: timestamp
        });
        
        transaction.update(db.collection('wallets').doc(withdrawalData.userId), {
          balance: newBalance,
          totalWithdrawn: (walletData.totalWithdrawn || 0) + withdrawalData.amount,
          updatedAt: timestamp
        });
        
        transaction.set(db.collection('transactions').doc(), {
          transactionId: generateId(),
          userId: withdrawalData.userId,
          type: 'withdrawal',
          amount: withdrawalData.amount,
          walletAddress: withdrawalData.walletAddress,
          network: withdrawalData.network || 'ETH',
          withdrawalId,
          txHash,
          previousBalance: walletData.balance,
          newBalance,
          status: 'completed',
          processedBy: context.auth.uid,
          timestamp
        });
      });
      
      await db.collection('notifications').add({
        userId: withdrawalData.userId,
        type: 'withdrawal_approved',
        title: 'Withdrawal Approved!',
        message: `Your withdrawal of $${withdrawalData.amount.toFixed(2)} was processed`,
        data: { withdrawalId, amount: withdrawalData.amount, txHash, newBalance },
        read: false,
        timestamp
      });
      
      await logAdminAction(context.auth.uid, 'withdrawal_approved', {
        withdrawalId,
        userId: withdrawalData.userId,
        amount: withdrawalData.amount,
        txHash
      });
      
      return {
        success: true,
        action: 'approved',
        amount: withdrawalData.amount,
        txHash,
        newBalance,
        message: `Withdrawal approved. TX: ${txHash}`
      };
      
    } else {
      await db.collection('withdrawals').doc(withdrawalId).update({
        status: newStatus,
        processedBy: context.auth.uid,
        processedByEmail: adminData.email,
        processedAt: timestamp,
        notes,
        updatedAt: timestamp
      });
      
      await db.collection('notifications').add({
        userId: withdrawalData.userId,
        type: 'withdrawal_rejected',
        title: 'Withdrawal Rejected',
        message: `Your withdrawal of $${withdrawalData.amount.toFixed(2)} was rejected`,
        data: { withdrawalId, amount: withdrawalData.amount, reason: notes },
        read: false,
        timestamp
      });
      
      return {
        success: true,
        action: 'rejected',
        message: 'Withdrawal request rejected'
      };
    }
    
  } catch (error) {
    console.error('Process withdrawal failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Admin balance adjustment
exports.adminAdjustBalance = functions.https.onCall(async (data, context) => {
  const adminData = await validateAdmin(context, 'finance');
  
  const { userId, amount, action, reason = 'Admin adjustment', notes = '' } = data;
  
  if (!userId || typeof amount !== 'number' || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parameters');
  }
  
  if (!['add', 'subtract', 'set'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid action type');
  }
  
  if (amount > CONFIG.MAX_ADJUSTMENT) {
    throw new functions.https.HttpsError('invalid-argument', `Amount exceeds maximum limit of $${CONFIG.MAX_ADJUSTMENT}`);
  }
  
  try {
    const walletDoc = await db.collection('wallets').doc(userId).get();
    if (!walletDoc.exists) {
      throw new Error('User wallet not found');
    }
    
    const walletData = walletDoc.data();
    let newBalance = walletData.balance;
    let change = 0;
    
    switch (action) {
      case 'add':
        newBalance = walletData.balance + amount;
        change = amount;
        break;
      case 'subtract':
        if (walletData.balance < amount) {
          throw new Error(`Insufficient balance. Available: $${walletData.balance}`);
        }
        newBalance = walletData.balance - amount;
        change = -amount;
        break;
      case 'set':
        newBalance = amount;
        change = amount - walletData.balance;
        break;
    }
    
    if (newBalance < 0) {
      throw new Error('Balance cannot be negative');
    }
    
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    await db.runTransaction(async (transaction) => {
      transaction.update(db.collection('wallets').doc(userId), {
        balance: newBalance,
        updatedAt: timestamp
      });
      
      transaction.set(db.collection('transactions').doc(), {
        transactionId: generateId(),
        userId,
        type: 'admin_adjustment',
        action,
        amount: Math.abs(change),
        change,
        reason,
        notes,
        previousBalance: walletData.balance,
        newBalance,
        adminId: context.auth.uid,
        adminEmail: adminData.email,
        status: 'completed',
        timestamp
      });
    });
    
    await db.collection('notifications').add({
      userId,
      type: 'balance_adjusted',
      title: 'Balance Adjusted',
      message: `Your balance was ${action === 'add' ? 'increased' : action === 'subtract' ? 'decreased' : 'set'} by $${Math.abs(change).toFixed(2)}`,
      data: { action, amount: Math.abs(change), newBalance, reason },
      read: false,
      timestamp
    });
    
    await logAdminAction(context.auth.uid, 'balance_adjustment', {
      userId,
      action,
      amount: Math.abs(change),
      previousBalance: walletData.balance,
      newBalance,
      reason
    });
    
    return {
      success: true,
      action,
      amount: Math.abs(change),
      previousBalance: walletData.balance,
      newBalance,
      message: `Balance ${action}ed successfully`
    };
    
  } catch (error) {
    console.error('Balance adjustment failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Admin send to user
exports.adminSendToUser = functions.https.onCall(async (data, context) => {
  const adminData = await validateAdmin(context, 'finance');
  
  const { userId, amount, reason = 'Admin credit', notes = '' } = data;
  
  if (!userId || !amount || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parameters');
  }
  
  if (amount > 50000) {
    throw new functions.https.HttpsError('invalid-argument', 'Maximum amount is $50,000');
  }
  
  try {
    const walletDoc = await db.collection('wallets').doc(userId).get();
    if (!walletDoc.exists) {
      throw new Error('User wallet not found');
    }
    
    const walletData = walletDoc.data();
    const newBalance = walletData.balance + amount;
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    await db.runTransaction(async (transaction) => {
      transaction.update(db.collection('wallets').doc(userId), {
        balance: newBalance,
        totalReceived: (walletData.totalReceived || 0) + amount,
        updatedAt: timestamp
      });
      
      transaction.set(db.collection('transactions').doc(), {
        transactionId: generateId(),
        userId,
        type: 'admin_credit',
        amount,
        reason,
        notes,
        previousBalance: walletData.balance,
        newBalance,
        adminId: context.auth.uid,
        adminEmail: adminData.email,
        status: 'completed',
        timestamp
      });
    });
    
    await db.collection('notifications').add({
      userId,
      type: 'admin_credit',
      title: 'Funds Received!',
      message: `You received $${amount.toFixed(2)} from admin`,
      data: { amount, reason, newBalance, adminEmail: adminData.email },
      read: false,
      timestamp
    });
    
    await logAdminAction(context.auth.uid, 'admin_send', {
      userId,
      amount,
      reason,
      previousBalance: walletData.balance,
      newBalance
    });
    
    return {
      success: true,
      amount,
      newBalance,
      message: `Sent $${amount.toFixed(2)} to user successfully`
    };
    
  } catch (error) {
    console.error('Admin send failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get pending requests (Admin only)
exports.getPendingRequests = functions.https.onCall(async (data, context) => {
  await validateAdmin(context, 'support');
  
  try {
    const [depositRequests, withdrawalRequests] = await Promise.all([
      db.collection('deposit_requests')
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get(),
      db.collection('withdrawals')
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
    ]);
    
    const deposits = [];
    const withdrawals = [];
    
    depositRequests.forEach(doc => {
      deposits.push({ id: doc.id, ...doc.data() });
    });
    
    withdrawalRequests.forEach(doc => {
      withdrawals.push({ id: doc.id, ...doc.data() });
    });
    
    return {
      success: true,
      deposits,
      withdrawals,
      counts: {
        deposits: deposits.length,
        withdrawals: withdrawals.length,
        total: deposits.length + withdrawals.length
      }
    };
    
  } catch (error) {
    console.error('Get pending requests failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get user stats (Admin only)
exports.getUserStats = functions.https.onCall(async (data, context) => {
  await validateAdmin(context, 'support');
  
  try {
    const [totalUsers, activeUsers, totalDeposits, totalWithdrawals] = await Promise.all([
      db.collection('wallets').count().get(),
      db.collection('wallets').where('status', '==', 'active').count().get(),
      db.collection('transactions')
        .where('type', '==', 'deposit')
        .where('status', '==', 'completed')
        .count()
        .get(),
      db.collection('transactions')
        .where('type', '==', 'withdrawal')
        .where('status', '==', 'completed')
        .count()
        .get()
    ]);
    
    return {
      success: true,
      stats: {
        totalUsers: totalUsers.data().count,
        activeUsers: activeUsers.data().count,
        totalDeposits: totalDeposits.data().count,
        totalWithdrawals: totalWithdrawals.data().count
      }
    };
    
  } catch (error) {
    console.error('Get user stats failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get user details (Admin only)
exports.getUserDetails = functions.https.onCall(async (data, context) => {
  await validateAdmin(context, 'support');
  
  const { userId } = data;
  
  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID required');
  }
  
  try {
    const [walletDoc, transactionsSnapshot, depositsSnapshot, withdrawalsSnapshot, betsSnapshot] = await Promise.all([
      db.collection('wallets').doc(userId).get(),
      db.collection('transactions')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get(),
      db.collection('deposit_requests')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get(),
      db.collection('withdrawals')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get(),
      db.collection('football_bets')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()
    ]);
    
    if (!walletDoc.exists) {
      throw new Error('User not found');
    }
    
    const walletData = walletDoc.data();
    const transactions = [];
    const deposits = [];
    const withdrawals = [];
    const bets = [];
    
    transactionsSnapshot.forEach(doc => {
      transactions.push({ id: doc.id, ...doc.data() });
    });
    
    depositsSnapshot.forEach(doc => {
      deposits.push({ id: doc.id, ...doc.data() });
    });
    
    withdrawalsSnapshot.forEach(doc => {
      withdrawals.push({ id: doc.id, ...doc.data() });
    });
    
    betsSnapshot.forEach(doc => {
      bets.push({ id: doc.id, ...doc.data() });
    });
    
    return {
      success: true,
      user: walletData,
      transactions,
      deposits,
      withdrawals,
      bets,
      summary: {
        totalTransactions: transactions.length,
        totalDeposits: deposits.length,
        totalWithdrawals: withdrawals.length,
        totalBets: bets.length
      }
    };
    
  } catch (error) {
    console.error('Get user details failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Create missing wallets (HTTP endpoint)
exports.createMissingWallets = functions.https.onRequest(async (req, res) => {
  try {
    const secret = req.query.secret || req.body?.secret;
    if (secret !== 'YOUR_SECRET_KEY') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    console.log('Creating missing wallets...');
    
    const authUsers = await auth.listUsers();
    const walletsSnapshot = await db.collection('wallets').get();
    
    const existingUserIds = new Set();
    walletsSnapshot.forEach(doc => existingUserIds.add(doc.id));
    
    let created = 0;
    const batch = db.batch();
    
    for (const user of authUsers.users) {
      if (!existingUserIds.has(user.uid)) {
        const walletRef = db.collection('wallets').doc(user.uid);
        batch.set(walletRef, {
          userId: user.uid,
          email: user.email || '',
          username: user.email ? user.email.split('@')[0] : `user_${user.uid.substring(0, 8)}`,
          balance: 0.0,
          status: 'active',
          kycStatus: 'pending',
          currency: 'USD',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastLogin: null,
          totalDeposited: 0.0,
          totalWithdrawn: 0.0,
          referralCode: generateId().substring(0, 8).toUpperCase()
        });
        created++;
        
        if (created % 400 === 0) {
          await batch.commit();
          console.log(`Created ${created} wallets...`);
        }
      }
    }
    
    if (created % 400 !== 0) {
      await batch.commit();
    }
    
    return res.json({
      success: true,
      created,
      totalUsers: authUsers.users.length,
      message: `Created ${created} new wallets`
    });
    
  } catch (error) {
    console.error('Create missing wallets failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Add admin role (Super admin only)
exports.addAdminRole = functions.https.onCall(async (data, context) => {
  const adminData = await validateAdmin(context, 'super_admin');
  
  const { email, role = 'support' } = data;
  
  if (!email || !email.includes('@')) {
    throw new functions.https.HttpsError('invalid-argument', 'Valid email required');
  }
  
  if (!['super_admin', 'finance', 'support', 'moderator'].includes(role)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid role');
  }
  
  try {
    const user = await auth.getUserByEmail(email);
    
    const existingAdmin = await db.collection('admins').doc(user.uid).get();
    if (existingAdmin.exists) {
      throw new Error('User is already an admin');
    }
    
    await auth.setCustomUserClaims(user.uid, {
      admin: true,
      role: role
    });
    
    await db.collection('admins').doc(user.uid).set({
      email: email,
      role: role,
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      addedBy: context.auth.uid,
      addedByEmail: adminData.email
    });
    
    return {
      success: true,
      message: `${email} added as ${role} admin`,
      userId: user.uid
    };
    
  } catch (error) {
    console.error('Add admin failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Remove admin role (Super admin only)
exports.removeAdminRole = functions.https.onCall(async (data, context) => {
  await validateAdmin(context, 'super_admin');
  
  const { email } = data;
  
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Email required');
  }
  
  try {
    const user = await auth.getUserByEmail(email);
    
    if (user.uid === context.auth.uid) {
      throw new Error('Cannot remove your own admin role');
    }
    
    await auth.setCustomUserClaims(user.uid, null);
    
    await db.collection('admins').doc(user.uid).update({
      active: false,
      removedAt: admin.firestore.FieldValue.serverTimestamp(),
      removedBy: context.auth.uid
    });
    
    return {
      success: true,
      message: `${email} removed as admin`
    };
    
  } catch (error) {
    console.error('Remove admin failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== EXPORT ALL FUNCTIONS ====================
module.exports = {
  // Sportmonks functions
  getLiveScores,
  getUpcomingFixtures,
  getFixtureOdds,
  getPreMatchOdds,
  getLeagues,
  getLatestUpdates,
  getStandings,
  getTopScorers,
  getTeamInfo,
  getMatchStats,
  sportmonksProxy,
  checkSportmonksStatus,
  
  // Betting functions
  placeBet,
  getOpenBets,
  getBettingHistory,
  cashOutBet,
  
  // Wallet functions
  createUserWallet,
  transferToUser,
  createDepositRequest,
  processDeposit,
  createWithdrawalRequest,
  processWithdrawal,
  adminAdjustBalance,
  adminSendToUser,
  getPendingRequests,
  getUserStats,
  getUserDetails,
  createMissingWallets,
  addAdminRole,
  removeAdminRole
};
