// ============================================
// betting-engine.js - v3.0 FULLY ACTIVE
// ✅ Complete betting system integration
// ✅ Real-time odds updates
// ✅ Live match betting
// ✅ Wallet balance management
// ✅ Bet history and tracking
// ✅ Auto-refresh UI
// ============================================

// ===== BETTING ENGINE STATE =====
const BettingEngine = {
    currentMatch: null,
    selectedBet: null,
    betAmount: 0,
    isProcessing: false,
    updateInterval: null,
    
    // Initialize the engine
    async init() {
        console.log('🎰 Betting Engine Initializing...');
        
        // Check authentication
        const userId = this.getCurrentUser();
        if (!userId) {
            console.log('Waiting for user authentication...');
            this.waitForAuth();
        } else {
            await this.loadUserData();
        }
        
        // Start auto-refresh
        this.startAutoRefresh();
        
        // Setup event listeners
        this.setupEventListeners();
        
        console.log('✅ Betting Engine Active');
    },
    
    // Get current user from Firebase
    getCurrentUser() {
        if (typeof firebase !== 'undefined' && firebase.auth) {
            const user = firebase.auth().currentUser;
            if (user) return { uid: user.uid, email: user.email, displayName: user.displayName };
        }
        
        // Fallback to localStorage
        const stored = localStorage.getItem('xbet_user');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch(e) {}
        }
        return null;
    },
    
    // Wait for authentication
    waitForAuth() {
        const checkAuth = setInterval(() => {
            const user = this.getCurrentUser();
            if (user) {
                clearInterval(checkAuth);
                this.loadUserData();
            }
        }, 1000);
        
        setTimeout(() => clearInterval(checkAuth), 30000);
    },
    
    // Load user data
    async loadUserData() {
        const user = this.getCurrentUser();
        if (!user) return;
        
        console.log(`👤 User: ${user.email || user.uid}`);
        
        // Load balance
        await this.updateBalance();
        
        // Load bet history
        await this.loadBetHistory();
        
        // Load active bets
        await this.loadActiveBets();
    },
    
    // Update user balance
    async updateBalance() {
        try {
            const user = this.getCurrentUser();
            if (!user) return 0;
            
            if (window.WalletManager) {
                const balance = await window.WalletManager.getBalance(user.uid);
                this.updateBalanceDisplay(balance);
                return balance;
            }
            
            // Fallback to Supabase
            const { data, error } = await supabaseClient
                .from('user_wallets')
                .select('balance')
                .eq('user_id', user.uid)
                .single();
            
            if (!error && data) {
                this.updateBalanceDisplay(data.balance);
                return data.balance;
            }
            
            return 0;
        } catch(e) {
            console.error('Error updating balance:', e);
            return 0;
        }
    },
    
    // Update balance in UI
    updateBalanceDisplay(balance) {
        const balanceElements = document.querySelectorAll('.user-balance, .wallet-balance, #balance');
        balanceElements.forEach(el => {
            el.textContent = `$${balance.toFixed(2)}`;
        });
        
        // Dispatch event
        window.dispatchEvent(new CustomEvent('balanceUpdated', { detail: { balance } }));
    },
    
    // Load match for betting
    async selectMatch(fixtureId) {
        try {
            const { data: match, error } = await supabaseClient
                .from('sports_matches')
                .select('*')
                .eq('fixture_id', fixtureId)
                .single();
            
            if (error) throw error;
            
            if (match.status !== 'live') {
                this.showNotification('Betting only available for live matches!', 'error');
                return false;
            }
            
            if (match.bets_closed) {
                this.showNotification('Betting is closed for this match!', 'error');
                return false;
            }
            
            this.currentMatch = match;
            this.selectedBet = null;
            this.betAmount = 0;
            
            this.displayMatchDetails(match);
            this.displayOdds(match.odds);
            
            return true;
        } catch(e) {
            console.error('Error loading match:', e);
            this.showNotification('Could not load match data', 'error');
            return false;
        }
    },
    
    // Display match details
    displayMatchDetails(match) {
        const container = document.getElementById('match-details');
        if (!container) return;
        
        container.innerHTML = `
            <div class="match-header">
                <div class="league-name">
                    <img src="${match.league_logo || ''}" class="league-logo" onerror="this.style.display='none'">
                    ${match.league_name}
                </div>
                <div class="match-status live">
                    🔴 LIVE - ${match.elapsed || 0}'
                </div>
            </div>
            <div class="match-teams">
                <div class="team home">
                    <img src="${match.home_team.logo}" class="team-logo" onerror="this.style.display='none'">
                    <span class="team-name">${match.home_team.name}</span>
                    <span class="team-score">${match.score.home}</span>
                </div>
                <div class="team-vs">VS</div>
                <div class="team away">
                    <img src="${match.away_team.logo}" class="team-logo" onerror="this.style.display='none'">
                    <span class="team-name">${match.away_team.name}</span>
                    <span class="team-score">${match.score.away}</span>
                </div>
            </div>
            <div class="match-time">
                Started: ${new Date(match.start_time).toLocaleTimeString()}
            </div>
        `;
    },
    
    // Display odds
    displayOdds(odds) {
        const container = document.getElementById('odds-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="odds-buttons">
                <button class="odds-btn" data-bet-type="home" data-odds="${odds.home}">
                    <div class="bet-label">Home Win</div>
                    <div class="bet-odds">${odds.home}</div>
                </button>
                <button class="odds-btn" data-bet-type="draw" data-odds="${odds.draw}">
                    <div class="bet-label">Draw</div>
                    <div class="bet-odds">${odds.draw}</div>
                </button>
                <button class="odds-btn" data-bet-type="away" data-odds="${odds.away}">
                    <div class="bet-label">Away Win</div>
                    <div class="bet-odds">${odds.away}</div>
                </button>
            </div>
            <div class="odds-buttons secondary">
                <button class="odds-btn small" data-bet-type="over25" data-odds="${(odds.home + odds.away) / 2}">
                    Over 2.5
                </button>
                <button class="odds-btn small" data-bet-type="under25" data-odds="${(odds.home + odds.away) / 2}">
                    Under 2.5
                </button>
                <button class="odds-btn small" data-bet-type="btts_yes" data-odds="1.90">
                    BTTS Yes
                </button>
                <button class="odds-btn small" data-bet-type="btts_no" data-odds="1.90">
                    BTTS No
                </button>
            </div>
        `;
        
        // Add event listeners to odds buttons
        document.querySelectorAll('.odds-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectBetType(btn));
        });
    },
    
    // Select bet type
    selectBetType(button) {
        // Remove previous selection
        document.querySelectorAll('.odds-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // Add selected class
        button.classList.add('selected');
        
        this.selectedBet = {
            type: button.dataset.betType,
            odds: parseFloat(button.dataset.odds)
        };
        
        // Enable amount input
        const amountInput = document.getElementById('bet-amount');
        if (amountInput) {
            amountInput.disabled = false;
            amountInput.focus();
        }
        
        this.updatePotentialWin();
    },
    
    // Update potential win display
    updatePotentialWin() {
        if (!this.selectedBet || this.betAmount <= 0) {
            const potentialEl = document.getElementById('potential-win');
            if (potentialEl) potentialEl.textContent = '$0.00';
            return;
        }
        
        const potential = this.betAmount * this.selectedBet.odds;
        const potentialEl = document.getElementById('potential-win');
        if (potentialEl) potentialEl.textContent = `$${potential.toFixed(2)}`;
        
        // Enable place bet button if amount is valid
        const placeBtn = document.getElementById('place-bet-btn');
        if (placeBtn) {
            placeBtn.disabled = this.betAmount <= 0 || !this.selectedBet;
        }
    },
    
    // Set bet amount
    setBetAmount(amount) {
        this.betAmount = parseFloat(amount);
        this.updatePotentialWin();
    },
    
    // Quick amount selection
    quickAmount(percentage) {
        this.updateBalance().then(balance => {
            const amount = balance * (percentage / 100);
            const amountInput = document.getElementById('bet-amount');
            if (amountInput) {
                amountInput.value = amount.toFixed(2);
                this.setBetAmount(amount);
            }
        });
    },
    
    // Place bet
    async placeBet() {
        if (this.isProcessing) {
            this.showNotification('Processing, please wait...', 'warning');
            return;
        }
        
        if (!this.currentMatch) {
            this.showNotification('No match selected', 'error');
            return;
        }
        
        if (!this.selectedBet) {
            this.showNotification('Please select a bet type', 'error');
            return;
        }
        
        if (this.betAmount <= 0) {
            this.showNotification('Please enter a valid amount', 'error');
            return;
        }
        
        const user = this.getCurrentUser();
        if (!user) {
            this.showNotification('Please login to place bets', 'error');
            return;
        }
        
        // Check minimum bet
        if (this.betAmount < 1) {
            this.showNotification('Minimum bet is $1.00', 'error');
            return;
        }
        
        this.isProcessing = true;
        this.showLoading(true);
        
        try {
            // Check balance again
            const balance = await this.updateBalance();
            if (balance < this.betAmount) {
                throw new Error('Insufficient balance');
            }
            
            // Check match still available for betting
            const { data: match, error: matchError } = await supabaseClient
                .from('sports_matches')
                .select('status, bets_closed, elapsed')
                .eq('fixture_id', this.currentMatch.fixture_id)
                .single();
            
            if (matchError) throw new Error('Match not found');
            
            if (match.status !== 'live') {
                throw new Error('Match is no longer live');
            }
            
            if (match.bets_closed) {
                throw new Error('Betting is closed for this match');
            }
            
            // Place bet using BetManager
            let bet;
            if (window.BetManager) {
                bet = await window.BetManager.placeBet({
                    fixture_id: this.currentMatch.fixture_id,
                    bet_type: this.selectedBet.type,
                    odds: this.selectedBet.odds,
                    amount: this.betAmount
                });
            } else {
                // Fallback direct insertion
                bet = {
                    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    user_id: user.uid,
                    fixture_id: this.currentMatch.fixture_id,
                    bet_type: this.selectedBet.type,
                    odds: this.selectedBet.odds,
                    amount: this.betAmount,
                    potential_win: this.betAmount * this.selectedBet.odds,
                    status: 'active',
                    placed_at: new Date().toISOString()
                };
                
                const { error } = await supabaseClient
                    .from('bets')
                    .insert(bet);
                
                if (error) throw error;
            }
            
            // Update balance display
            await this.updateBalance();
            
            // Show success
            this.showNotification(
                `Bet placed: ${this.selectedBet.type.toUpperCase()} @ ${this.selectedBet.odds} for $${this.betAmount.toFixed(2)}`,
                'success'
            );
            
            // Reset form
            this.resetBetForm();
            
            // Reload active bets
            await this.loadActiveBets();
            
            // Dispatch event
            window.dispatchEvent(new CustomEvent('betPlaced', { detail: bet }));
            
        } catch(e) {
            console.error('Bet placement error:', e);
            this.showNotification(e.message, 'error');
        } finally {
            this.isProcessing = false;
            this.showLoading(false);
        }
    },
    
    // Reset bet form
    resetBetForm() {
        this.selectedBet = null;
        this.betAmount = 0;
        
        const amountInput = document.getElementById('bet-amount');
        if (amountInput) {
            amountInput.value = '';
            amountInput.disabled = true;
        }
        
        const potentialEl = document.getElementById('potential-win');
        if (potentialEl) potentialEl.textContent = '$0.00';
        
        const placeBtn = document.getElementById('place-bet-btn');
        if (placeBtn) placeBtn.disabled = true;
        
        // Remove selected class from odds buttons
        document.querySelectorAll('.odds-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
    },
    
    // Load active bets
    async loadActiveBets() {
        const user = this.getCurrentUser();
        if (!user) return;
        
        try {
            let activeBets = [];
            
            if (window.BetManager) {
                activeBets = await window.BetManager.getActiveBets();
            } else {
                const { data, error } = await supabaseClient
                    .from('bets')
                    .select('*, sports_matches(home_team, away_team, score, elapsed)')
                    .eq('user_id', user.uid)
                    .eq('status', 'active')
                    .order('placed_at', { ascending: false });
                
                if (!error) activeBets = data || [];
            }
            
            this.displayActiveBets(activeBets);
        } catch(e) {
            console.error('Error loading active bets:', e);
        }
    },
    
    // Display active bets
    displayActiveBets(bets) {
        const container = document.getElementById('active-bets');
        if (!container) return;
        
        if (bets.length === 0) {
            container.innerHTML = '<div class="no-bets">No active bets</div>';
            return;
        }
        
        container.innerHTML = bets.map(bet => `
            <div class="bet-card active">
                <div class="bet-header">
                    <span class="bet-type">${this.formatBetType(bet.bet_type)}</span>
                    <span class="bet-odds">@ ${bet.odds}</span>
                </div>
                <div class="bet-details">
                    <div class="bet-amount">$${bet.amount.toFixed(2)}</div>
                    <div class="bet-potential">Potential: $${(bet.amount * bet.odds).toFixed(2)}</div>
                </div>
                <div class="bet-status live">
                    🔴 Live • Placed ${new Date(bet.placed_at).toLocaleTimeString()}
                </div>
            </div>
        `).join('');
    },
    
    // Load bet history
    async loadBetHistory() {
        const user = this.getCurrentUser();
        if (!user) return;
        
        try {
            let history = [];
            
            if (window.BetManager) {
                history = await window.BetManager.getUserBetHistory(20);
            } else {
                const { data, error } = await supabaseClient
                    .from('bets')
                    .select('*')
                    .eq('user_id', user.uid)
                    .in('status', ['won', 'lost'])
                    .order('settled_at', { ascending: false })
                    .limit(20);
                
                if (!error) history = data || [];
            }
            
            this.displayBetHistory(history);
        } catch(e) {
            console.error('Error loading bet history:', e);
        }
    },
    
    // Display bet history
    displayBetHistory(bets) {
        const container = document.getElementById('bet-history');
        if (!container) return;
        
        if (bets.length === 0) {
            container.innerHTML = '<div class="no-history">No betting history</div>';
            return;
        }
        
        container.innerHTML = bets.map(bet => `
            <div class="history-item ${bet.status}">
                <div class="history-header">
                    <span class="history-type">${this.formatBetType(bet.bet_type)}</span>
                    <span class="history-status ${bet.status}">${bet.status.toUpperCase()}</span>
                </div>
                <div class="history-details">
                    <span>$${bet.amount.toFixed(2)} @ ${bet.odds}</span>
                    ${bet.payout ? `<span class="history-payout">Won: $${bet.payout.toFixed(2)}</span>` : ''}
                </div>
                <div class="history-date">
                    ${new Date(bet.settled_at || bet.placed_at).toLocaleString()}
                </div>
            </div>
        `).join('');
    },
    
    // Format bet type for display
    formatBetType(type) {
        const types = {
            'home': 'Home Win',
            'draw': 'Draw',
            'away': 'Away Win',
            '1X': 'Home/Draw',
            '12': 'Home/Away',
            'X2': 'Draw/Away',
            'over25': 'Over 2.5',
            'under25': 'Under 2.5',
            'btts_yes': 'BTTS Yes',
            'btts_no': 'BTTS No'
        };
        return types[type] || type.toUpperCase();
    },
    
    // Show notification
    showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        if (!container) {
            alert(message);
            return;
        }
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span class="message">${message}</span>
            <button class="close">×</button>
        `;
        
        container.appendChild(notification);
        
        notification.querySelector('.close').addEventListener('click', () => {
            notification.remove();
        });
        
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    },
    
    // Show/hide loading
    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    },
    
    // Start auto-refresh
    startAutoRefresh() {
        if (this.updateInterval) clearInterval(this.updateInterval);
        
        this.updateInterval = setInterval(() => {
            // Refresh balance
            this.updateBalance();
            
            // Refresh active bets if we have a current match
            if (this.currentMatch) {
                this.loadActiveBets();
            }
        }, 10000); // Every 10 seconds
    },
    
    // Setup event listeners
    setupEventListeners() {
        // Listen for bet settlement events
        window.addEventListener('betsSettled', () => {
            this.updateBalance();
            this.loadActiveBets();
            this.loadBetHistory();
        });
        
        // Listen for match updates
        window.addEventListener('matchLive', (e) => {
            if (this.currentMatch && this.currentMatch.fixture_id === e.detail.fixture_id) {
                this.selectMatch(e.detail.fixture_id);
            }
        });
        
        // Listen for auth changes
        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    this.loadUserData();
                }
            });
        }
    }
};

