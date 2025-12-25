import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    deleteUser,
    sendEmailVerification 
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export const registerUser = async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    let userRecord = null;

    try {
        // 2️⃣ Throwing proper Error instances
        if (password.length < 8) {
            const err = new Error("Weak password");
            err.code = 'auth/weak-password';
            throw err;
        }

        // Create Auth User
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        userRecord = userCredential.user;

        // 8️⃣ Send Verification (Optional but recommended)
        await sendEmailVerification(userRecord).catch(e => console.error("Verification email failed", e));

        // 1️⃣ Overwrite Guard
        const walletRef = doc(db, "wallets", userRecord.uid);
        const walletSnap = await getDoc(walletRef);
        if (walletSnap.exists()) throw new Error("Wallet already exists.");

        // 3️⃣, 4️⃣, 6️⃣ structured Wallet Creation
        await setDoc(walletRef, {
            profile: {
                email: normalizedEmail,
                createdAt: serverTimestamp(),
            },
            wallet: {
                balance: 1000, 
                currency: "USD"
            },
            metadata: {
                isActive: true,
                role: "player"
            }
        });

        return { user: userRecord, error: null };

    } catch (error) {
        // 1️⃣ & 5️⃣ Robust Rollback
        if (userRecord && userRecord.uid && error.code !== 'auth/email-already-in-use') {
            await deleteUser(userRecord).catch(() => {});
        }
        console.error("Registration Failure:", error);
        return { user: null, error: formatFirebaseError(error.code || error.message) };
    }
};

export const loginUser = async (email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        const user = userCredential.user;

        // 3️⃣ Login Resilience: Check wallet exists before updating
        const walletRef = doc(db, "wallets", user.uid);
        const walletSnap = await getDoc(walletRef);
        
        if (walletSnap.exists()) {
            await updateDoc(walletRef, { "metadata.lastLogin": serverTimestamp() });
        }

        return { user, error: null };
    } catch (error) {
        return { user: null, error: formatFirebaseError(error.code) };
    }
};

export const logoutUser = () => signOut(auth);

function formatFirebaseError(code) {
    const errors = {
        'auth/email-already-in-use': 'Account already exists.',
        'auth/invalid-email': 'Invalid email format.',
        'auth/weak-password': 'Password must be 8+ characters.',
        'auth/user-not-found': 'Account not found.',
        'auth/wrong-password': 'Incorrect password.'
    };
    return errors[code] || 'System Error. Try again.';
}

export { auth, db };
