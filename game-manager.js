// game-manager.js - Dynamic game management system
class GameManager {
    constructor() {
        this.games = new Map(); // gameId -> Game object
        this.gameRegistry = new Map(); // gameType -> GameClass
        this.activeGame = null;
        
        // Auto-register built-in game types
        this.registerGameTypes();
    }
    
    registerGameTypes() {
        // Register different game types
        this.registerGameType('slot', SlotGame);
        this.registerGameType('dice', DiceGame);
        this.registerGameType('poker', PokerGame);
        this.registerGameType('roulette', RouletteGame);
        this.registerGameType('blackjack', BlackjackGame);
        this.registerGameType('crash', CrashGame);
        this.registerGameType('plinko', PlinkoGame);
        this.registerGameType('mines', MinesGame);
        // Add more as needed...
    }
    
    registerGameType(gameType, GameClass) {
        if (typeof GameClass !== 'function') {
            throw new Error('GameClass must be a constructor function');
        }
        this.gameRegistry.set(gameType, GameClass);
        console.log(`✅ Registered game type: ${gameType}`);
    }
    
    async loadGamesFromFirestore() {
        try {
            const gamesSnapshot = await firebaseApp.db.collection('games')
                .where('active', '==', true)
                .orderBy('order')
                .get();
            
            gamesSnapshot.forEach(doc => {
                const gameData = doc.data();
                this.createGameInstance(doc.id, gameData);
            });
            
            console.log(`✅ Loaded ${this.games.size} games from Firestore`);
            return Array.from(this.games.values());
            
        } catch (error) {
            console.error('❌ Error loading games:', error);
            return [];
        }
    }
    
    createGameInstance(gameId, gameData) {
        const GameClass = this.gameRegistry.get(gameData.type);
        
        if (!GameClass) {
            console.warn(`⚠️ No handler for game type: ${gameData.type}`);
            return null;
        }
        
        try {
            const gameInstance = new GameClass(gameId, gameData);
            this.games.set(gameId, gameInstance);
            console.log(`✅ Created game: ${gameData.name}`);
            return gameInstance;
        } catch (error) {
            console.error(`❌ Failed to create game ${gameId}:`, error);
            return null;
        }
    }
    
