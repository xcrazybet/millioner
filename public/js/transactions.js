import { db, auth } from './auth.js';
import { collection, query, where, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const listenToTransactions = (containerId) => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
        collection(db, "transactions"),
        where("userId", "==", user.uid),
        orderBy("timestamp", "desc"),
        limit(5)
    );

    onSnapshot(q, (snapshot) => {
        const container = document.getElementById(containerId);
        container.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            const isWin = data.type === 'WIN';
            return `
                <div class="transaction-item" style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #334155;">
                    <span>${isWin ? '💰' : '📉'} ${data.gameId}</span>
                    <span style="color: ${isWin ? '#22c55e' : '#ef4444'}">
                        ${isWin ? '+' : ''}${data.netChange}
                    </span>
                </div>
            `;
        }).join('');
    });
};
