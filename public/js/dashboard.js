import { auth, db } from './auth.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const initDashboard = () => {
    auth.onAuthStateChanged((user) => {
        if (user) {
            // Listen to real-time balance updates
            const walletRef = doc(db, "wallets", user.uid);
            onSnapshot(walletRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    document.getElementById('balanceDisplay').innerText = `$${data.balance.toLocaleString()}`;
                    document.getElementById('userEmail').innerText = user.email;
                }
            });
        } else {
            window.location.href = 'login.html';
        }
    });
};