// ===== HTML TEMPLATES =====
const BettingUI = {
    // Render the complete betting interface
    render() {
        return `
            <div class="betting-engine">
                <!-- Balance Display -->
                <div class="balance-panel">
                    <div class="balance-label">Your Balance</div>
                    <div class="balance-amount" id="balance">$0.00</div>
                </div>
                
                <!-- Match Selection -->
                <div class="match-selection">
                    <h3>Live Matches</h3>
                    <div id="live-matches-list" class="matches-list"></div>
                </div>
                
                <!-- Betting Slip -->
                <div class="betting-slip" id="betting-slip">
                    <h3>Betting Slip</h3>
                    <div id="match-details" class="match-details"></div>
                    <div id="odds-container" class="odds-container"></div>
                    
                    <div class="bet-amount-section">
                        <label>Bet Amount ($)</label>
                        <input type="number" id="bet-amount" placeholder="Enter amount" disabled step="0.01" min="1">
                        <div class="quick-amounts">
                            <button onclick="BettingEngine.quickAmount(10)">10%</button>
                            <button onclick="BettingEngine.quickAmount(25)">25%</button>
                            <button onclick="BettingEngine.quickAmount(50)">50%</button>
                            <button onclick="BettingEngine.quickAmount(100)">100%</button>
                        </div>
                    </div>
                    
                    <div class="potential-win">
                        <span>Potential Win:</span>
                        <strong id="potential-win">$0.00</strong>
                    </div>
                    
                    <button id="place-bet-btn" class="place-bet-btn" onclick="BettingEngine.placeBet()" disabled>
                        Place Bet
                    </button>
                </div>
                
                <!-- Active Bets -->
                <div class="active-bets">
                    <h3>Active Bets</h3>
                    <div id="active-bets" class="bets-list"></div>
                </div>
                
                <!-- Bet History -->
                <div class="bet-history">
                    <h3>Bet History</h3>
                    <div id="bet-history" class="history-list"></div>
                </div>
                
                <!-- Notification Container -->
                <div id="notification-container" class="notification-container"></div>
                
                <!-- Loading Overlay -->
                <div id="loading-overlay" class="loading-overlay" style="display: none;">
                    <div class="spinner"></div>
                    <p>Processing...</p>
                </div>
            </div>
        `;
    },
    
    // Load live matches into selection
    async loadLiveMatches() {
        const container = document.getElementById('live-matches-list');
        if (!container) return;
        
        try {
            let matches = [];
            if (window.sportsAPI) {
                matches = await window.sportsAPI.getLiveMatches();
            } else {
                const { data } = await supabaseClient
                    .from('sports_matches')
                    .select('*')
                    .eq('status', 'live')
                    .order('start_time', { ascending: true });
                matches = data || [];
            }
            
            if (matches.length === 0) {
                container.innerHTML = '<div class="no-matches">No live matches available</div>';
                return;
            }
            
            container.innerHTML = matches.map(match => `
                <div class="match-item ${BettingEngine.currentMatch?.fixture_id === match.fixture_id ? 'selected' : ''}" 
                     onclick="BettingEngine.selectMatch(${match.fixture_id})">
                    <div class="match-league">${match.league_name}</div>
                    <div class="match-teams">
                        <span>${match.home_team.name}</span>
                        <span class="match-score">${match.score.home} - ${match.score.away}</span>
                        <span>${match.away_team.name}</span>
                    </div>
                    <div class="match-live">🔴 LIVE ${match.elapsed || 0}'</div>
                </div>
            `).join('');
        } catch(e) {
            console.error('Error loading live matches:', e);
        }
    }
};

