// public/js/sports.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Firebase configuration (should be consistent across your app)
const firebaseConfig = {
    apiKey: "AIzaSyA72Yo_YGqno9PX25p3yQBvyflcaM-NqEM",
    authDomain: "x-bet-prod-jd.firebaseapp.com",
    projectId: "x-bet-prod-jd",
    storageBucket: "x-bet-prod-jd.firebasestorage.app",
    messagingSenderId: "499334334535",
    appId: "1:499334334535:web:bebc1bf817e24d9e3c4962",
    measurementId: "G-PTV4XMYQ6P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);
const auth = getAuth(app);
const db = getFirestore(app);

const getUpcomingFixturesCallable = httpsCallable(functions, 'getUpcomingFixtures');
const getFixtureOddsCallable = httpsCallable(functions, 'getFixtureOdds');
const getLiveScoresCallable = httpsCallable(functions, 'getLiveScores');

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadUserBalance(user.uid);
        } else {
            console.log("User not logged in on sports page.");
        }
        fetchAndDisplayUpcomingFixtures();
        fetchAndDisplayLiveScores();
        setInterval(fetchAndDisplayLiveScores, 10000); // Refresh live scores every 10 seconds
    });
});

async function loadUserBalance(uid) {
    const balanceDisplay = document.getElementById('balanceDisplay');
    const walletRef = doc(db, "wallets", uid);
    onSnapshot(walletRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            balanceDisplay.innerHTML = `<i class="fas fa-wallet"></i> $${(data.balance || 0).toFixed(2)}`;
        } else {
            balanceDisplay.innerHTML = `<i class="fas fa-wallet"></i> $0.00`;
        }
    });
}

async function fetchAndDisplayUpcomingFixtures() {
    const upcomingMatchesContainer = document.querySelector('.upcoming-matches'); // Assuming a new container for upcoming
    if (!upcomingMatchesContainer) return;
    upcomingMatchesContainer.innerHTML = '<p>Loading upcoming fixtures...</p>';

    try {
        const result = await getUpcomingFixturesCallable();
        if (result.data && result.data.success && result.data.data.data) {
            const fixtures = result.data.data.data;
            if (fixtures.length === 0) {
                upcomingMatchesContainer.innerHTML = '<p>No upcoming fixtures found.</p>';
                return;
            }

            upcomingMatchesContainer.innerHTML = '';

            for (const fixture of fixtures) {
                const homeTeam = fixture.participants.find(p => p.meta.location === 'home');
                const awayTeam = fixture.participants.find(p => p.meta.location === 'away');

                let homeOdds = 'N/A';
                let awayOdds = 'N/A';
                let drawOdds = 'N/A';

                try {
                    const oddsResult = await getFixtureOddsCallable({ fixtureId: fixture.id });
                    if (oddsResult.data && oddsResult.data.success && oddsResult.data.data.data) {
                        const oddsData = oddsResult.data.data.data;
                        const fullTimeResultMarket = oddsData.find(
                            (odd) => odd.name === 'Full Time Result'
                        );

                        if (fullTimeResultMarket && fullTimeResultMarket.odds) {
                            homeOdds = fullTimeResultMarket.odds.find(
                                (odd) => odd.label === '1'
                            )?.value || 'N/A';
                            drawOdds = fullTimeResultMarket.odds.find(
                                (odd) => odd.label === 'X'
                            )?.value || 'N/A';
                            awayOdds = fullTimeResultMarket.odds.find(
                                (odd) => odd.label === '2'
                            )?.value || 'N/A';
                        }
                    }
                } catch (oddsError) {
                    console.warn(`Could not fetch odds for fixture ${fixture.id}:`, oddsError);
                }

                const fixtureCard = `
                    <div class="match-card">
                        <div class="match-teams">
                            <div class="team">
                                <img src="${homeTeam?.image_path || 'https://via.placeholder.com/70'}" 
                                     class="team-logo" alt="${homeTeam?.name || 'Home Team'}">
                                <div class="team-name">${homeTeam?.name || 'Home Team'}</div>
                                <div class="team-odds">${homeOdds}</div>
                            </div>
                            <div class="vs">VS</div>
                            <div class="team">
                                <img src="${awayTeam?.image_path || 'https://via.placeholder.com/70'}" 
                                     class="team-logo" alt="${awayTeam?.name || 'Away Team'}">
                                <div class="team-name">${awayTeam?.name || 'Away Team'}</div>
                                <div class="team-odds">${awayOdds}</div>
                            </div>
                        </div>
                        <div class="match-info">
                            <div>${fixture.league?.name || 'Unknown League'} • ${fixture.season?.name || 'Unknown Season'}</div>
                            <div>${new Date(fixture.starting_at).toLocaleString()}</div>
                        </div>
                        <div class="bet-actions">
                            <button class="bet-btn primary">
                                <i class="fas fa-coins"></i> <span>Place Bet</span>
                            </button>
                            <button class="bet-btn secondary">
                                <i class="fas fa-chart-line"></i> <span>Details</span>
                            </button>
                        </div>
                    </div>
                `;
                upcomingMatchesContainer.innerHTML += fixtureCard;
            }
        } else {
            upcomingMatchesContainer.innerHTML = '<p>Error fetching upcoming fixtures.</p>';
            console.error('Failed to fetch upcoming fixtures:', result.data.error);
        }
    } catch (error) {
        upcomingMatchesContainer.innerHTML = '<p>Error loading upcoming fixtures.</p>';
        console.error('Error calling Cloud Function for upcoming fixtures:', error);
    }
}

