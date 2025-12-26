// game-engine.js - Example game using wallet system
class GameEngine {
    constructor(gameId) {
        this.gameId = gameId;
        this.isPlaying = false;
        this.currentBet = 0;
    }
    
    async placeBet(amount) {
        if (this.isPlaying) {
            throw new Error('Game already in progress');
        }
        
        if (!window.walletSystem || !window.walletSystem.userId) {
            throw new Error('Wallet not initialized');
        }
        
        // Place bet through wallet system
        const result = await window.walletSystem.placeBet(
            this.gameId,
            amount,
            'slot', // game type
            {
                betId: `BET-${Date.now()}`,
                autoPlay: false
            }
        );
        
        if (result.success) {
            this.isPlaying = true;
            this.currentBet = amount;
            return result;
        } else {
            throw new Error(result.error || 'Bet failed');
        }
    }
    
    async processWin(multiplier) {
        if (!this.isPlaying) {
            throw new Error('No active game');
        }
        
        const winAmount = this.currentBet * multiplier;
        
        // Credit winnings through wallet system
        const result = await window.walletSystem.creditWinnings(
            this.gameId,
            winAmount,
            'slot',
            multiplier,
            {
                betId: `BET-${Date.now()}`,
                originalBet: this.currentBet
            }
        );
        
        if (result.success) {
            this.isPlaying = false;
            this.currentBet = 0;
            return { success: true, amount: winAmount, multiplier: multiplier };
        } else {
            throw new Error(result.error || 'Win processing failed');
        }
    }
    
    async processLoss() {
        if (!this.isPlaying) {
            throw new Error('No active game');
        }
        
        this.isPlaying = false;
        this.currentBet = 0;
        
        return { success: true, message: 'Game lost' };
    }
}
