// public/js/sports.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, addDoc, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA72Yo_YGqno9PX25p3yQBvyflcaM-NqEM",
    authDomain: "x-bet-prod-jd.firebaseapp.com",
    projectId: "x-bet-prod-jd",
    storageBucket: "x-bet-prod-jd.firebasestorage.app",
    messagingSenderId: "499334334535",
    appId: "1:499334334535:web:bebc1bf817e24d9e3c4962",
    measurementId: "G-PTV4XMYQ6P"
};

// Initialize
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);
const auth = getAuth(app);
const db = getFirestore(app);

// API Callables
const getLiveScores = httpsCallable(functions, 'getLiveScores');
const getUpcomingFixtures = httpsCallable(functions, 'getUpcomingFixtures');
const getFixtureOdds = httpsCallable(functions, 'getFixtureOdds');
const checkSportmonksStatus = httpsCallable(functions, 'checkSportmonksStatus');

// App State
let currentUser = null;
let userBalance = 0;
let betSlip = [];
let matchesData = {}; // Store full match objects by ID

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            initWallet();
            checkAPIStatus(); // New diagnostic call
            loadAppData();
        } else {
            showToast("Please login to place bets", "error");
            checkAPIStatus(); // New diagnostic call
            loadAppData(); // Still show matches to guests
        }
    });

    // Slip Listeners
    document.getElementById('betStake').addEventListener('input', updateSlipDisplay);
    document.getElementById('placeBetBtn').addEventListener('click', executeBet);
});

async function checkAPIStatus() {
    try {
        const status = await checkSportmonksStatus();
        console.log("Diagnostic API Status:", status.data);
        if (!status.data.configured) {
            console.error("API Token not found in Firebase config!");
            showToast("Backend Error: API Key missing. Please run deployment commands.", "error");
        }
    } catch (e) {
        console.error("Diagnostic call failed:", e);
    }
}

async function loadAppData() {
    renderLiveMatches();
    renderUpcomingMatches();
    // Auto-refresh live scores
    setInterval(renderLiveMatches, 30000);
}

function initWallet() {
    const walletRef = doc(db, "wallets", currentUser.uid);
    onSnapshot(walletRef, (snap) => {
        if (snap.exists()) {
            userBalance = snap.data().balance || 0;
            document.getElementById('balanceDisplay').textContent = `$${userBalance.toFixed(2)}`;
        }
    });
}

