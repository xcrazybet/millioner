const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.adminTransferToUser = functions.https.onCall(async (data, context) => {
  // Verify admin authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Not authenticated');
  }

  const { targetUserId, amount, reason, notes, metadata = {} } = data;
  const adminId = context.auth.uid;

  // Input validation
  if (!targetUserId || typeof targetUserId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid target user ID');
  }

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid amount');
  }

  // Round to 2 decimal places to prevent floating point issues
  const sanitizedAmount = Math.round(amount * 100) / 100;
  const amountInCents = Math.round(sanitizedAmount * 100);

  // Verify admin permissions
  try {
    const adminDoc = await db.collection('admins').doc(adminId).get();
    
    if (!adminDoc.exists) {
      throw new functions.https.HttpsError('permission-denied', 'Admin not found');
    }

    const adminData = adminDoc.data();
    
    if (!adminData?.permissions?.includes('balance_adjustment')) {
      throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
    }

    // Check admin status
    if (adminData.status !== 'active') {
      throw new functions.https.HttpsError('permission-denied', `Admin account is ${adminData.status}`);
    }

    // Get admin email for audit trail
    const adminEmail = adminData.email || 'unknown@admin.com';

    // Perform secure transaction using Firestore transaction
    const result = await db.runTransaction(async (transaction) => {
      // Get target user wallet
      const targetWalletRef = db.collection('wallets').doc(targetUserId);
      const targetWalletDoc = await transaction.get(targetWalletRef);

      let currentBalance = 0;
      let userData = {};

      if (targetWalletDoc.exists) {
        const walletData = targetWalletDoc.data();
        currentBalance = walletData.balance || 0;
        userData = walletData;

        // Check if wallet is active
        if (walletData.status !== 'active') {
          throw new Error(`Target wallet is ${walletData.status}`);
        }
      } else {
        // Get user info for new wallet
        try {
          const userRecord = await admin.auth().getUser(targetUserId);
          userData = {
            email: userRecord.email || 'unknown@user.com',
            username: userRecord.displayName || (userRecord.email ? userRecord.email.split('@')[0] : 'Unknown'),
            status: 'active'
          };
        } catch (error) {
          throw new Error('Target user not found');
        }

        // Create wallet with initial balance
        transaction.set(targetWalletRef, {
          userId: targetUserId,
          email: userData.email,
          username: userData.username,
          balance: sanitizedAmount,
          balanceCents: amountInCents,
          walletId: `WALLET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          currency: 'USD',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          totalDeposits: sanitizedAmount,
          totalWithdrawn: 0,
          totalWon: 0,
          totalLost: 0,
          status: 'active',
          kycStatus: 'pending',
          settings: {
            lowBalanceAlert: true,
            transactionNotifications: true
          },
          version: 1
        });

        currentBalance = 0;
      }

      const newBalance = currentBalance + sanitizedAmount;
      const newBalanceCents = Math.round(newBalance * 100);

      // Update balance if wallet already exists
      if (targetWalletDoc.exists) {
        transaction.update(targetWalletRef, {
          balance: newBalance,
          balanceCents: newBalanceCents,
          totalDeposits: admin.firestore.FieldValue.increment(sanitizedAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Create transaction record
      const transactionId = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const transactionRef = db.collection('transactions').doc(transactionId);

      transaction.set(transactionRef, {
        id: transactionId,
        userId: targetUserId,
        type: 'admin_adjustment',
        subType: 'credit',
        amount: sanitizedAmount,
        amountCents: amountInCents,
        description: reason,
        notes: notes,
        status: 'completed',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userEmail: userData.email,
        username: userData.username,
        adminId: adminId,
        adminEmail: adminEmail,
        previousBalance: currentBalance,
        newBalance: newBalance,
        previousBalanceCents: Math.round(currentBalance * 100),
        newBalanceCents: newBalanceCents,
        metadata: {
          action: 'credit',
          reason: reason,
          notes: notes,
          ...metadata
        },
        ipAddress: metadata.ipAddress || (context.rawRequest && context.rawRequest.ip) || 'unknown',
        userAgent: metadata.userAgent || (context.rawRequest && context.rawRequest.headers['user-agent']) || 'unknown'
      });

      // Create admin log
      const adminLogId = `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const adminLogRef = db.collection('admin_logs').doc(adminLogId);

      transaction.set(adminLogRef, {
        id: adminLogId,
        adminId: adminId,
        adminEmail: adminEmail,
        action: 'balance_adjustment',
        targetUserId: targetUserId,
        amount: sanitizedAmount,
        amountCents: amountInCents,
        reason: reason,
        notes: notes,
        previousBalance: currentBalance,
        newBalance: newBalance,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
          ...metadata,
          transactionId: transactionId,
          functionCallId: (context.rawRequest && context.rawRequest.headers['function-call-id']) || 'unknown'
        }
      });

      // Update admin stats
      const adminStatsRef = db.collection('admin_stats').doc(adminId);
      transaction.set(adminStatsRef, {
        totalAdjustments: admin.firestore.FieldValue.increment(1),
        totalAmountAdjusted: admin.firestore.FieldValue.increment(sanitizedAmount),
        lastAdjustment: admin.firestore.FieldValue.serverTimestamp(),
        lastAdjustmentTo: targetUserId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Update user notification if enabled
      if (userData.settings && userData.settings.transactionNotifications !== false) {
        const notificationRef = db.collection('notifications').doc();
        transaction.set(notificationRef, {
          userId: targetUserId,
          type: 'balance_adjustment',
          title: 'Balance Updated',
          message: `Admin has adjusted your balance by $${sanitizedAmount.toFixed(2)}. Reason: ${reason}`,
          data: {
            amount: sanitizedAmount,
            reason: reason,
            transactionId: transactionId
          },
          read: false,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });
      }

      return {
        success: true,
        transactionId,
        previousBalance: currentBalance,
        newBalance,
        userEmail: userData.email
      };
    });

    // Send realtime update via Firebase Database (optional)
    if (result.success) {
      await admin.database().ref(`/balance_updates/${targetUserId}`).set({
        balance: result.newBalance,
        transactionId: result.transactionId,
        timestamp: Date.now()
      });
    }

    return {
      success: true,
      message: `Successfully transferred $${sanitizedAmount.toFixed(2)} to user ${result.userEmail}`,
      transactionId: result.transactionId,
      previousBalance: result.previousBalance,
      newBalance: result.newBalance
    };

  } catch (error) {
    console.error('Admin transfer error:', error);

    // Log the error
    await db.collection('admin_error_logs').add({
      action: 'admin_transfer',
      errorMessage: error.message,
      adminId: adminId,
      targetUserId: targetUserId,
      amount: sanitizedAmount,
      reason: reason,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      stack: error.stack
    });

    // Return appropriate error
    if (error.message.includes('permission') || error.message.includes('unauthorized')) {
      throw new functions.https.HttpsError('permission-denied', error.message);
    } else if (error.message.includes('not found')) {
      throw new functions.https.HttpsError('not-found', error.message);
    } else if (error.message.includes('wallet is')) {
      throw new functions.https.HttpsError('failed-precondition', error.message);
    } else {
      throw new functions.https.HttpsError('internal', 'Transfer failed. Please try again.');
    }
  }
});
