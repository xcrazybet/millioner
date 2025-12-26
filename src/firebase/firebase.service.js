import { auth, db, functions, httpsCallable } from './firebase.config.js';

// Authentication functions
export const signUp = async (email, password) => {
  try {
    const { createUserWithEmailAndPassword } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
    );
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const signIn = async (email, password) => {
  try {
    const { signInWithEmailAndPassword } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
    );
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const signOut = async () => {
  try {
    await auth.signOut();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Cloud Functions
export const callCloudFunction = async (functionName, data) => {
  try {
    const functionCall = httpsCallable(functions, functionName);
    const result = await functionCall(data);
    return { success: true, data: result.data };
  } catch (error) {
    console.error(`Cloud Function ${functionName} error:`, error);
    return { 
      success: false, 
      error: error.message,
      details: error.details || error.code || 'Unknown error'
    };
  }
};

// Specific Cloud Function calls
export const transferToUser = (toUserId, amount, note) => 
  callCloudFunction('transferToUser', { toUserId, amount, note });

export const createDepositRequest = (amount, paymentMethod, currency = 'USD', reference = '') => 
  callCloudFunction('createDepositRequest', { amount, paymentMethod, currency, reference });

export const createWithdrawalRequest = (amount, walletAddress, network = 'ETH', notes = '') => 
  callCloudFunction('createWithdrawalRequest', { amount, walletAddress, network, notes });

export const adminSendToUser = (userId, amount, reason = '', notes = '') => 
  callCloudFunction('adminSendToUser', { userId, amount, reason, notes });

// Firestore helpers
export const getUserWallet = async (userId) => {
  try {
    const { doc, getDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
    );
    const walletDoc = await getDoc(doc(db, 'wallets', userId));
    if (walletDoc.exists()) {
      return { success: true, data: walletDoc.data() };
    } else {
      return { success: false, error: 'Wallet not found' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const getTransactions = async (userId, limit = 20) => {
  try {
    const { collection, query, where, orderBy, limit, getDocs } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
    );
    const transactionsQuery = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limit)
    );
    const snapshot = await getDocs(transactionsQuery);
    const transactions = [];
    snapshot.forEach(doc => {
      transactions.push({ id: doc.id, ...doc.data() });
    });
    return { success: true, data: transactions };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Check if user is admin
export const checkIfAdmin = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return { success: false, isAdmin: false };
    
    const { doc, getDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
    );
    const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
    return { 
      success: true, 
      isAdmin: adminDoc.exists() && adminDoc.data().active === true 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
