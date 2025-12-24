// Ensure you have these imports at the very top
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = getFirestore(app); // Connects to your "x-bet-prod-jd" database

export const registerUser = async (email, password) => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // THIS IS THE LINE THAT CREATES THE WALLET IN YOUR SCREENSHOT
        await setDoc(doc(db, "wallets", user.uid), {
            email: user.email,
            balance: 1000,
            createdAt: new Date()
        });

        return { user: user, error: null };
    } catch (error) {
        return { user: null, error: error.message };
    }
};
