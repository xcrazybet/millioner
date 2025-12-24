import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "../config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export const registerUser = async (email, password) => {
    try {
        // 1. Create the User in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Create the Wallet in Firestore Database
        // This is what will make the "wallets" collection appear in your screenshot
        await setDoc(doc(db, "wallets", user.uid), {
            uid: user.uid,
            email: user.email,
            balance: 1000,
            createdAt: new Date()
        });

        return { user: user, error: null };
    } catch (error) {
        console.error("Firebase Error:", error);
        return { user: null, error: error.message };
    }
};

export { auth, db };
