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
            loadAppData();
        } else {
            showToast("Please login to place bets", "error");
            loadAppData(); // Still show matches to guests
        }
    });

    // Slip Listeners
    document.getElementById('betStake').addEventListener('input', updateSlipDisplay);
    document.getElementById('placeBetBtn').addEventListener('click', executeBet);
});

async function loadAppData() {
    renderLiveMatches();
    renderUpcomingMatches();
    // Auto-refresh live scores
    setInterval(renderLiveMatches, 30000);
}

function initWallet() {
    const walletRef = doc(db, "wallets", currentUser.uid);
    onSnapshot(walletRef, (snap) => {
        if (docSnap.exists()) {
            userBalance = snap.data().balance || 0;
            document.getElementById('balanceDisplay').textContent = `$${userBalance.toFixed(2)}`;
        }
    });
}

async function renderLiveMatches() {
    const container = document.getElementById('liveMatches');
    try {
        const result = await getLiveScores();
        if (result.data.success && result.data.data.data) {
            const matches = result.data.data.data;
            if (matches.length === 0) {
                container.innerHTML = '<div class="empty-slip">No live matches at the moment</div>';
                return;
            }
            container.innerHTML = matches.map(m => {
                matchesData[m.id] = m;
                const home = m.participants.find(p => p.meta.location === 'home');
                const away = m.participants.find(p => p.meta.location === 'away');
                const score = m.scores.find(s => s.description === 'CURRENT');
                
                return `
                    <div class="match-card">
                        <div class="match-meta">
                            <span>${m.league?.name || 'Football'}</span>
                            <span class="match-time">LIVE ${m.time?.minute || 0}'</span>
                        </div>
                        <div class="match-teams">
                            <div class="team">
                                <img src="${home?.image_path}" class="team-img">
                                <div class="team-name">${home?.name}</div>
                            </div>
                            <div class="match-score">${score?.home_score || 0} - ${score?.away_score || 0}</div>
                            <div class="team">
                                <img src="${away?.image_path}" class="team-img">
                                <div class="team-name">${away?.name}</div>
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
        }
    } catch (e) {
        container.innerHTML = '<div class="empty-slip">Failed to load live data</div>';
    }
}

async function renderUpcomingMatches() {
    const container = document.getElementById('upcomingMatches');
    try {
        const result = await getUpcomingFixtures();
        if (result.data.success && result.data.data.data) {
            const matches = result.data.data.data.slice(0, 10);
            container.innerHTML = '';
            
            for (const m of matches) {
                matchesData[m.id] = m;
                const home = m.participants.find(p => p.meta.location === 'home');
                const away = m.participants.find(p => p.meta.location === 'away');
                const startTime = new Date(m.starting_at).toLocaleString([], { hour: '2-digit', minute: '2-digit' });
                
                // Fetch real odds for upcoming
                let odds = { home: 1.90, draw: 3.20, away: 2.50 };
                try {
                    const oddsRes = await getFixtureOdds({ fixtureId: m.id });
                    if (oddsRes.data.success && oddsRes.data.data.data) {
                        const market = oddsRes.data.data.data.find(o => o.name === 'Full Time Result');
                        if (market) {
                            odds.home = market.odds.find(o => o.label === '1')?.value || 1.90;
                            odds.draw = market.odds.find(o => o.label === 'X')?.value || 3.20;
                            odds.away = market.odds.find(o => o.label === '2')?.value || 2.50;
                        }
                    }
                } catch(err) {}

                container.innerHTML += `
                    <div class="match-card">
                        <div class="match-meta">
                            <span>${m.league?.name || 'Football'}</span>
                            <span>Today, ${startTime}</span>
                        </div>
                        <div class="match-teams">
                            <div class="team">
                                <img src="${home?.image_path}" class="team-img">
                                <div class="team-name">${home?.name}</div>
                            </div>
                            <div class="match-score">VS</div>
                            <div class="team">
                                <img src="${away?.image_path}" class="team-img">
                                <div class="team-name">${away?.name}</div>
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
        }
    } catch (e) {
        container.innerHTML = '<div class="empty-slip">Failed to load upcoming fixtures</div>';
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
