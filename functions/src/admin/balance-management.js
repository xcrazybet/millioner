// functions/src/admin/balance-management.js
const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Admin transfer money to user
 * @param {string} userId - Target user ID
 * @param {number} amount - Amount to transfer
 * @param {string} reason - Reason for transfer
 * @param {string} notes - Additional notes
 * @param {object} context - Firebase callable function context
 * @returns {Promise<object>} Result
 */
exports.adminTransferToUser = async (data, context) => {
  // Verify admin
  if (!context.auth) {
    throw new admin.firestore.FirestoreError('unauthenticated', 'Not authenticated');
  }
  
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || !adminDoc.data().active) {
    throw new admin.firestore.FirestoreError('permission-denied', 'Admin access required');
  }
  
  const { userId, amount, reason = 'Admin transfer', notes = '' } = data;
  
  if (!userId || !amount || amount <= 0) {
    throw new admin.firestore.FirestoreError('invalid-argument', 'Invalid userId or amount');
  }
  
  console.log(`[ADMIN TRANSFER] ${context.auth.uid} transferring $${amount} to ${userId}`);
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      // Get target user wallet
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);
      
      if (!walletDoc.exists) {
        throw new Error('User wallet not found');
      }
      
      const walletData = walletDoc.data();
      const currentBalance = walletData.balance || 0;
      const newBalance = currentBalance + amount;
      
      // Update target wallet
      transaction.update(walletRef, {
        balance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        totalDeposited: admin.firestore.FieldValue.increment(amount)
      });
      
      // Create transaction for target user
      const txRef = db.collection('transactions').doc();
      transaction.set(txRef, {
        id: txRef.id,
        userId: userId,
        type: 'admin_adjustment',
        subType: 'credit',
        amount: amount,
        description: reason,
        notes: notes,
        status: 'completed',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userEmail: walletData.email,
        username: walletData.username,
        adminId: context.auth.uid,
        adminEmail: adminDoc.data().email,
        previousBalance: currentBalance,
        newBalance: newBalance,
        metadata: {
          action: 'credit',
          reason: reason,
          notes: notes,
          initiatedBy: 'admin'
        }
      });
      
      // Create admin log
      const logRef = db.collection('admin_logs').doc();
      transaction.set(logRef, {
        adminId: context.auth.uid,
        adminEmail: adminDoc.data().email,
        action: 'balance_transfer',
        targetUserId: userId,
        amount: amount,
        reason: reason,
        notes: notes,
        previousBalance: currentBalance,
        newBalance: newBalance,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        success: true,
        transactionId: txRef.id,
        userId: userId,
        userEmail: walletData.email,
        amount: amount,
        previousBalance: currentBalance,
        newBalance: newBalance,
        message: `Successfully transferred $${amount} to ${walletData.email}`
      };
    });
    
    console.log(`[SUCCESS] Admin transfer completed: ${result.message}`);
    return result;
    
  } catch (error) {
    console.error('[ERROR] Admin transfer failed:', error);
    throw new admin.firestore.FirestoreError('internal', error.message);
  }
};

/**
 * Get transaction history for user
 * @param {string} userId - User ID
 * @param {number} limit - Limit results
 * @param {string} type - Filter by type
 * @returns {Promise<object>} Transaction history
 */
