const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// ==================== AUTO-CREATE WALLETS ====================
exports.createUserWallet = functions.auth.user().onCreate(async (user) => {
  console.log(`[FUNCTION] Creating wallet for new user: ${user.uid}`);
  
  try {
    const walletData = {
      userId: user.uid,
      email: user.email,
      username: user.email ? user.email.split('@')[0] : 'user',
      balance: 0.0,
      status: 'active',
      kycStatus: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      totalDeposited: 0.0,
      totalWithdrawn: 0.0,
      totalWon: 0.0,
      totalLost: 0.0,
      adminNotes: []
    };

    await db.collection('wallets').doc(user.uid).set(walletData);
    
    console.log(`[SUCCESS] Wallet created for user: ${user.uid}`);
    return { success: true, userId: user.uid };
    
  } catch (error) {
    console.error(`[ERROR] Failed to create wallet for ${user.uid}:`, error);
    throw error; // Re-throw so Firebase logs it
  }
});

// ==================== CREATE WALLETS FOR EXISTING USERS ====================
exports.createMissingWallets = functions.https.onRequest(async (req, res) => {
  try {
    // Simple security check
    if (req.query.secret !== 'YOUR_SECRET_KEY') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    console.log('[FUNCTION] Creating missing wallets for existing users...');
    
    // Get all auth users
    const authUsers = await admin.auth().listUsers();
    console.log(`[INFO] Found ${authUsers.users.length} users in Auth`);
    
    // Get existing wallets
    const walletsSnapshot = await db.collection('wallets').get();
    const existingUserIds = new Set();
    walletsSnapshot.forEach(doc => existingUserIds.add(doc.id));
    
    console.log(`[INFO] Found ${existingUserIds.size} existing wallets`);
    
    // Create missing wallets
    const batch = db.batch();
    let created = 0;
    let skipped = 0;
    
    for (const user of authUsers.users) {
      if (!existingUserIds.has(user.uid)) {
        const walletRef = db.collection('wallets').doc(user.uid);
        const walletData = {
          userId: user.uid,
          email: user.email,
          username: user.email ? user.email.split('@')[0] : 'user',
          balance: 0.0,
          status: 'active',
          kycStatus: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastLogin: admin.firestore.FieldValue.serverTimestamp(),
          totalDeposited: 0.0,
          totalWithdrawn: 0.0,
          totalWon: 0.0,
          totalLost: 0.0,
          adminNotes: []
        };
        
        batch.set(walletRef, walletData);
        created++;
        
        // Firestore batch limit (500)
        if (created % 400 === 0) {
          await batch.commit();
          console.log(`[PROGRESS] Created ${created} wallets so far...`);
        }
      } else {
        skipped++;
      }
    }
    
    // Commit remaining
    if (created % 400 !== 0) {
      await batch.commit();
    }
    
    console.log(`[COMPLETE] Created ${created} new wallets, skipped ${skipped} existing`);
    
    return res.json({
      success: true,
      created: created,
      skipped: skipped,
      totalUsers: authUsers.users.length,
      message: `Created ${created} wallets for existing users`
    });
    
  } catch (error) {
    console.error('[ERROR] createMissingWallets failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN BALANCE ADJUSTMENT ====================
exports.adminAdjustBalance = functions.https.onCall(async (data, context) => {
  // Verify admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Not authenticated');
  }
  
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || !adminDoc.data().active) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const { userId, amount, action, reason, notes } = data;
  
  if (!userId || !amount || !action) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      // Get wallet
      const walletRef = db.collection('wallets').doc(userId);
      const walletDoc = await transaction.get(walletRef);
      
      if (!walletDoc.exists) {
        throw new Error('User wallet not found');
      }
      
      const walletData = walletDoc.data();
      let newBalance = walletData.balance;
      
      // Calculate new balance
      if (action === 'add') {
        newBalance = walletData.balance + amount;
      } else if (action === 'subtract') {
        if (walletData.balance < amount) {
          throw new Error('Insufficient balance');
        }
        newBalance = walletData.balance - amount;
      } else if (action === 'set') {
        newBalance = amount;
      } else {
        throw new Error('Invalid action');
      }
      
      // Update wallet
      transaction.update(walletRef, {
        balance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Create transaction record
      const txRef = db.collection('transactions').doc();
      const txData = {
        transactionId: txRef.id,
        userId: userId,
        type: 'admin_adjustment',
        action: action,
        amount: amount,
        reason: reason || 'Admin adjustment',
        notes: notes || '',
        previousBalance: walletData.balance,
        newBalance: newBalance,
        adminId: context.auth.uid,
        adminEmail: adminDoc.data().email,
        status: 'completed',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      };
      
      transaction.set(txRef, txData);
      
      // Create admin log
      const logRef = db.collection('admin_logs').doc();
      transaction.set(logRef, {
        adminId: context.auth.uid,
        adminEmail: adminDoc.data().email,
        action: 'balance_adjustment',
        targetUserId: userId,
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
        previousBalance: walletData.balance,
        newBalance: newBalance,
        change: newBalance - walletData.balance
      };
    });
    
    console.log(`[ADMIN] Balance adjusted for ${userId} by ${context.auth.uid}`);
    return result;
    
  } catch (error) {
    console.error('[ERROR] Balance adjustment failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== GET ALL USERS FOR ADMIN ====================
exports.getAdminUsers = functions.https.onCall(async (data, context) => {
  // Verify admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Not authenticated');
  }
  
  const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || !adminDoc.data().active) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  try {
    const { page = 1, limit = 50, search = '' } = data;
    const offset = (page - 1) * limit;
    
    let query = db.collection('wallets');
    
    // Apply search filter
    if (search) {
      query = query.where('email', '>=', search)
                  .where('email', '<=', search + '\uf8ff');
    }
    
    // Get total count
    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;
    
    // Get paginated data
    const snapshot = await query
      .orderBy('createdAt', 'desc')
      .offset(offset)
      .limit(limit)
      .get();
    
    const users = [];
    snapshot.forEach(doc => {
      users.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return {
      success: true,
      users: users,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        pages: Math.ceil(total / limit)
      }
    };
    
  } catch (error) {
    console.error('[ERROR] getAdminUsers failed:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== DEPLOY INSTRUCTIONS ====================
// 1. cd functions
// 2. npm install
// 3. firebase deploy --only functions
// 4. Then run: https://your-region-your-project.cloudfunctions.net/createMissingWallets?secret=YOUR_SECRET_KEY
