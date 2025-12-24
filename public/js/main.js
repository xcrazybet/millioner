import { auth } from './modules/auth.js';
import { initDashboard } from './modules/dashboard.js';
import { executeSecureBet } from './utils/api.js';

// Initialize the Dashboard state
initDashboard();

const betBtn = document.getElementById('betBtn');
const statusMsg = document.getElementById('statusMessage');

betBtn.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('betInput').value);
    const user = auth.currentUser;

    if (!user || isNaN(amount) || amount <= 0) {
        statusMsg.innerText = "Please enter a valid amount";
        return;
    }

    betBtn.disabled = true;
    statusMsg.innerText = "Placing bet...";

    try {
        const result = await executeSecureBet(user.uid, amount, 'coin_flip');
        statusMsg.className = result.isWin ? "status-win" : "status-loss";
        statusMsg.innerText = result.isWin ? `WIN! +$${amount}` : `LOSS! -$${amount}`;
    } catch (err) {
        statusMsg.innerText = "Error: " + err;
        statusMsg.className = "status-error";
    } finally {
        betBtn.disabled = false;
    }
});
