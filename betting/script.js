// Choose mode: set to true to fetch data from Firestore in real-time.
// In mock mode (false), we use hard-coded fixtures.
// Toggle with: const USE_FIREBASE = true; or false
const USE_FIREBASE = false;

// Balance state
let balance = 100.0;

// In-memory bet slip
let betSlip = [];

// Current filter
let currentFilter = 'all';

// DOM refs
const balanceAmountEl = document.getElementById('balanceAmount');
const fixturesGridEl = document.getElementById('fixtures-grid');
const betSlipEl = document.getElementById('betSlip');
const betSlipToggleBtn = document.getElementById('betSlipToggle');
const betItemsEl = document.getElementById('betItems');
const betCountEl = document.getElementById('betCount');
const stakeInput = document.getElementById('stakeInput');
const placeBetBtn = document.getElementById('placeBetBtn');
const loaderEl = document.getElementById('loader');
const emptyStateEl = document.getElementById('emptyState');
const toastEl = document.getElementById('toast');
const betSummaryTextEl = document.getElementById('betSummaryText');
const betSummaryEl = document.getElementById('betSummary');

// Init balance UI
function renderBalance() {
  balanceAmountEl.textContent = `$${balance.toFixed(2)}`;
}
function showToast(msg, ms = 1800) {
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  setTimeout(() => { toastEl.style.display = 'none'; }, ms);
}
function toggleBetSlip() {
  if (betSlipEl.classList.contains('open')) {
    betSlipEl.classList.remove('open');
  } else {
    betSlipEl.classList.add('open');
  }
}
function updateBetCount() {
  const n = betSlip.length;
  if (n > 0) {
    betCountEl.style.display = 'inline-flex';
    betCountEl.textContent = n;
  } else {
    betCountEl.style.display = 'none';
  }
}
function renderBetSlip() {
  betItemsEl.innerHTML = '';
  if (betSlip.length === 0) {
    betItemsEl.innerHTML = '<div class="empty-state">Your bet slip is empty.</div>';
    return;
  }
  betSlip.forEach((b, idx) => {
    const div = document.createElement('div');
    div.className = 'bet-item';
    div.innerHTML = `
      <div><strong>${b.fixture.home} vs ${b.fixture.away}</strong> • ${b.fixture.league}</div>
      <div>Odds: ${b.odds.home} / ${b.odds.draw} / ${b.odds.away}</div>
      <div>Stake: $${b.stake.toFixed(2)}  Potential: $${(b.stake * b.multiplier).toFixed(2)}</div>
      <button onclick="removeBet(${idx})" class="filter-btn" style="margin-top:6px;">Remove</button>
    `;
    betItemsEl.appendChild(div);
  });
  // Summary
  const totalStake = betSlip.reduce((s, b) => s + b.stake, 0);
  const potential = betSlip.reduce((s, b) => s + b.stake * b.multiplier, 0);
  betSummaryTextEl.textContent = `Total stake: $${totalStake.toFixed(2)} • Potential return: $${potential.toFixed(2)}`;
  betSummaryEl.style.display = 'block';
}
function addBetFromFixture(fixture, chosen) {
  // chosen is 'home' or 'draw' or 'away'
  const odds = fixture.odds;
  const multiplier = chosen === 'home' ? odds.home : chosen === 'draw' ? odds.draw : odds.away;
  const stake = parseFloat(stakeInput.value) || 10;
  const bet = {
    fixture,
    chosen,
    odds,
    multiplier,
    stake
  };
  betSlip.push(bet);
  renderBetSlip();
  updateBetCount();
  showToast('Added bet to slip');
}
function removeBet(index) {
  betSlip.splice(index, 1);
  renderBetSlip();
  updateBetCount();
}
function placeBet() {
  if (betSlip.length === 0) return;
  const totalStake = betSlip.reduce((s, b) => s + b.stake, 0);
  if (totalStake > balance) {
    showToast('Insufficient balance');
    return;
  }
  // Deduct balance as a simple demonstration
  balance -= totalStake;
  renderBalance();
  betSlip = [];
  renderBetSlip();
  updateBetCount();
  showToast('Bet placed! Good luck.');
  toggleBetSlip();
}

// Mock data (used when USE_FIREBASE is false)
const MOCK_FIXTURES = [
  {
    id: 'f1',
    league: 'Premier League',
    home: 'Liverpool',
    away: 'Chelsea',
    kickoff: '2026-04-05T18:00:00Z',
    status: 'scheduled',
    odds: { home: 1.95, draw: 3.20, away: 4.10 }
  },
  {
    id: 'f2',
    league: 'NBA',
    home: 'Lakers',
    away: 'Warriors',
    kickoff: '2026-04-05T01:00:00Z',
    status: 'inplay',
    odds: { home: 1.80, draw: 2.80, away: 2.15 }
  },
  {
    id: 'f3',
    league: 'La Liga',
    home: 'Real Madrid',
    away: 'Barcelona',
    kickoff: '2026-04-06T20:00:00Z',
    status: 'scheduled',
    odds: { home: 2.10, draw: 3.40, away: 3.60 }
  }
];