exports.getTransactionHistory = async (data, context) => {
  // Verify admin or user requesting their own data
  if (!context.auth) {
    throw new admin.firestore.FirestoreError('unauthenticated', 'Not authenticated');
  }
  
  const { userId, limit = 50, type = null, page = 1 } = data;
  
  if (!userId) {
    throw new admin.firestore.FirestoreError('invalid-argument', 'User ID required');
  }
  
  // Check if user is requesting their own data or is admin
  const isSameUser = context.auth.uid === userId;
  
  if (!isSameUser) {
    // Check if admin
    const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
    if (!adminDoc.exists || !adminDoc.data().active) {
      throw new admin.firestore.FirestoreError('permission-denied', 'Access denied');
    }
  }
  
  try {
    let query = db.collection('transactions')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc');
    
    // Apply type filter if provided
    if (type) {
      query = query.where('type', '==', type);
    }
    
    // Calculate pagination
    const offset = (page - 1) * limit;
    
    // Get total count
    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;
    
    // Get paginated data
    const snapshot = await query
      .offset(offset)
      .limit(limit)
      .get();
    
    const transactions = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      transactions.push({
        id: doc.id,
        ...data,
        // Convert timestamp for client
        timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : null
      });
    });
    
    // Get wallet info
    const walletDoc = await db.collection('wallets').doc(userId).get();
    const walletData = walletDoc.exists ? walletDoc.data() : null;
    
    return {
      success: true,
      transactions: transactions,
      wallet: walletData ? {
        balance: walletData.balance,
        email: walletData.email,
        username: walletData.username
      } : null,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        pages: Math.ceil(total / limit)
      }
    };
    
  } catch (error) {
    console.error('[ERROR] getTransactionHistory failed:', error);
    throw new admin.firestore.FirestoreError('internal', error.message);
  }
};

/**
 * Get user wallet statistics
 * @param {string} userId - User ID
 * @returns {Promise<object>} Wallet statistics
 */
exports.getUserWalletStats = async (data, context) => {
  if (!context.auth) {
    throw new admin.firestore.FirestoreError('unauthenticated', 'Not authenticated');
  }
  
  const { userId } = data;
  
  if (!userId) {
    throw new admin.firestore.FirestoreError('invalid-argument', 'User ID required');
  }
  
  // Check permissions
  const isSameUser = context.auth.uid === userId;
  if (!isSameUser) {
    const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
    if (!adminDoc.exists || !adminDoc.data().active) {
      throw new admin.firestore.FirestoreError('permission-denied', 'Access denied');
    }
  }
  
  try {
    // Get wallet
    const walletDoc = await db.collection('wallets').doc(userId).get();
    if (!walletDoc.exists) {
      throw new Error('Wallet not found');
    }
    
    const walletData = walletDoc.data();
    
    // Get transaction statistics
    const depositSnapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .where('type', '==', 'deposit')
      .count()
      .get();
    
    const withdrawalSnapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .where('type', '==', 'withdrawal')
      .count()
      .get();
    
    const winSnapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .where('type', '==', 'game_win')
      .count()
      .get();
    
    const lossSnapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .where('type', '==', 'game_bet')
      .count()
      .get();
    
    // Get recent transactions
    const recentTxSnapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    
    const recentTransactions = [];
    recentTxSnapshot.forEach(doc => {
      const data = doc.data();
      recentTransactions.push({
        id: doc.id,
        type: data.type,
        amount: data.amount,
        description: data.description,
        timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : null,
        status: data.status
      });
    });
    
    return {
      success: true,
      wallet: {
        balance: walletData.balance || 0,
        totalDeposited: walletData.totalDeposited || 0,
        totalWithdrawn: walletData.totalWithdrawn || 0,
        totalWon: walletData.totalWon || 0,
        totalLost: walletData.totalLost || 0,
        status: walletData.status || 'active',
        createdAt: walletData.createdAt ? walletData.createdAt.toDate().toISOString() : null
      },
      statistics: {
        totalDeposits: depositSnapshot.data().count,
        totalWithdrawals: withdrawalSnapshot.data().count,
        totalWins: winSnapshot.data().count,
        totalLosses: lossSnapshot.data().count,
        netProfit: (walletData.totalWon || 0) - (walletData.totalLost || 0)
      },
      recentTransactions: recentTransactions
    };
    
  } catch (error) {
    console.error('[ERROR] getUserWalletStats failed:', error);
    throw new admin.firestore.FirestoreError('internal', error.message);
  }
};