    async addNewGame(gameData) {
        try {
            // Add to Firestore
            const gameRef = await firebaseApp.db.collection('games').add({
                ...gameData,
                active: true,
                order: this.games.size + 1,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Create local instance
            const gameInstance = this.createGameInstance(gameRef.id, {
                ...gameData,
                id: gameRef.id
            });
            
            return { success: true, gameId: gameRef.id, game: gameInstance };
            
        } catch (error) {
            console.error('❌ Error adding new game:', error);
            return { success: false, error: error.message };
        }
    }
    
    getGame(gameId) {
        return this.games.get(gameId);
    }
    
    getAllGames() {
        return Array.from(this.games.values());
    }
    
    getGamesByType(gameType) {
        return Array.from(this.games.values()).filter(game => game.type === gameType);
    }
    
    getGamesByCategory(category) {
        return Array.from(this.games.values()).filter(game => game.category === category);
    }
    
    setActiveGame(gameId) {
        const game = this.getGame(gameId);
        if (game) {
            this.activeGame = game;
            return game;
        }
        return null;
    }
    
    getActiveGame() {
        return this.activeGame;
    }
}

// Base Game Class (All games inherit from this)
class BaseGame {
    constructor(gameId, config) {
        this.id = gameId;
        this.name = config.name || 'Unnamed Game';
        this.type = config.type || 'unknown';
        this.category = config.category || 'other';
        this.description = config.description || '';
        this.icon = config.icon || 'fas fa-gamepad';
        this.thumbnail = config.thumbnail || '';
        this.minBet = config.minBet || 1;
        this.maxBet = config.maxBet || 1000;
        this.maxWin = config.maxWin || 10000;
        this.rtp = config.rtp || 95.0; // Return to Player percentage
        this.volatility = config.volatility || 'medium'; // low, medium, high
        this.active = config.active !== false;
        this.order = config.order || 999;
        this.features = config.features || [];
        this.theme = config.theme || 'default';
        this.version = config.version || '1.0.0';
        
        // Game state
        this.isPlaying = false;
        this.currentBet = 0;
        this.sessionId = null;
    }
    
    // Must be implemented by subclasses
    async play(betAmount, options = {}) {
        throw new Error('play() method must be implemented by subclass');
    }
    
    async getResult() {
        throw new Error('getResult() method must be implemented by subclass');
    }
    
    // Common methods
    validateBet(betAmount) {
        if (betAmount < this.minBet) {
            throw new Error(`Minimum bet is $${this.minBet}`);
        }
        if (betAmount > this.maxBet) {
            throw new Error(`Maximum bet is $${this.maxBet}`);
        }
        return true;
    }
    
    async placeBet(betAmount, options = {}) {
        this.validateBet(betAmount);
        
        if (!window.walletSystem || !window.walletSystem.userId) {
            throw new Error('Wallet not initialized');
        }
        
        // Create session
        this.sessionId = `SESSION-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Place bet through wallet system
        const result = await window.walletSystem.placeBet(
            this.id,
            betAmount,
            this.type,
            {
                sessionId: this.sessionId,
                gameName: this.name,
                gameType: this.type,
                ...options
            }
        );
        
        if (result.success) {
            this.isPlaying = true;
            this.currentBet = betAmount;
            
            // Log game start
            await this.logGameEvent('bet_placed', {
                betAmount: betAmount,
                sessionId: this.sessionId
            });
            
            return result;
        } else {
            throw new Error(result.error || 'Bet failed');
        }
    }
    
    async creditWinnings(winAmount, multiplier = 1, winData = {}) {
        if (!this.isPlaying) {
            throw new Error('No active game session');
        }
        
        // Credit winnings through wallet system
        const result = await window.walletSystem.creditWinnings(
            this.id,
            winAmount,
            this.type,
            multiplier,
            {
                sessionId: this.sessionId,
                originalBet: this.currentBet,
                gameName: this.name,
                ...winData
            }
        );
        
        if (result.success) {
            // Log win
            await this.logGameEvent('win', {
                winAmount: winAmount,
                multiplier: multiplier,
                originalBet: this.currentBet,
                sessionId: this.sessionId,
                ...winData
            });
            
            this.endSession();
            return { success: true, amount: winAmount, multiplier: multiplier };
        } else {
            throw new Error(result.error || 'Win processing failed');
        }
    }
    
    async processLoss(lossData = {}) {
        if (!this.isPlaying) {
            throw new Error('No active game session');
        }
        
        // Log loss
        await this.logGameEvent('loss', {
            lostAmount: this.currentBet,
            sessionId: this.sessionId,
            ...lossData
        });
        
        this.endSession();
        return { success: true, message: 'Game lost' };
    }
    
    endSession() {
        this.isPlaying = false;
        this.currentBet = 0;
        this.sessionId = null;
    }
    
    async logGameEvent(eventType, data = {}) {
        try {
            await firebaseApp.db.collection('game_logs').add({
                userId: window.walletSystem?.userId || 'unknown',
                gameId: this.id,
                gameName: this.name,
                eventType: eventType,
                sessionId: this.sessionId,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                ...data
            });
        } catch (error) {
            console.error('Error logging game event:', error);
        }
    }
    
    // UI helper methods
    getIconHTML() {
        return `<i class="${this.icon}"></i>`;
    }
    
    getCardHTML() {
        return `
            <div class="game-card" data-game-id="${this.id}" data-game-type="${this.type}">
                <div class="game-icon">${this.getIconHTML()}</div>
                <h3 class="game-title">${this.name}</h3>
                <p class="game-description">${this.description}</p>
                <div class="game-stats">
                    <div>
                        <div>Min Bet</div>
                        <div class="stat-number">$${this.minBet}</div>
                    </div>
                    <div>
                        <div>Max Win</div>
                        <div class="stat-number">$${this.maxWin}</div>
                    </div>
                </div>
                <button class="btn-play" onclick="window.gameManager.setActiveGame('${this.id}')">
                    Play Now
                </button>
            </div>
        `;
    }
}

// ===== GAME IMPLEMENTATIONS =====

// Slot Machine Game
class SlotGame extends BaseGame {
    constructor(gameId, config) {
        super(gameId, config);
        this.reels = config.reels || 5;
        this.rows = config.rows || 3;
        this.symbols = config.symbols || ['🍒', '🍋', '🍊', '🍉', '⭐', '7️⃣'];
        this.paylines = config.paylines || 20;
        this.bonusFeatures = config.bonusFeatures || ['free_spins', 'multiplier', 'wheel'];
    }
    
    async play(betAmount, options = {}) {
        // Place bet
        await this.placeBet(betAmount, options);
        
        // Simulate slot spin
        const spinResult = this.spin();
        const winResult = this.calculateWin(spinResult, betAmount);
        
        if (winResult.win > 0) {
            return await this.creditWinnings(winResult.win, winResult.multiplier, {
                spinResult: spinResult,
                payline: winResult.payline,
                symbols: winResult.symbols
            });
        } else {
            return await this.processLoss({
                spinResult: spinResult
            });
        }
    }
    
    spin() {
        const result = [];
        for (let i = 0; i < this.reels; i++) {
            const reel = [];
            for (let j = 0; j < this.rows; j++) {
                const randomIndex = Math.floor(Math.random() * this.symbols.length);
                reel.push(this.symbols[randomIndex]);
            }
            result.push(reel);
        }
        return result;
    }
    
    calculateWin(spinResult, betAmount) {
        // Simplified win calculation
        // In real implementation, use proper paytable and payline checking
        
        const firstSymbol = spinResult[0][0];
        let matches = 1;
        
        // Check first row for matches
        for (let i = 1; i < this.reels; i++) {
            if (spinResult[i][0] === firstSymbol) {
                matches++;
            } else {
                break;
            }
        }
        
        const paytable = {
            '🍒': [0, 0, 5, 10, 50, 100],
            '🍋': [0, 0, 3, 7, 30, 70],
            '🍊': [0, 0, 2, 5, 20, 50],
            '🍉': [0, 0, 1, 3, 10, 25],
            '⭐': [0, 0, 10, 25, 100, 250],
            '7️⃣': [0, 0, 20, 50, 200, 500]
        };
        
        const multiplier = paytable[firstSymbol]?.[matches] || 0;
        const winAmount = betAmount * multiplier;
        
        return {
            win: winAmount,
            multiplier: multiplier,
            symbols: matches,
            payline: 1
        };
    }
}

// Dice Game
class DiceGame extends BaseGame {
    constructor(gameId, config) {
        super(gameId, config);
        this.diceCount = config.diceCount || 2;
        this.targetNumber = config.targetNumber || 7;
        this.payoutMultiplier = config.payoutMultiplier || 6;
    }
    
    async play(betAmount, options = {}) {
        const { prediction, rollOver } = options;
        
        await this.placeBet(betAmount, { prediction, rollOver });
        
        const rollResult = this.rollDice();
        const total = rollResult.reduce((a, b) => a + b, 0);
        
        let win = 0;
        let multiplier = 0;
        
        if (prediction !== undefined) {
            // Prediction mode
            if (total === prediction) {
                multiplier = this.payoutMultiplier;
                win = betAmount * multiplier;
            }
        } else if (rollOver !== undefined) {
            // Roll over/under mode
            if ((rollOver && total > this.targetNumber) || (!rollOver && total < this.targetNumber)) {
                multiplier = 2;
                win = betAmount * multiplier;
            } else if (total === this.targetNumber) {
                // Push - return bet
                multiplier = 1;
                win = betAmount;
            }
        }
        
        if (win > 0) {
            return await this.creditWinnings(win, multiplier, {
                diceRoll: rollResult,
                total: total,
                prediction: prediction,
                rollOver: rollOver
            });
        } else {
            return await this.processLoss({
                diceRoll: rollResult,
                total: total,
                prediction: prediction,
                rollOver: rollOver
            });
        }
    }
    
    rollDice() {
        const rolls = [];
        for (let i = 0; i < this.diceCount; i++) {
            rolls.push(Math.floor(Math.random() * 6) + 1);
        }
        return rolls;
    }
}

// Poker Game
class PokerGame extends BaseGame {
    constructor(gameId, config) {
        super(gameId, config);
        this.deck = [];
        this.hand = [];
        this.communityCards = [];
        this.initDeck();
    }
    
    initDeck() {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        
        this.deck = [];
        for (let suit of suits) {
            for (let value of values) {
                this.deck.push({ suit, value });
            }
        }
        this.shuffleDeck();
    }
    
    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }
    
    dealCard() {
        return this.deck.pop();
    }
    
    // ... more poker logic
}

// Roulette Game
class RouletteGame extends BaseGame {
    constructor(gameId, config) {
        super(gameId, config);
        this.wheelType = config.wheelType || 'european'; // european or american
        this.numbers = this.wheelType === 'european' ? 37 : 38; // 0-36 or 00,0-36
    }
    
    async play(betAmount, options = {}) {
        const { betType, betNumbers } = options;
        
        await this.placeBet(betAmount, { betType, betNumbers });
        
        const winningNumber = this.spinWheel();
        const win = this.calculateRouletteWin(betType, betNumbers, winningNumber, betAmount);
        
        if (win > 0) {
            const multiplier = win / betAmount;
            return await this.creditWinnings(win, multiplier, {
                winningNumber: winningNumber,
                betType: betType,
                betNumbers: betNumbers
            });
        } else {
            return await this.processLoss({
                winningNumber: winningNumber,
                betType: betType,
                betNumbers: betNumbers
            });
        }
    }
    
    spinWheel() {
        return Math.floor(Math.random() * this.numbers);
    }
    
    calculateRouletteWin(betType, betNumbers, winningNumber, betAmount) {
        // Simplified roulette payout calculation
        const payouts = {
            'straight': 35,    // Single number
            'split': 17,       // Two adjacent numbers
            'street': 11,      // Three numbers in a row
            'corner': 8,       // Four numbers in a square
            'line': 5,         // Six numbers (two rows)
            'dozen': 2,        // First/Middle/Last 12
            'column': 2,       // Column of 12 numbers
            'red': 1,          // Red numbers
            'black': 1,        // Black numbers
            'even': 1,         // Even numbers
            'odd': 1,          // Odd numbers
            'high': 1,         // 19-36
            'low': 1           // 1-18
        };
        
        // Check if bet wins (simplified)
        const isWin = this.checkRouletteWin(betType, betNumbers, winningNumber);
        
        if (isWin) {
            return betAmount * (payouts[betType] || 1);
        }
        return 0;
    }
    
    checkRouletteWin(betType, betNumbers, winningNumber) {
        // Simplified win checking
        // Real implementation would check specific numbers
        return Math.random() < 0.48; // Simplified for example
    }
}

// Blackjack Game
class BlackjackGame extends BaseGame {
    constructor(gameId, config) {
        super(gameId, config);
        this.deckCount = config.deckCount || 6;
        this.deck = [];
        this.initDecks();
    }
    
    initDecks() {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        
        this.deck = [];
        for (let d = 0; d < this.deckCount; d++) {
            for (let suit of suits) {
                for (let value of values) {
                    this.deck.push({ suit, value });
                }
            }
        }
        this.shuffleDeck();
    }
    
    shuffleDeck() {
        // Fisher-Yates shuffle
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }
    
    dealCard() {
        if (this.deck.length < 10) {
            this.initDecks(); // Reshuffle if deck is low
        }
        return this.deck.pop();
    }
    
    getCardValue(card) {
        if (['J', 'Q', 'K'].includes(card.value)) return 10;
        if (card.value === 'A') return 11; // Or 1, depending on hand
        return parseInt(card.value);
    }
    
    // ... more blackjack logic
}

// Crash Game
class CrashGame extends BaseGame {
    constructor(gameId, config) {
        super(gameId, config);
        this.maxMultiplier = config.maxMultiplier || 100;
        this.crashPoint = 1.0;
        this.isCrashing = false;
    }
    
    async play(betAmount, options = {}) {
        const { autoCashout } = options;
        
        await this.placeBet(betAmount, { autoCashout });
        
        // Start crash sequence
        this.startCrashSequence();
        
        if (autoCashout) {
            // Auto-cashout logic
            setTimeout(async () => {
                if (!this.isCrashing) {
                    const currentMultiplier = this.getCurrentMultiplier();
                    if (currentMultiplier >= autoCashout) {
                        const winAmount = betAmount * autoCashout;
                        await this.creditWinnings(winAmount, autoCashout, {
                            cashoutAt: autoCashout,
                            crashedAt: this.crashPoint
                        });
                    }
                }
            }, 100);
        }
        
        // Return promise that resolves when player cashes out or crashes
        return new Promise((resolve) => {
            this.cashoutResolver = resolve;
        });
    }
    
    startCrashSequence() {
        this.isCrashing = false;
        this.crashPoint = this.calculateCrashPoint();
        
        // Simulate crash game
        let currentMultiplier = 1.0;
        const interval = setInterval(() => {
            if (currentMultiplier >= this.crashPoint) {
                this.isCrashing = true;
                clearInterval(interval);
                // Game crashed
                this.resolveCrash(false);
            } else {
                currentMultiplier += 0.01;
                // Update UI with current multiplier
                if (typeof this.onMultiplierUpdate === 'function') {
                    this.onMultiplierUpdate(currentMultiplier);
                }
            }
        }, 100);
    }
    
    calculateCrashPoint() {
        // Algorithm to calculate crash point
        const e = 2 ** 32;
        const h = crypto.getRandomValues(new Uint32Array(1))[0];
        return Math.floor((100 * e - h) / (e - h)) / 100;
    }
    
    async cashout(currentMultiplier) {
        if (this.isCrashing) {
            throw new Error('Already crashed');
        }
        
        const winAmount = this.currentBet * currentMultiplier;
        const result = await this.creditWinnings(winAmount, currentMultiplier, {
            cashedOut: true,
            crashedAt: this.crashPoint
        });
        
        this.resolveCrash(true);
        return result;
    }
    
    resolveCrash(didCashout) {
        if (this.cashoutResolver) {
            this.cashoutResolver({
                success: didCashout,
                crashedAt: this.crashPoint,
                cashedOut: didCashout
            });
            this.cashoutResolver = null;
        }
    }
}

// Mines Game
class MinesGame extends BaseGame {
    constructor(gameId, config) {
        super(gameId, config);
        this.gridSize = config.gridSize || 5;
        this.mineCount = config.mineCount || 3;
        this.grid = [];
        this.revealed = [];
    }
    
    async play(betAmount, options = {}) {
        const { mines, autoCashout } = options;
        
        await this.placeBet(betAmount, { mines, autoCashout });
        
        // Initialize game grid
        this.initGrid();
        
        // Return game state
        return {
            grid: this.getHiddenGrid(),
            mines: this.mineCount,
            betAmount: betAmount
        };
    }
    
    initGrid() {
        this.grid = Array(this.gridSize * this.gridSize).fill(0);
        this.revealed = Array(this.gridSize * this.gridSize).fill(false);
        
        // Place mines
        let placed = 0;
        while (placed < this.mineCount) {
            const pos = Math.floor(Math.random() * this.grid.length);
            if (this.grid[pos] === 0) {
                this.grid[pos] = 1; // 1 = mine
                placed++;
            }
        }
    }
    
    async reveal(position) {
        if (this.revealed[position]) {
            throw new Error('Already revealed');
        }
        
        this.revealed[position] = true;
        
        if (this.grid[position] === 1) {
            // Hit a mine
            await this.processLoss({
                position: position,
                totalRevealed: this.revealed.filter(r => r).length
            });
            return { mine: true, gameOver: true };
        } else {
            // Safe spot
            const multiplier = this.calculateMultiplier();
            await this.logGameEvent('safe_reveal', {
                position: position,
                multiplier: multiplier
            });
            
            return { mine: false, multiplier: multiplier };
        }
    }
    
    async cashout(currentMultiplier) {
        const winAmount = this.currentBet * currentMultiplier;
        return await this.creditWinnings(winAmount, currentMultiplier, {
            cashedOut: true,
            positionsRevealed: this.revealed.filter(r => r).length
        });
    }
    
    calculateMultiplier() {
        const safeSpots = this.gridSize * this.gridSize - this.mineCount;
        const revealedSafe = this.revealed.filter((r, i) => r && this.grid[i] === 0).length;
        
        // Calculate multiplier based on revealed safe spots
        return 1 + (revealedSafe / safeSpots) * (this.maxWin / this.currentBet - 1);
    }
    
    getHiddenGrid() {
        return this.grid.map((cell, index) => ({
            position: index,
            revealed: this.revealed[index],
            isMine: this.revealed[index] ? cell === 1 : null
        }));
    }
}

// Plinko Game
class PlinkoGame extends BaseGame {
    constructor(gameId, config) {
        super(gameId, config);
        this.rows = config.rows || 10;
        this.buckets = config.buckets || [0.2, 0.4, 1, 2, 5, 2, 1, 0.4, 0.2];
        this.pegLayout = this.generatePegLayout();
    }
    
    async play(betAmount, options = {}) {
        const { bucket } = options;
        
        await this.placeBet(betAmount, { bucket });
        
        // Simulate ball drop
        const result = this.dropBall();
        const multiplier = this.buckets[result.bucket];
        const winAmount = betAmount * multiplier;
        
        if (winAmount > 0) {
            return await this.creditWinnings(winAmount, multiplier, {
                bucket: result.bucket,
                path: result.path
            });
        } else {
            return await this.processLoss({
                bucket: result.bucket
            });
        }
    }
    
    generatePegLayout() {
        const layout = [];
        for (let row = 0; row < this.rows; row++) {
            const pegs = [];
            for (let col = 0; col <= row; col++) {
                pegs.push({ row, col });
            }
            layout.push(pegs);
        }
        return layout;
    }
    
    dropBall() {
        let col = Math.floor(this.rows / 2);
        const path = [];
        
        for (let row = 0; row < this.rows; row++) {
            // Randomly go left or right at each peg
            const direction = Math.random() > 0.5 ? 1 : -1;
            col = Math.max(0, Math.min(row, col + direction));
            path.push({ row, col });
        }
        
        // Determine final bucket
        const bucket = Math.floor((col / this.rows) * this.buckets.length);
        
        return { bucket: Math.min(bucket, this.buckets.length - 1), path };
    }
}

// Create global instance
window.gameManager = new GameManager();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for Firebase to initialize
    setTimeout(async () => {
        if (firebaseApp && firebaseApp.db) {
            await window.gameManager.loadGamesFromFirestore();
            
            // Dispatch event that games are loaded
            window.dispatchEvent(new CustomEvent('gamesLoaded', {
                detail: { games: window.gameManager.getAllGames() }
            }));
        }
    }, 1000);
});