// Render a single fixture card
function renderFixtureCard(fixture) {
  const card = document.createElement('div');
  card.className = 'fixture-card';
  const statusClass = fixture.status === 'inplay' ? 'status-inplay'
                     : fixture.status === 'scheduled' ? 'status-scheduled'
                     : 'status-finished';
  card.innerHTML = `
    <div class="fixture-header">
      <span class="league-name">${fixture.league}</span>
      <span class="fixture-status ${statusClass}">${fixture.status}</span>
    </div>
    <div class="fixture-teams">
      <div class="team">${fixture.home}</div>
      <div class="score">VS</div>
      <div class="team">${fixture.away}</div>
      <div class="kickoff" style="text-align:center; font-size:0.85rem; opacity:.8; margin-top:.5rem;">
        ${new Date(fixture.kickoff).toUTCString()}
      </div>
    </div>
    <div class="odds-container">
      <button class="odd-btn" onclick="addBetFromFixture(${JSON.stringify(fixture)}, 'home')">
        <div class="odd-value">${fixture.odds.home}</div>
        <div>Home</div>
      </button>
      <button class="odd-btn" onclick="addBetFromFixture(${JSON.stringify(fixture)}, 'draw')">
        <div class="odd-value">${fixture.odds.draw}</div>
        <div>Draw</div>
      </button>
      <button class="odd-btn" onclick="addBetFromFixture(${JSON.stringify(fixture)}, 'away')">
        <div class="odd-value">${fixture.odds.away}</div>
        <div>Away</div>
      </button>
    </div>
  `;
  // Attach a small click area over the card to preview or interact
  return card;
}

// Render all fixtures
function renderFixtures(fixtures) {
  fixturesGridEl.innerHTML = '';
  const list = fixtures.filter(f => currentFilter === 'all' || f.league.toLowerCase().includes(currentFilter) || f.home.toLowerCase().includes(currentFilter) );
  if (list.length === 0) {
    emptyStateEl.style.display = 'block';
    return;
  } else {
    emptyStateEl.style.display = 'none';
  }
  list.forEach(f => {
    fixturesGridEl.appendChild(renderFixtureCard(f));
  });
}

// Filter handling
function setFilter(e) {
  const btns = document.querySelectorAll('.filter-btn');
  btns.forEach(b => b.classList.remove('active'));
  e.currentTarget.classList.add('active');
  currentFilter = e.currentTarget.dataset.filter;
  renderFixtures(getFixtures());
}
function getFixtures() {
  // In mock mode, return MOCK_FIXTURES
  if (!USE_FIREBASE) {
    return MOCK_FIXTURES;
  }
  // In Firebase mode, fixtures will be updated by Firestore snapshot
  // This function is a placeholder to unify code paths
  return window.__firebaseFixtures || [];
}

// Firebase setup (optional)
let db;
async function initFirebase() {
  // Replace with your own config
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "SENDER_ID",
    appId: "APP_ID"
  };
  // Initialize app
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  // Real-time listener
  db.collection('fixtures').onSnapshot(snapshot => {
    const fixtures = [];
    snapshot.forEach(doc => {
      fixtures.push(doc.data());
    });
    // Normalize to our UI model if needed
    window.__firebaseFixtures = fixtures;
    renderFixtures(fixtures);
  }, err => {
    console.error('Firestore error:', err);
  });
}

// Load data on start
function bootstrap() {
  renderBalance();
  if (!USE_FIREBASE) {
    // Mock mode
    // Simulate a loading state if you want
    loaderEl.style.display = 'none';
    renderFixtures(MOCK_FIXTURES);
  } else {
    // Firebase mode
    // Show loader
    loaderEl.style.display = 'block';
    initFirebase().then(() => {
      loaderEl.style.display = 'none';
      // The real-time callback will render
    }).catch(() => {
      loaderEl.style.display = 'none';
      emptyStateEl.style.display = 'block';
      emptyStateEl.textContent = 'Failed to load fixtures from Firestore';
    });
  }
}
window.addEventListener('DOMContentLoaded', bootstrap);

// Helpers
function addFunds() {
  const amount = parseFloat(prompt('Add funds (e.g., 50):', '50')) || 50;
  balance += amount;
  renderBalance();
  showToast(`Funds added: $${amount.toFixed(2)}`);
}
