import { db, auth } from './auth.js';
import { doc, updateDoc, increment, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const placeBet = async (amount) => {
    const user = auth.currentUser;
    if (!user) return alert("Please login");

    const walletRef = doc(db, "wallets", user.uid);
    const walletSnap = await getDoc(walletRef);
    const currentBalance = walletSnap.data().balance;

    if (currentBalance < amount) {
        alert("Insufficient Balance!");
        return;
    }

    // Example logic: Simple Coin Flip (50/50 chance)
    const isWin = Math.random() > 0.5;
    const change = isWin ? amount : -amount;

    try {
        await updateDoc(walletRef, {
            balance: increment(change)
        });
        
        alert(isWin ? `Win! +$${amount}` : `Lost! -$${amount}`);
    } catch (error) {
        console.error("Bet failed", error);
    }
};
