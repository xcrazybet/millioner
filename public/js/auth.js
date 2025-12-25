import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    deleteUser 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "../config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/**
 * 1️⃣, 2️⃣, 4️⃣, 8️⃣ - SECURE REGISTRATION
 * Handles email normalization, failure cleanup, and overwrite protection.
 */
export const registerUser = async (email, password) => {
    // 4️⃣ Input Normalization
    const normalizedEmail = email.trim().toLowerCase();
    let userRecord = null;

    try {
        // 5️⃣ Pre-flight check (UX)
        if (password.length < 8) throw { code: 'auth/weak-password' };

        // 2️⃣ Step 1: Create Auth User
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        userRecord = userCredential.user;

        // 1️⃣ Step 2: Check for existing wallet (Overwrite Guard)
        const walletRef = doc(db, "wallets", userRecord.uid);
        const walletSnap = await getDoc(walletRef);

        if (walletSnap.exists()) {
            throw new Error("Wallet already exists for this UID.");
        }

        // 3️⃣ & 8️⃣ Step 3: Create Structured Wallet
        // Note: For 100% security, 'balance' should be set via Cloud Functions.
        // As a client-side safeguard, Firestore Rules must be set to prevent manual balance writes.
        await setDoc(walletRef, {
            profile: {
                email: normalizedEmail,
                createdAt: serverTimestamp(),
            },
            wallet: {
                balance: 1000, // 3️⃣ Starting Bonus
                currency: "USD"
            },
            metadata: {
                isActive: true,
                role: "player"
            }
        });

        return { user: userRecord, error: null };

    } catch (error) {
        // 2️⃣ TRANSACTION SAFETY: Rollback Auth if Firestore fails
        if (userRecord && error.code !== 'auth/email-already-in-use') {
            await deleteUser(userRecord).catch(err => console.error("Rollback failed:", err));
        }
        
        // 7️⃣ Detailed Logging
        console.error("Registration Failure:", error);
        return { user: null, error: formatFirebaseError(error.code || error.message) };
    }
};

/**
 * 9️⃣ - SECURE LOGIN
 * Updates timestamp only on successful login.
 */
export const loginUser = async (email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        
        // 9️⃣ Update lastLogin timestamp
        const walletRef = doc(db, "wallets", userCredential.user.uid);
        await updateDoc(walletRef, {
            "metadata.lastLogin": serverTimestamp()
        });

        return { user: userCredential.user, error: null };
    } catch (error) {
        console.error("Login Failure:", error);
        return { user: null, error: formatFirebaseError(error.code) };
    }
};

export const logoutUser = () => signOut(auth);

/**
 * 3️⃣ & 1️⃣1️⃣ - ERROR NORMALIZATION
 */
function formatFirebaseError(code) {
    const errors = {
        'auth/email-already-in-use': 'Account already exists with this email.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/weak-password': 'Password must be at least 8 characters.',
        'auth/user-not-found': 'Account not found.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/network-request-failed': 'Network error. Please check your connection.'
    };
    return errors[code] || 'Authentication failed. Please try again.';
}

export { auth, db };
