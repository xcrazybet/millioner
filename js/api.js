import { db } from '../modules/auth.js';
import { 
    doc, 
    runTransaction, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Executes a secure bet using a Firestore Transaction.
 * This prevents race conditions where a user clicks twice.
 */
export const executeSecureBet = async (userId, betAmount, gameId) => {
    const walletRef = doc(db, "wallets", userId);
    const logRef = doc(db, "transactions", `${userId}_${Date.now()}`);

    try {
        return await runTransaction(db, async (transaction) => {
            const walletSnap = await transaction.get(walletRef);
            if (!walletSnap.exists()) throw "Wallet does not exist!";

            const currentBalance = walletSnap.data().balance;
            if (currentBalance < betAmount) throw "Insufficient funds";

            // Determine outcome (Server-side logic simulation)
            const isWin = Math.random() > 0.5;
            const multiplier = 2.0;
            const netChange = isWin ? (betAmount * (multiplier - 1)) : -betAmount;
            const newBalance = currentBalance + netChange;

            // 1. Update Balance
            transaction.update(walletRef, { 
                balance: newBalance,
                lastUpdated: serverTimestamp() 
            });

            // 2. Log Transaction
            transaction.set(logRef, {
                userId,
                gameId,
                amount: betAmount,
                type: isWin ? 'WIN' : 'LOSS',
                netChange,
                timestamp: serverTimestamp()
            });

            return { isWin, newBalance };
        });
    } catch (error) {
        console.error("Transaction failed: ", error);
        throw error;
    }
};