async function renderLiveMatches() {
    const container = document.getElementById('liveMatches');
    try {
        console.log("sports.js: Calling getLiveScores...");
        const result = await getLiveScores();
        console.log("sports.js: getLiveScores Result:", result);
        
        const responseData = result.data;
        if (!responseData) throw new Error("Cloud Function returned no data");
        if (!responseData.success) throw new Error(responseData.error || "Function reported failure");

        const matches = responseData.data?.data;
        if (!matches || matches.length === 0) {
            container.innerHTML = '<div class="empty-slip"><i class="fas fa-info-circle"></i> No live matches currently in play.</div>';
            return;
        }

        container.innerHTML = matches.map(m => {
            matchesData[m.id] = m;
            const home = m.participants?.find(p => p.meta?.location === 'home');
            const away = m.participants?.find(p => p.meta?.location === 'away');
            const score = m.scores?.find(s => s.description === 'CURRENT');
            
            return `
                <div class="match-card">
                    <div class="match-meta">
                        <span>${m.league?.name || 'Football'}</span>
                        <span class="match-time">LIVE ${m.time?.minute || 0}'</span>
                    </div>
                    <div class="match-teams">
                        <div class="team">
                            <img src="${home?.image_path || 'assets/images/placeholder.png'}" class="team-img" onerror="this.src='assets/images/placeholder.png'">
                            <div class="team-name">${home?.name || 'Home'}</div>
                        </div>
                        <div class="match-score">${score?.home_score || 0} - ${score?.away_score || 0}</div>
                        <div class="team">
                            <img src="${away?.image_path || 'assets/images/placeholder.png'}" class="team-img" onerror="this.src='assets/images/placeholder.png'">
                            <div class="team-name">${away?.name || 'Away'}</div>
                        </div>
                    </div>
                    <div class="odds-container">
                        <div class="odd-box" onclick="addToSlip(${m.id}, '1', 1.85)">
                            <span class="odd-label">1</span>
                            <span class="odd-value">1.85</span>
                        </div>
                        <div class="odd-box" onclick="addToSlip(${m.id}, 'X', 3.40)">
                            <span class="odd-label">X</span>
                            <span class="odd-value">3.40</span>
                        </div>
                        <div class="odd-box" onclick="addToSlip(${m.id}, '2', 2.10)">
                            <span class="odd-label">2</span>
                            <span class="odd-value">2.10</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error("sports.js: Error in renderLiveMatches:", e);
        const errorMsg = e.code ? `${e.code}: ${e.message}` : e.message;
        container.innerHTML = `<div class="empty-slip" style="color: #ff4757;">
            <i class="fas fa-exclamation-triangle"></i><br>
            Failed to load live data.<br>
            <small style="opacity: 0.8; background: #000; padding: 2px 5px; border-radius: 4px;">Error: ${errorMsg}</small>
        </div>`;
    }
}

async function renderUpcomingMatches() {
    const container = document.getElementById('upcomingMatches');
    try {
        console.log("sports.js: Calling getUpcomingFixtures...");
        const result = await getUpcomingFixtures();
        console.log("sports.js: getUpcomingFixtures Result:", result);
        
        const responseData = result.data;
        if (!responseData) throw new Error("Cloud Function returned no data");
        if (!responseData.success) throw new Error(responseData.error || "Function reported failure");

        const matches = responseData.data?.data?.slice(0, 10);
        if (!matches || matches.length === 0) {
            container.innerHTML = '<div class="empty-slip">No upcoming fixtures found for today.</div>';
            return;
        }

        container.innerHTML = '';
        for (const m of matches) {
            matchesData[m.id] = m;
            const home = m.participants?.find(p => p.meta?.location === 'home');
            const away = m.participants?.find(p => p.meta?.location === 'away');
            const startTime = m.starting_at ? new Date(m.starting_at).toLocaleString([], { hour: '2-digit', minute: '2-digit' }) : 'TBA';
            
            // Default odds
            let odds = { home: 1.90, draw: 3.20, away: 2.50 };
            
            container.innerHTML += `
                <div class="match-card">
                    <div class="match-meta">
                        <span>${m.league?.name || 'Football'}</span>
                        <span>Today, ${startTime}</span>
                    </div>
                    <div class="match-teams">
                        <div class="team">
                            <img src="${home?.image_path || 'assets/images/placeholder.png'}" class="team-img" onerror="this.src='assets/images/placeholder.png'">
                            <div class="team-name">${home?.name || 'Home'}</div>
                        </div>
                        <div class="match-score">VS</div>
                        <div class="team">
                            <img src="${away?.image_path || 'assets/images/placeholder.png'}" class="team-img" onerror="this.src='assets/images/placeholder.png'">
                            <div class="team-name">${away?.name || 'Away'}</div>
                        </div>
                    </div>
                    <div class="odds-container">
                        <div class="odd-box" onclick="addToSlip(${m.id}, '1', ${odds.home})">
                            <span class="odd-label">Home</span>
                            <span class="odd-value">${odds.home}</span>
                        </div>
                        <div class="odd-box" onclick="addToSlip(${m.id}, 'X', ${odds.draw})">
                            <span class="odd-label">Draw</span>
                            <span class="odd-value">${odds.draw}</span>
                        </div>
                        <div class="odd-box" onclick="addToSlip(${m.id}, '2', ${odds.away})">
                            <span class="odd-label">Away</span>
                            <span class="odd-value">${odds.away}</span>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        console.error("sports.js: Error in renderUpcomingMatches:", e);
        const errorMsg = e.code ? `${e.code}: ${e.message}` : e.message;
        container.innerHTML = `<div class="empty-slip" style="color: #ff4757;">
            <i class="fas fa-exclamation-triangle"></i><br>
            Failed to load upcoming fixtures.<br>
            <small style="opacity: 0.8; background: #000; padding: 2px 5px; border-radius: 4px;">Error: ${errorMsg}</small>
        </div>`;
    }
}

window.addToSlip = (matchId, selection, price) => {
    const match = matchesData[matchId];
    if (!match) return;

    // Check if match already in slip
    const existingIndex = betSlip.findIndex(b => b.matchId === matchId);
    const home = match.participants.find(p => p.meta.location === 'home')?.name;
    const away = match.participants.find(p => p.meta.location === 'away')?.name;

    const bet = {
        matchId,
        matchName: `${home} vs ${away}`,
        selection,
        price: parseFloat(price)
    };

    if (existingIndex > -1) {
        betSlip[existingIndex] = bet;
    } else {
        betSlip.push(bet);
    }

    updateSlipDisplay();
    showToast(`Added: ${selection} @ ${price}`, "success");
};

function updateSlipDisplay() {
    const container = document.getElementById('slipItems');
    const countEl = document.getElementById('slipCount');
    const totalOddsEl = document.getElementById('totalOdds');
    const payoutEl = document.getElementById('potentialPayout');
    const stake = parseFloat(document.getElementById('betStake').value) || 0;

    countEl.textContent = betSlip.length;

    if (betSlip.length === 0) {
        container.innerHTML = `
            <div class="empty-slip">
                <i class="fas fa-ticket-alt"></i>
                <p>Your slip is empty.</p>
            </div>
        `;
        totalOddsEl.textContent = "1.00";
        payoutEl.textContent = "$0.00";
        document.getElementById('placeBetBtn').disabled = true;
        return;
    }

    container.innerHTML = betSlip.map((b, i) => `
        <div class="bet-item">
            <i class="fas fa-times remove-bet" onclick="removeFromSlip(${i})"></i>
            <div class="bet-match">${b.matchName}</div>
            <div class="bet-selection">
                <span class="selection-name">${b.selection}</span>
                <span class="selection-odds">${b.price.toFixed(2)}</span>
            </div>
        </div>
    `).join('');

    const totalOdds = betSlip.reduce((acc, b) => acc * b.price, 1);
    totalOddsEl.textContent = totalOdds.toFixed(2);
    payoutEl.textContent = `$${(totalOdds * stake).toFixed(2)}`;
    document.getElementById('placeBetBtn').disabled = stake <= 0;
}

window.removeFromSlip = (index) => {
    betSlip.splice(index, 1);
    updateSlipDisplay();
};

async function executeBet() {
    if (!currentUser) {
        showToast("Please login to place bets", "error");
        return;
    }

    const stake = parseFloat(document.getElementById('betStake').value);
    const totalOdds = parseFloat(document.getElementById('totalOdds').textContent);

    if (stake > userBalance) {
        showToast("Insufficient balance", "error");
        return;
    }

    const btn = document.getElementById('placeBetBtn');
    btn.disabled = true;
    btn.textContent = "Processing...";

    try {
        const ticketId = `BET-${Date.now()}`;
        
        await runTransaction(db, async (transaction) => {
            const walletRef = doc(db, "wallets", currentUser.uid);
            const walletSnap = await transaction.get(walletRef);
            
            if (!walletSnap.exists()) throw new Error("Wallet not found");
            
            const currentBal = walletSnap.data().balance || 0;
            if (currentBal < stake) throw new Error("Insufficient balance");

            // Deduct balance
            transaction.update(walletRef, { balance: currentBal - stake });

            // Create Bet Record
            const betRef = doc(collection(db, "football_bets"), ticketId);
            transaction.set(betRef, {
                userId: currentUser.uid,
                selections: betSlip,
                stake,
                totalOdds,
                potentialReturn: stake * totalOdds,
                status: 'pending',
                createdAt: serverTimestamp(),
                ticketId
            });
        });

        showToast("Bet placed successfully!", "success");
        betSlip = [];
        document.getElementById('betStake').value = '';
        updateSlipDisplay();
    } catch (e) {
        showToast(e.message, "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Place Bet";
    }
}

function showToast(msg, type = "info") {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
