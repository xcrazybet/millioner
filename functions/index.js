// ==================== ADMIN BALANCE ADJUSTMENT (FIXED) ====================
exports.adminAdjustBalance = functions.https.onCall(async (data, context) => {
  const adminData = await validateAdmin(context, 'finance');
  
  const { 
    userId, 
    amount, 
    action, 
    reason = 'Admin adjustment', 
    notes = '',
    reference = ''
  } = data;
  
  if (!userId || typeof amount !== 'number' || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid userId or amount');
  }
  
  if (!['add', 'subtract', 'set'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid action type');
  }
  
  if (amount > 1000000) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      `Amount exceeds maximum adjustment limit of $1,000,000`
    );
  }
  
  if (!reason.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'Reason is required');
  }
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      // === ALL READS MUST BE DONE FIRST ===
      
      // 1. Get wallet
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);
      
      if (!walletDoc.exists) {
        throw new Error('User wallet not found');
      }
      
      const walletData = walletDoc.data();
      let newBalance = walletData.balance;
      let change = 0;
      
      // 2. Get admin document (for logging)
      const adminRef = db.collection('admins').doc(context.auth.uid);
      const adminDoc = await transaction.get(adminRef);
      const adminEmail = adminDoc.exists ? adminDoc.data().email : 'Unknown';
      
      // 3. Calculate new balance
      switch (action) {
        case 'add':
          newBalance = walletData.balance + amount;
          change = amount;
          break;
          
        case 'subtract':
          if (walletData.balance < amount) {
            throw new Error(`Insufficient balance. Available: ${walletData.balance}, Required: ${amount}`);
          }
          newBalance = walletData.balance - amount;
          change = -amount;
          break;
          
        case 'set':
          newBalance = amount;
          change = amount - walletData.balance;
          break;
      }
      
      // 4. Check balance limits
      if (newBalance < 0) {
        throw new Error('Balance cannot be negative');
      }
      
      const maxBalance = walletData.limits?.maxBalance || 1000000;
      if (newBalance > maxBalance) {
        throw new Error(`Balance exceeds maximum limit of ${maxBalance}`);
      }
      
      // === NOW DO ALL WRITES ===
      
      // 1. Update wallet
      transaction.update(walletRef, {
        balance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastTransaction: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // 2. Create transaction record
      const txRef = db.collection('transactions').doc();
      transaction.set(txRef, {
        transactionId: txRef.id,
        userId: userId,
        type: 'admin_adjustment',
        subType: action,
        amount: Math.abs(change),
        change: change,
        reason: reason,
        notes: notes,
        reference: reference,
        previousBalance: walletData.balance,
        newBalance: newBalance,
        adminId: context.auth.uid,
        adminEmail: adminEmail,
        adminRole: adminData.role,
        status: 'completed',
        requiresReview: Math.abs(change) > 1000,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // 3. Create admin log
      const logRef = db.collection('admin_logs').doc();
      transaction.set(logRef, {
        adminId: context.auth.uid,
        adminEmail: adminEmail,
        action: 'balance_adjustment',
        targetUserId: userId,
        targetEmail: walletData.email,
        amount: amount,
        actionType: action,
        reason: reason,
        previousBalance: walletData.balance,
        newBalance: newBalance,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        success: true,
        transactionId: txRef.id,
        userId: userId,
        userEmail: walletData.email,
        previousBalance: walletData.balance,
        newBalance: newBalance,
        change: change,
        message: `Balance ${action === 'add' ? 'added' : action === 'subtract' ? 'subtracted' : 'set'} successfully`
      };
    });
    
    return result;
    
  } catch (error) {
    console.error('[ERROR] Balance adjustment failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== PROCESS DEPOSIT (FIXED - Transaction Compliant) ====================
exports.processDeposit = functions.https.onCall(async (data, context) => {
  const adminData = await validateAdmin(context, 'finance');
  
  const { requestId, action, notes = '' } = data;
  
  if (!requestId || !['approve', 'reject'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid parameters');
  }
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      // === ALL READS FIRST ===
      
      // 1. Get deposit request
      const requestRef = db.collection('deposit_requests').doc(requestId);
      const requestDoc = await transaction.get(requestRef);
      
      if (!requestDoc.exists) {
        throw new Error('Deposit request not found');
      }
      
      const requestData = requestDoc.data();
      
      // 2. Check if already processed
      if (requestData.status !== 'pending') {
        throw new Error(`Deposit request already ${requestData.status}`);
      }
      
      // 3. Get admin email for logging
      const adminRef = db.collection('admins').doc(context.auth.uid);
      const adminDoc = await transaction.get(adminRef);
      const adminEmail = adminDoc.exists ? adminDoc.data().email : 'Unknown';
      
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      
      // === IF APPROVING, READ USER WALLET ===
      let walletData = null;
      if (action === 'approve') {
        const walletRef = db.collection('wallets').doc(requestData.userId);
        const walletDoc = await transaction.get(walletRef);
        
        if (!walletDoc.exists) {
          throw new Error('User wallet not found');
        }
        
        walletData = walletDoc.data();
      }
      
      // === NOW DO ALL WRITES ===
      
      // 1. Update deposit request
      transaction.update(requestRef, {
        status: newStatus,
        processedBy: context.auth.uid,
        processedByEmail: adminEmail,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        notes: notes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      if (action === 'approve' && walletData) {
        const walletRef = db.collection('wallets').doc(requestData.userId);
        const newBalance = walletData.balance + requestData.amount;
        
        // 2. Update wallet balance
        transaction.update(walletRef, {
          balance: newBalance,
          totalDeposited: (walletData.totalDeposited || 0) + requestData.amount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 3. Create transaction record
        const txRef = db.collection('transactions').doc();
        transaction.set(txRef, {
          transactionId: txRef.id,
          userId: requestData.userId,
          type: 'deposit',
          amount: requestData.amount,
          currency: requestData.currency || 'USD',
          requestId: requestId,
          previousBalance: walletData.balance,
          newBalance: newBalance,
          status: 'completed',
          processedBy: context.auth.uid,
          processedByEmail: adminEmail,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 4. Create user notification
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
        
        return {
          success: true,
          action: 'approved',
          amount: requestData.amount,
          userId: requestData.userId,
          userEmail: requestData.userEmail,
          newBalance: newBalance,
          message: `Deposit approved. New balance: $${newBalance.toFixed(2)}`
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

// ==================== KEY RULE: Transactions in Firestore ====================
/*
IMPORTANT: Firestore Transactions have strict rules:
1. ALL reads must be done BEFORE any writes
2. You cannot read a document after writing to it in the same transaction
3. You cannot read outside the transaction path
4. Example of WRONG pattern:
   transaction.update(docRef, {...});  // Write first
   const doc = await transaction.get(docRef);  // Then read - ERROR!
   
5. Example of CORRECT pattern:
   const doc = await transaction.get(docRef);  // Read first
   transaction.update(docRef, {...});  // Then write
*/

// ==================== SIMPLIFIED PROCESS WITHDRAWAL ====================
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
    // First, read all data BEFORE transaction
    const withdrawalDoc = await db.collection('withdrawals').doc(withdrawalId).get();
    if (!withdrawalDoc.exists) {
      throw new Error('Withdrawal request not found');
    }
    
    const withdrawalData = withdrawalDoc.data();
    
    if (withdrawalData.status !== 'pending') {
      throw new Error(`Withdrawal already ${withdrawalData.status}`);
    }
    
    // Get admin email
    const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
    const adminEmail = adminDoc.exists ? adminDoc.data().email : 'Unknown';
    
    const result = await db.runTransaction(async (transaction) => {
      // If approving, read wallet BEFORE writing
      let walletData = null;
      if (action === 'approve') {
        const walletRef = db.collection('wallets').doc(withdrawalData.userId);
        const walletDoc = await transaction.get(walletRef);
        
        if (!walletDoc.exists) {
          throw new Error('User wallet not found');
        }
        
        walletData = walletDoc.data();
        
        // Check balance
        if (walletData.balance < withdrawalData.amount) {
          throw new Error('Insufficient balance for withdrawal');
        }
      }
      
      // === NOW DO WRITES ===
      
      const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      
      // Update withdrawal request
      transaction.update(withdrawalRef, {
        status: newStatus,
        processedBy: context.auth.uid,
        processedByEmail: adminEmail,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        txHash: txHash,
        notes: notes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      if (action === 'approve' && walletData) {
        const walletRef = db.collection('wallets').doc(withdrawalData.userId);
        const newBalance = walletData.balance - withdrawalData.amount;
        
        // Update wallet
        transaction.update(walletRef, {
          balance: newBalance,
          totalWithdrawn: (walletData.totalWithdrawn || 0) + withdrawalData.amount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Create transaction
        const txRef = db.collection('transactions').doc();
        transaction.set(txRef, {
          transactionId: txRef.id,
          userId: withdrawalData.userId,
          type: 'withdrawal',
          amount: withdrawalData.amount,
          walletAddress: withdrawalData.walletAddress,
          network: withdrawalData.network || 'ETH',
          withdrawalId: withdrawalId,
          txHash: txHash,
          previousBalance: walletData.balance,
          newBalance: newBalance,
          status: 'completed',
          processedBy: context.auth.uid,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return {
          success: true,
          action: 'approved',
          amount: withdrawalData.amount,
          userId: withdrawalData.userId,
          txHash: txHash,
          newBalance: newBalance,
          message: `Withdrawal approved. New balance: $${newBalance.toFixed(2)}`
        };
        
      } else {
        return {
          success: true,
          action: 'rejected',
          amount: withdrawalData.amount,
          userId: withdrawalData.userId,
          message: 'Withdrawal request rejected'
        };
      }
    });
    
    // Create notifications OUTSIDE transaction (better performance)
    if (action === 'approve') {
      await db.collection('notifications').add({
        userId: withdrawalData.userId,
        type: 'withdrawal_approved',
        title: 'Withdrawal Approved!',
        message: `Your withdrawal of $${withdrawalData.amount.toFixed(2)} has been processed`,
        data: {
          withdrawalId: withdrawalId,
          amount: withdrawalData.amount,
          txHash: txHash
        },
        read: false,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await db.collection('notifications').add({
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
    }
    
    return result;
    
  } catch (error) {
    console.error('Process withdrawal failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
