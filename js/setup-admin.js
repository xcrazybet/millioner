// setup-admin.js
const admin = require('firebase-admin');
const fs = require('fs');

// Download service account key from Firebase Console:
// Project Settings → Service Accounts → Generate New Private Key
const serviceAccount = require('./service-account-key.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function setupAdminUser() {
  try {
    const email = 'admin@x-bet.com'; // Change this to your admin email
    const password = 'Admin@123456'; // Change this to a strong password
    
    // 1. Create admin user in Firebase Auth
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      emailVerified: true,
      disabled: false
    });
    
    console.log('✅ Admin user created in Firebase Auth:', userRecord.uid);
    
    // 2. Add to admins collection
    await db.collection('admins').doc(userRecord.uid).set({
      email: email,
      role: 'super',
      permissions: ['all'],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: true
    });
    
    console.log('✅ Admin added to admins collection');
    
    // 3. Create admin wallet
    await db.collection('wallets').doc(userRecord.uid).set({
      userId: userRecord.uid,
      email: email,
      username: 'admin',
      balance: 0,
      currency: 'USD',
      walletId: 'ADMIN-WALLET',
      isAdmin: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ Admin wallet created');
    
    // 4. Set custom claims (optional but recommended)
    await auth.setCustomUserClaims(userRecord.uid, {
      admin: true,
      role: 'super',
      permissions: ['all']
    });
    
    console.log('✅ Custom claims set');
    
    console.log('\n🎉 ADMIN SETUP COMPLETE!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('UID:', userRecord.uid);
    console.log('\n⚠️  IMPORTANT: Change the password immediately!');
    
  } catch (error) {
    console.error('❌ Error setting up admin:', error);
  }
}

setupAdminUser();