// ===== CSS STYLES =====
const BettingStyles = `
<style>
.betting-engine {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.balance-panel {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 15px;
    padding: 20px;
    color: white;
    text-align: center;
    margin-bottom: 20px;
}

.balance-label {
    font-size: 14px;
    opacity: 0.9;
}

.balance-amount {
    font-size: 36px;
    font-weight: bold;
    margin-top: 5px;
}

.matches-list, .bets-list, .history-list {
    max-height: 300px;
    overflow-y: auto;
}

.match-item {
    background: #f5f5f5;
    border-radius: 10px;
    padding: 15px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: all 0.3s;
}

.match-item:hover {
    background: #e8e8e8;
    transform: translateX(5px);
}

.match-item.selected {
    background: #667eea;
    color: white;
}

.match-league {
    font-size: 12px;
    opacity: 0.7;
    margin-bottom: 5px;
}

.match-teams {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 500;
}

.match-score {
    font-weight: bold;
    margin: 0 10px;
}

.match-live {
    font-size: 11px;
    margin-top: 5px;
    color: #ff4444;
}

.betting-slip {
    background: white;
    border-radius: 15px;
    padding: 20px;
    margin: 20px 0;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.odds-buttons {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin: 15px 0;
}

.odds-buttons.secondary {
    grid-template-columns: repeat(4, 1fr);
}

.odds-btn {
    padding: 12px;
    border: 2px solid #ddd;
    background: white;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s;
}

.odds-btn:hover {
    border-color: #667eea;
    transform: scale(1.02);
}

.odds-btn.selected {
    background: #667eea;
    border-color: #667eea;
    color: white;
}

.odds-btn.small {
    padding: 8px;
    font-size: 12px;
}

.bet-amount-section {
    margin: 15px 0;
}

.bet-amount-section input {
    width: 100%;
    padding: 12px;
    border: 2px solid #ddd;
    border-radius: 8px;
    font-size: 16px;
    box-sizing: border-box;
}

.quick-amounts {
    display: flex;
    gap: 10px;
    margin-top: 10px;
}

.quick-amounts button {
    flex: 1;
    padding: 8px;
    background: #f0f0f0;
    border: none;
    border-radius: 5px;
    cursor: pointer;
}

.potential-win {
    display: flex;
    justify-content: space-between;
    padding: 15px;
    background: #f9f9f9;
    border-radius: 8px;
    margin: 15px 0;
}

.place-bet-btn {
    width: 100%;
    padding: 15px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: transform 0.2s;
}

.place-bet-btn:hover:not(:disabled) {
    transform: translateY(-2px);
}

.place-bet-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.bet-card, .history-item {
    background: #f9f9f9;
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 10px;
}

.bet-card.active {
    border-left: 4px solid #ff4444;
}

.history-item.won {
    border-left: 4px solid #4caf50;
}

.history-item.lost {
    border-left: 4px solid #f44336;
}

.notification-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
}

.notification {
    background: white;
    border-radius: 8px;
    padding: 12px 20px;
    margin-bottom: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-width: 250px;
    animation: slideIn 0.3s ease;
}

.notification.success { border-left: 4px solid #4caf50; }
.notification.error { border-left: 4px solid #f44336; }
.notification.warning { border-left: 4px solid #ff9800; }

.notification .close {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    margin-left: 15px;
}

.loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 2000;
    color: white;
}

.spinner {
    width: 50px;
    height: 50px;
    border: 4px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}
</style>
`;

// ===== INITIALIZE EVERYTHING =====
document.addEventListener('DOMContentLoaded', async () => {
    // Inject styles
    document.head.insertAdjacentHTML('beforeend', BettingStyles);
    
    // Find or create container
    let container = document.getElementById('betting-engine-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'betting-engine-container';
        document.body.appendChild(container);
    }
    
    // Render UI
    container.innerHTML = BettingUI.render();
    
    // Initialize engine
    await BettingEngine.init();
    
    // Load live matches
    await BettingUI.loadLiveMatches();
    
    // Refresh matches every 15 seconds
    setInterval(() => BettingUI.loadLiveMatches(), 15000);
    
    // Add amount input listener
    const amountInput = document.getElementById('bet-amount');
    if (amountInput) {
        amountInput.addEventListener('input', (e) => {
            BettingEngine.setBetAmount(e.target.value);
        });
    }
    
    console.log('🎰 Betting Engine Fully Active!');
});

// Export for global use
window.BettingEngine = BettingEngine;
window.BettingUI = BettingUI;
