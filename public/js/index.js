const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

// Initialize with your project ID
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
  TRANSFER_FEE_PERCENT: 0, // 0% fee for now
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

async function getUserWallet(uid) {
  const walletDoc = await db.collection('wallets').doc(uid).get();
  if (!walletDoc.exists) {
    throw new Error('Wallet not found');
  }
  return { id: walletDoc.id, ...walletDoc.data() };
}

async function createAdminLog(adminId, action, data) {
  const logRef = db.collection('admin_logs').doc();
  await logRef.set({
    adminId,
    action,
    ...data,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
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
      referralCode: generateReferralCode(),
      referredBy: null,
      vipLevel: 0,
      tags: ['new_user']
    };
    
    await db.collection('wallets').doc(user.uid).set(walletData);
    
    // Create welcome transaction
    const txRef = db.collection('transactions').doc();
    await txRef.set({
      transactionId: txRef.id,
      userId: user.uid,
      type: 'system',
      subType: 'account_creation',
      amount: 0,
      description: 'Welcome to X-Bet! Account created successfully.',
      status: 'completed',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`Wallet created successfully for ${user.email}`);
    return { success: true, userId: user.uid };
    
  } catch (error) {
    console.error(`Error creating wallet for ${user.uid}:`, error);
    
    // Send alert email (you can implement this)
    await db.collection('error_logs').add({
      type: 'wallet_creation_failed',
      userId: user.uid,
      error: error.message,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    throw error;
  }
});

// ==================== USER TO USER TRANSFER ====================
exports.transferToUser = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
  }
  
  const { toUserId, amount, note = '' } = data;
  
  // Validate input
  if (!toUserId || !amount || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid transfer details');
  }
  
  if (amount > 10000) {
    throw new functions.https.HttpsError('invalid-argument', 'Maximum transfer amount is $10,000');
  }
  
  const fromUserId = context.auth.uid;
  
  // Don't allow transferring to self
  if (fromUserId === toUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot transfer to yourself');
  }
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      // Get sender's wallet
      const fromWalletRef = db.collection('wallets').doc(fromUserId);
      const fromWalletDoc = await transaction.get(fromWalletRef);
      
      if (!fromWalletDoc.exists) {
        throw new Error('Your wallet not found');
      }
      
      const fromWallet = fromWalletDoc.data();
      
      // Get receiver's wallet
      const toWalletRef = db.collection('wallets').doc(toUserId);
      const toWalletDoc = await transaction.get(toWalletRef);
      
      if (!toWalletDoc.exists) {
        throw new Error('Recipient wallet not found');
      }
      
      const toWallet = toWalletDoc.data();
      
      // Check if sender has enough balance
      if (fromWallet.balance < amount) {
        throw new Error(`Insufficient balance. Available: $${fromWallet.balance}`);
      }
      
      // Check if receiver's wallet is active
      if (toWallet.status !== 'active') {
        throw new Error('Recipient wallet is not active');
      }
      
      // Calculate fee (0% for now, can be changed)
      const fee = 0;
      const netAmount = amount - fee;
      
      // Calculate new balances
      const newFromBalance = fromWallet.balance - amount;
      const newToBalance = toWallet.balance + netAmount;
      
      // Update sender's wallet
      transaction.update(fromWalletRef, {
        balance: newFromBalance,
        totalTransferred: (fromWallet.totalTransferred || 0) + amount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update receiver's wallet
      transaction.update(toWalletRef, {
        balance: newToBalance,
        totalReceived: (toWallet.totalReceived || 0) + netAmount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Generate transaction ID
      const transactionId = db.collection('transactions').doc().id;
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      
      // Create outgoing transaction record
      transaction.set(db.collection('transactions').doc(`${transactionId}_out`), {
        transactionId: transactionId,
        userId: fromUserId,
        type: 'transfer',
        subType: 'outgoing',
        toUserId: toUserId,
        toEmail: toWallet.email,
        amount: amount,
        fee: fee,
        netAmount: netAmount,
        note: note,
        previousBalance: fromWallet.balance,
        newBalance: newFromBalance,
        status: 'completed',
        timestamp: timestamp
      });
      
      // Create incoming transaction record
      transaction.set(db.collection('transactions').doc(`${transactionId}_in`), {
        transactionId: transactionId,
        userId: toUserId,
        type: 'transfer',
        subType: 'incoming',
        fromUserId: fromUserId,
        fromEmail: fromWallet.email,
        amount: netAmount,
        note: note,
        previousBalance: toWallet.balance,
        newBalance: newToBalance,
        status: 'completed',
        timestamp: timestamp
      });
      
      // Create notification for receiver
      const notificationRef = db.collection('notifications').doc();
      transaction.set(notificationRef, {
        userId: toUserId,
        type: 'transfer_received',
        title: 'Money Received!',
        message: `You received $${netAmount.toFixed(2)} from ${fromWallet.email}`,
        data: {
          fromUserId: fromUserId,
          fromEmail: fromWallet.email,
          amount: netAmount,
          transactionId: transactionId
        },
        read: false,
        timestamp: timestamp
      });
      
      return {
        success: true,
        transactionId: transactionId,
        amount: amount,
        fee: fee,
        netAmount: netAmount,
        fromUserId: fromUserId,
        toUserId: toUserId,
        fromNewBalance: newFromBalance,
        toNewBalance: newToBalance,
        message: `Successfully transferred $${netAmount.toFixed(2)} to ${toWallet.email}`
      };
    });
    
    return result;
    
  } catch (error) {
    console.error('Transfer failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== CREATE DEPOSIT REQUEST ====================
exports.createDepositRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
  }
  
  const { amount, paymentMethod, currency = 'USD', reference = '' } = data;
  
  // Validate input
  if (!amount || amount < CONFIG.MIN_DEPOSIT || amount > CONFIG.MAX_DEPOSIT) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      `Amount must be between $${CONFIG.MIN_DEPOSIT} and $${CONFIG.MAX_DEPOSIT}`
    );
  }
  
  if (!CONFIG.PAYMENT_METHODS.includes(paymentMethod)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Invalid payment method. Allowed: ${CONFIG.PAYMENT_METHODS.join(', ')}`
    );
  }
  
  if (!CONFIG.CURRENCIES.includes(currency)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Invalid currency. Allowed: ${CONFIG.CURRENCIES.join(', ')}`
    );
  }
  
  const userId = context.auth.uid;
  
  try {
    // Get user wallet
    const wallet = await getUserWallet(userId);
    
    // Create deposit request
    const requestRef = db.collection('deposit_requests').doc();
    const requestData = {
      requestId: requestRef.id,
      userId: userId,
      userEmail: wallet.email,
      amount: amount,
      currency: currency,
      paymentMethod: paymentMethod,
      reference: reference,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await requestRef.set(requestData);
    
    // Create transaction record
    const txRef = db.collection('transactions').doc();
    await txRef.set({
      transactionId: txRef.id,
      userId: userId,
      type: 'deposit_request',
      amount: amount,
      currency: currency,
      paymentMethod: paymentMethod,
      requestId: requestRef.id,
      status: 'pending',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Create notification for admins
    const adminNotificationRef = db.collection('notifications').doc();
    await adminNotificationRef.set({
      userId: 'admin', // This goes to all admins
      type: 'new_deposit_request',
      title: 'New Deposit Request',
      message: `New deposit request for $${amount} ${currency} from ${wallet.email}`,
      data: {
        requestId: requestRef.id,
        userId: userId,
        amount: amount,
        paymentMethod: paymentMethod
      },
      read: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      requestId: requestRef.id,
      amount: amount,
      currency: currency,
      status: 'pending',
      message: 'Deposit request created successfully. Please complete the payment.'
    };
    
  } catch (error) {
    console.error('Create deposit request failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== PROCESS DEPOSIT (ADMIN) ====================
exports.processDeposit = functions.https.onCall(async (data, context) => {
  const adminData = await validateAdmin(context, 'finance');
  
  const { requestId, action, notes = '' } = data;
  
  if (!requestId || !['approve', 'reject'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parameters');
  }
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      // Get deposit request
      const requestRef = db.collection('deposit_requests').doc(requestId);
      const requestDoc = await transaction.get(requestRef);
      
      if (!requestDoc.exists) {
        throw new Error('Deposit request not found');
      }
      
      const requestData = requestDoc.data();
      
      // Check if already processed
      if (requestData.status !== 'pending') {
        throw new Error(`Deposit request already ${requestData.status}`);
      }
      
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      
      // Update deposit request
      transaction.update(requestRef, {
        status: newStatus,
        processedBy: context.auth.uid,
        processedByEmail: adminData.email,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        notes: notes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // If approved, update wallet balance
      if (action === 'approve') {
        const walletRef = db.collection('wallets').doc(requestData.userId);
        const walletDoc = await transaction.get(walletRef);
        
        if (!walletDoc.exists) {
          throw new Error('User wallet not found');
        }
        
        const walletData = walletDoc.data();
        const newBalance = walletData.balance + requestData.amount;
        
        transaction.update(walletRef, {
          balance: newBalance,
          totalDeposited: (walletData.totalDeposited || 0) + requestData.amount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Create transaction record
        const txRef = db.collection('transactions').doc();
        transaction.set(txRef, {
          transactionId: txRef.id,
          userId: requestData.userId,
          type: 'deposit',
          amount: requestData.amount,
          currency: requestData.currency,
          requestId: requestId,
          previousBalance: walletData.balance,
          newBalance: newBalance,
          status: 'completed',
          processedBy: context.auth.uid,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Create user notification
        const userNotificationRef = db.collection('notifications').doc();
        transaction.set(userNotificationRef, {
          userId: requestData.userId,
          type: 'deposit_approved',
          title: 'Deposit Approved!',
          message: `Your deposit of $${requestData.amount.toFixed(2)} has been approved`,
          data: {
            requestId: requestId,
            amount: requestData.amount,
            newBalance: newBalance
          },
          read: false,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Create admin log
        const logRef = db.collection('admin_logs').doc();
        transaction.set(logRef, {
          adminId: context.auth.uid,
          adminEmail: adminData.email,
          action: 'deposit_approval',
          targetUserId: requestData.userId,
          targetEmail: requestData.userEmail,
          amount: requestData.amount,
          requestId: requestId,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return {
          success: true,
          action: 'approved',
          amount: requestData.amount,
          userId: requestData.userId,
          newBalance: newBalance,
          message: `Deposit approved. User's new balance: $${newBalance.toFixed(2)}`
        };
        
      } else {
        // If rejected
        const userNotificationRef = db.collection('notifications').doc();
        transaction.set(userNotificationRef, {
          userId: requestData.userId,
          type: 'deposit_rejected',
          title: 'Deposit Rejected',
          message: `Your deposit of $${requestData.amount.toFixed(2)} was rejected`,
          data: {
            requestId: requestId,
            amount: requestData.amount,
            reason: notes || 'No reason provided'
          },
          read: false,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return {
          success: true,
          action: 'rejected',
          amount: requestData.amount,
          userId: requestData.userId,
          message: 'Deposit request rejected'
        };
      }
    });
    
    return result;
    
  } catch (error) {
    console.error('Process deposit failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== CREATE WITHDRAWAL REQUEST ====================
exports.createWithdrawalRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
  }
  
  const { amount, walletAddress, network = 'ETH', notes = '' } = data;
  
  // Validate input
  if (!amount || amount < CONFIG.MIN_WITHDRAWAL || amount > CONFIG.MAX_WITHDRAWAL) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Amount must be between $${CONFIG.MIN_WITHDRAWAL} and $${CONFIG.MAX_WITHDRAWAL}`
    );
  }
  
  if (!walletAddress || walletAddress.length < 26) {
    throw new functions.https.HttpsError('invalid-argument', 'Valid wallet address required');
  }
  
  const userId = context.auth.uid;
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      // Get user wallet
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);
      
      if (!walletDoc.exists) {
        throw new Error('Wallet not found');
      }
      
      const walletData = walletDoc.data();
      
      // Check if user has enough balance
      if (walletData.balance < amount) {
        throw new Error(`Insufficient balance. Available: $${walletData.balance}`);
      }
      
      // Check if wallet is active
      if (walletData.status !== 'active') {
        throw new Error('Your wallet is not active. Please contact support.');
      }
      
      // Check daily withdrawal limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const withdrawalsQuery = db.collection('withdrawals')
        .where('userId', '==', userId)
        .where('status', '==', 'approved')
        .where('createdAt', '>=', today);
      
      // Note: This query might need an index
      const withdrawalsSnapshot = await withdrawalsQuery.get();
      
      let dailyTotal = 0;
      withdrawalsSnapshot.forEach(doc => {
        dailyTotal += doc.data().amount;
      });
      
      if (dailyTotal + amount > CONFIG.DAILY_WITHDRAWAL_LIMIT) {
        throw new Error(`Daily withdrawal limit exceeded. Limit: $${CONFIG.DAILY_WITHDRAWAL_LIMIT}, Today: $${dailyTotal}`);
      }
      
      // Create withdrawal request
      const withdrawalRef = db.collection('withdrawals').doc();
      const withdrawalData = {
        withdrawalId: withdrawalRef.id,
        userId: userId,
        userEmail: walletData.email,
        amount: amount,
        walletAddress: walletAddress,
        network: network,
        notes: notes,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      transaction.set(withdrawalRef, withdrawalData);
      
      // Create pending transaction record
      const txRef = db.collection('transactions').doc();
      transaction.set(txRef, {
        transactionId: txRef.id,
        userId: userId,
        type: 'withdrawal_request',
        amount: amount,
        walletAddress: walletAddress,
        network: network,
        withdrawalId: withdrawalRef.id,
        status: 'pending',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Create admin notification
      const adminNotificationRef = db.collection('notifications').doc();
      transaction.set(adminNotificationRef, {
        userId: 'admin',
        type: 'new_withdrawal_request',
        title: 'New Withdrawal Request',
        message: `New withdrawal request for $${amount} from ${walletData.email}`,
        data: {
          withdrawalId: withdrawalRef.id,
          userId: userId,
          amount: amount,
          walletAddress: walletAddress
        },
        read: false,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        success: true,
        withdrawalId: withdrawalRef.id,
        amount: amount,
        status: 'pending',
        message: 'Withdrawal request created successfully. Please wait for admin approval.'
      };
    });
    
    return result;
    
  } catch (error) {
    console.error('Create withdrawal request failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== PROCESS WITHDRAWAL (ADMIN) ====================
exports.processWithdrawal = functions.https.onCall(async (data, context) => {
  const adminData = await validateAdmin(context, 'finance');
  
  const { withdrawalId, action, txHash = '', notes = '' } = data;
  
  if (!withdrawalId || !['approve', 'reject'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parameters');
  }
  
  if (action === 'approve' && !txHash) {
    throw new functions.https.HttpsError('invalid-argument', 'Transaction hash required for approval');
  }
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      // Get withdrawal request
      const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
      const withdrawalDoc = await transaction.get(withdrawalRef);
      
      if (!withdrawalDoc.exists) {
        throw new Error('Withdrawal request not found');
      }
      
      const withdrawalData = withdrawalDoc.data();
      
      // Check if already processed
      if (withdrawalData.status !== 'pending') {
        throw new Error(`Withdrawal already ${withdrawalData.status}`);
      }
      
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      
      // Update withdrawal request
      transaction.update(withdrawalRef, {
        status: newStatus,
        processedBy: context.auth.uid,
        processedByEmail: adminData.email,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        txHash: txHash,
        notes: notes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      if (action === 'approve') {
        const walletRef = db.collection('wallets').doc(withdrawalData.userId);
        const walletDoc = await transaction.get(walletRef);
        
        if (!walletDoc.exists) {
          throw new Error('User wallet not found');
        }
        
        const walletData = walletDoc.data();
        const newBalance = walletData.balance - withdrawalData.amount;
        
        // Double-check balance
        if (newBalance < 0) {
          throw new Error('Insufficient balance for withdrawal');
        }
        
        transaction.update(walletRef, {
          balance: newBalance,
          totalWithdrawn: (walletData.totalWithdrawn || 0) + withdrawalData.amount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Create transaction record
        const txRef = db.collection('transactions').doc();
        transaction.set(txRef, {
          transactionId: txRef.id,
          userId: withdrawalData.userId,
          type: 'withdrawal',
          amount: withdrawalData.amount,
          walletAddress: withdrawalData.walletAddress,
          network: withdrawalData.network,
          withdrawalId: withdrawalId,
          txHash: txHash,
          previousBalance: walletData.balance,
          newBalance: newBalance,
          status: 'completed',
          processedBy: context.auth.uid,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Create user notification
        const userNotificationRef = db.collection('notifications').doc();
        transaction.set(userNotificationRef, {
          userId: withdrawalData.userId,
          type: 'withdrawal_approved',
          title: 'Withdrawal Approved!',
          message: `Your withdrawal of $${withdrawalData.amount.toFixed(2)} has been processed`,
          data: {
            withdrawalId: withdrawalId,
            amount: withdrawalData.amount,
            txHash: txHash,
            newBalance: newBalance
          },
          read: false,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return {
          success: true,
          action: 'approved',
          amount: withdrawalData.amount,
          userId: withdrawalData.userId,
          txHash: txHash,
          newBalance: newBalance,
          message: `Withdrawal approved. Transaction hash: ${txHash}`
        };
        
      } else {
        // If rejected
        const userNotificationRef = db.collection('notifications').doc();
        transaction.set(userNotificationRef, {
          userId: withdrawalData.userId,
          type: 'withdrawal_rejected',
          title: 'Withdrawal Rejected',
          message: `Your withdrawal of $${withdrawalData.amount.toFixed(2)} was rejected`,
          data: {
            withdrawalId: withdrawalId,
            amount: withdrawalData.amount,
            reason: notes || 'No reason provided'
          },
          read: false,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return {
          success: true,
          action: 'rejected',
          amount: withdrawalData.amount,
          userId: withdrawalData.userId,
          message: 'Withdrawal request rejected'
        };
      }
    });
    
    return result;
    
  } catch (error) {
    console.error('Process withdrawal failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== ADMIN SEND TO USER ====================
exports.adminSendToUser = functions.https.onCall(async (data, context) => {
  const adminData = await validateAdmin(context, 'finance');
  
  const { userId, amount, reason = 'Admin adjustment', notes = '' } = data;
  
  if (!userId || !amount || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parameters');
  }
  
  if (amount > 50000) {
    throw new functions.https.HttpsError('invalid-argument', 'Maximum amount is $50,000');
  }
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      // Get user wallet
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);
      
      if (!walletDoc.exists) {
        throw new Error('User wallet not found');
      }
      
      const walletData = walletDoc.data();
      
      // Check if wallet is active
      if (walletData.status !== 'active') {
        throw new Error('User wallet is not active');
      }
      
      // Update balance
      const newBalance = walletData.balance + amount;
      
      transaction.update(walletRef, {
        balance: newBalance,
        totalReceived: (walletData.totalReceived || 0) + amount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Create transaction record
      const txRef = db.collection('transactions').doc();
      transaction.set(txRef, {
        transactionId: txRef.id,
        userId: userId,
        type: 'admin_credit',
        amount: amount,
        reason: reason,
        notes: notes,
        previousBalance: walletData.balance,
        newBalance: newBalance,
        adminId: context.auth.uid,
        adminEmail: adminData.email,
        status: 'completed',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Create admin log
      const logRef = db.collection('admin_logs').doc();
      transaction.set(logRef, {
        adminId: context.auth.uid,
        adminEmail: adminData.email,
        action: 'send_to_user',
        targetUserId: userId,
        targetEmail: walletData.email,
        amount: amount,
        reason: reason,
        previousBalance: walletData.balance,
        newBalance: newBalance,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Create user notification
      const notificationRef = db.collection('notifications').doc();
      transaction.set(notificationRef, {
        userId: userId,
        type: 'admin_credit',
        title: 'Funds Received!',
        message: `You received $${amount.toFixed(2)} from admin`,
        data: {
          amount: amount,
          reason: reason,
          newBalance: newBalance,
          adminEmail: adminData.email
        },
        read: false,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        success: true,
        transactionId: txRef.id,
        userId: userId,
        userEmail: walletData.email,
        amount: amount,
        previousBalance: walletData.balance,
        newBalance: newBalance,
        reason: reason,
        message: `Successfully sent $${amount.toFixed(2)} to ${walletData.email}`
      };
    });
    
    return result;
    
  } catch (error) {
    console.error('Admin send failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== UTILITY FUNCTIONS ====================
function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ==================== HTTP ENDPOINTS (for webhooks) ====================
exports.webhookDeposit = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      // This is where you would integrate with payment processors
      // Example: Stripe, PayPal, etc.
      const { userId, amount, paymentId, status } = req.body;
      
      if (!userId || !amount || !paymentId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Process payment webhook
      console.log(`Webhook received for user ${userId}, amount: ${amount}`);
      
      return res.status(200).json({ success: true, message: 'Webhook processed' });
      
    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// ==================== EXPORT ALL FUNCTIONS ====================
module.exports = {
  createUserWallet,
  transferToUser,
  createDepositRequest,
  processDeposit,
  createWithdrawalRequest,
  processWithdrawal,
  adminSendToUser,
  webhookDeposit
};