async function fetchAndDisplayLiveScores() {
    const liveMatchesContainer = document.querySelector('.live-matches');
    if (!liveMatchesContainer) return;
    liveMatchesContainer.innerHTML = '<p>Loading live scores...</p>'; // Initial loading indicator

    try {
        const result = await getLiveScoresCallable();
        if (result.data && result.data.success && result.data.data.data) {
            const liveFixtures = result.data.data.data;
            if (liveFixtures.length === 0) {
                liveMatchesContainer.innerHTML = '<p>No live matches currently.</p>';
                return;
            }

            liveMatchesContainer.innerHTML = ''; // Clear loading indicator

            liveFixtures.forEach(fixture => {
                const homeTeam = fixture.participants.find(p => p.meta.location === 'home');
                const awayTeam = fixture.participants.find(p => p.meta.location === 'away');
                const homeScore = fixture.scores.find(s => s.description === 'CURRENT')?.home_score || 0;
                const awayScore = fixture.scores.find(s => s.description === 'CURRENT')?.away_score || 0;

                const fixtureCard = `
                    <div class="match-card live">
                        <div class="live-badge">LIVE</div>
                        <div class="match-teams">
                            <div class="team">
                                <img src="${homeTeam?.image_path || 'https://via.placeholder.com/70'}" 
                                     class="team-logo" alt="${homeTeam?.name || 'Home Team'}">
                                <div class="team-name">${homeTeam?.name || 'Home Team'}</div>
                                <div class="team-score">${homeScore}</div>
                            </div>
                            <div class="vs">-</div>
                            <div class="team">
                                <img src="${awayTeam?.image_path || 'https://via.placeholder.com/70'}" 
                                     class="team-logo" alt="${awayTeam?.name || 'Away Team'}">
                                <div class="team-name">${awayTeam?.name || 'Away Team'}</div>
                                <div class="team-score">${awayScore}</div>
                            </div>
                        </div>
                        <div class="match-info">
                            <div>${fixture.league?.name || 'Unknown League'} • ${fixture.season?.name || 'Unknown Season'}</div>
                            <div><span class="match-time">${fixture.time?.minute || 0}'</span></div>
                        </div>
                        <div class="bet-actions">
                            <button class="bet-btn primary">
                                <i class="fas fa-coins"></i> <span>Bet Live</span>
                            </button>
                            <button class="bet-btn secondary">
                                <i class="fas fa-chart-line"></i> <span>Live Stats</span>
                            </button>
                        </div>
                    </div>
                `;
                liveMatchesContainer.innerHTML += fixtureCard;
            });
        } else {
            liveMatchesContainer.innerHTML = '<p>Error fetching live scores.</p>';
            console.error('Failed to fetch live scores:', result.data.error);
        }
    } catch (error) {
        liveMatchesContainer.innerHTML = '<p>Error loading live scores.</p>';
        console.error('Error calling Cloud Function for live scores:', error);
    }
}

// Global functions (from index.html, if needed)
window.toggleLang = () => {
    // Implement language toggle logic
    console.log('Language toggle clicked');
};
