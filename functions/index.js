const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize with your project
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'x-bet-prod-jd'
});

const db = admin.firestore();
const auth = admin.auth();

// ==================== CONFIGURATION ====================
const CONFIG = {
  MIN_DEPOSIT: 10,
  MAX_DEPOSIT: 10000,
  MIN_WITHDRAWAL: 20,
  MAX_WITHDRAWAL: 5000,
  DAILY_WITHDRAWAL_LIMIT: 10000,
  MAX_ADJUSTMENT: 1000000,
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

// ==================== USER TRANSFER ====================
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
    // READ all data first
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
    
    // Calculate new balances
    const newFromBalance = fromWallet.balance - amount;
    const newToBalance = toWallet.balance + amount;
    const transactionId = generateId();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    // Execute transaction (ALL READS DONE, NOW WRITES)
    await db.runTransaction(async (transaction) => {
      const fromRef = db.collection('wallets').doc(fromUserId);
      const toRef = db.collection('wallets').doc(toUserId);
      
      // Update wallets
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
      
      // Create transaction records
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
    
    // Create notification (outside transaction for better performance)
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

// ==================== CREATE DEPOSIT REQUEST ====================
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
    
    // Create transaction record
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

// ==================== PROCESS DEPOSIT ====================
exports.processDeposit = functions.https.onCall(async (data, context) => {
  const adminData = await validateAdmin(context, 'finance');
  
  const { requestId, action, notes = '' } = data;
  
  if (!requestId || !['approve', 'reject'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parameters');
  }
  
  try {
    // READ deposit request first
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
      // READ wallet before transaction
      const walletDoc = await db.collection('wallets').doc(requestData.userId).get();
      if (!walletDoc.exists) {
        throw new Error('Wallet not found');
      }
      
      const walletData = walletDoc.data();
      const newBalance = walletData.balance + requestData.amount;
      
      // Execute transaction
      await db.runTransaction(async (transaction) => {
        // Update deposit request
        transaction.update(db.collection('deposit_requests').doc(requestId), {
          status: newStatus,
          processedBy: context.auth.uid,
          processedByEmail: adminData.email,
          processedAt: timestamp,
          notes,
          updatedAt: timestamp
        });
        
        // Update wallet
        transaction.update(db.collection('wallets').doc(requestData.userId), {
          balance: newBalance,
          totalDeposited: (walletData.totalDeposited || 0) + requestData.amount,
          updatedAt: timestamp
        });
        
        // Create transaction
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
      
      // Create notification
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
      // Reject deposit
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

// ==================== CREATE WITHDRAWAL REQUEST ====================
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
    // READ wallet first
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

// ==================== PROCESS WITHDRAWAL ====================
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
    // READ withdrawal request first
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
      // READ wallet before transaction
      const walletDoc = await db.collection('wallets').doc(withdrawalData.userId).get();
      if (!walletDoc.exists) {
        throw new Error('Wallet not found');
      }
      
      const walletData = walletDoc.data();
      
      if (walletData.balance < withdrawalData.amount) {
        throw new Error('Insufficient balance for withdrawal');
      }
      
      const newBalance = walletData.balance - withdrawalData.amount;
      
      // Execute transaction
      await db.runTransaction(async (transaction) => {
        // Update withdrawal
        transaction.update(db.collection('withdrawals').doc(withdrawalId), {
          status: newStatus,
          processedBy: context.auth.uid,
          processedByEmail: adminData.email,
          processedAt: timestamp,
          txHash,
          notes,
          updatedAt: timestamp
        });
        
        // Update wallet
        transaction.update(db.collection('wallets').doc(withdrawalData.userId), {
          balance: newBalance,
          totalWithdrawn: (walletData.totalWithdrawn || 0) + withdrawalData.amount,
          updatedAt: timestamp
        });
        
        // Create transaction
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
      
      // Create notification
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
      // Reject withdrawal
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

// ==================== ADMIN BALANCE ADJUSTMENT ====================
exports.adminAdjustBalance = functions.https.onCall(async (data, context) => {
  const adminData = await validateAdmin(context, 'finance');
  
  const { 
    userId, 
    amount, 
    action, 
    reason = 'Admin adjustment', 
    notes = '' 
  } = data;
  
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
    // READ wallet first
    const walletDoc = await db.collection('wallets').doc(userId).get();
    if (!walletDoc.exists) {
      throw new Error('User wallet not found');
    }
    
    const walletData = walletDoc.data();
    let newBalance = walletData.balance;
    let change = 0;
    
    // Calculate new balance
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
    
    // Execute transaction
    await db.runTransaction(async (transaction) => {
      // Update wallet
      transaction.update(db.collection('wallets').doc(userId), {
        balance: newBalance,
        updatedAt: timestamp
      });
      
      // Create transaction
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
    
    // Create notification
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

// ==================== ADMIN SEND TO USER ====================
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
    // READ wallet first
    const walletDoc = await db.collection('wallets').doc(userId).get();
    if (!walletDoc.exists) {
      throw new Error('User wallet not found');
    }
    
    const walletData = walletDoc.data();
    const newBalance = walletData.balance + amount;
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    // Execute transaction
    await db.runTransaction(async (transaction) => {
      // Update wallet
      transaction.update(db.collection('wallets').doc(userId), {
        balance: newBalance,
        totalReceived: (walletData.totalReceived || 0) + amount,
        updatedAt: timestamp
      });
      
      // Create transaction
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
    
    // Create notification
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

// ==================== GET PENDING REQUESTS ====================
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

// ==================== GET USER STATS ====================
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

// ==================== GET USER DETAILS ====================
exports.getUserDetails = functions.https.onCall(async (data, context) => {
  await validateAdmin(context, 'support');
  
  const { userId } = data;
  
  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID required');
  }
  
  try {
    const [walletDoc, transactionsSnapshot, depositsSnapshot, withdrawalsSnapshot] = await Promise.all([
      db.collection('wallets').doc(userId).get(),
      db.collection('transactions')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get(),
      db.collection('deposit_requests')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get(),
      db.collection('withdrawals')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get()
    ]);
    
    if (!walletDoc.exists) {
      throw new Error('User not found');
    }
    
    const walletData = walletDoc.data();
    const transactions = [];
    const deposits = [];
    const withdrawals = [];
    
    transactionsSnapshot.forEach(doc => {
      transactions.push({ id: doc.id, ...doc.data() });
    });
    
    depositsSnapshot.forEach(doc => {
      deposits.push({ id: doc.id, ...doc.data() });
    });
    
    withdrawalsSnapshot.forEach(doc => {
      withdrawals.push({ id: doc.id, ...doc.data() });
    });
    
    return {
      success: true,
      user: walletData,
      transactions,
      deposits,
      withdrawals,
      summary: {
        totalTransactions: transactions.length,
        totalDeposits: deposits.length,
        totalWithdrawals: withdrawals.length
      }
    };
    
  } catch (error) {
    console.error('Get user details failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== CREATE MISSING WALLETS ====================
exports.createMissingWallets = functions.https.onRequest(async (req, res) => {
  try {
    if (req.query.secret !== 'YOUR_SECRET_KEY') {
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

// ==================== ADD ADMIN ROLE ====================
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
    
    // Check if already admin
    const existingAdmin = await db.collection('admins').doc(user.uid).get();
    if (existingAdmin.exists) {
      throw new Error('User is already an admin');
    }
    
    // Set custom claims
    await auth.setCustomUserClaims(user.uid, {
      admin: true,
      role: role
    });
    
    // Create admin document
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

// ==================== REMOVE ADMIN ROLE ====================
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
    
    // Remove custom claims
    await auth.setCustomUserClaims(user.uid, null);
    
    // Update admin document
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
