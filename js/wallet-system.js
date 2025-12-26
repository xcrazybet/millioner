// wallet-system.js
class WalletSystem {
    constructor() {
        this.userId = null;
        this.userData = null;
        this.walletData = null;
        this.balance = 0;
        
        // Event listeners
        this.onBalanceUpdate = null;
        this.onTransactionUpdate = null;
        
        // Setup auth listener
        this.setupAuthListener();
    }
    
    setupAuthListener() {
        firebaseApp.auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.userId = user.uid;
                await this.loadUserWallet();
                this.setupWalletListeners();
            } else {
                this.cleanup();
                this.userId = null;
                this.walletData = null;
                this.balance = 0;
            }
        });
    }
    
    async loadUserWallet() {
        try {
            const walletDoc = await firebaseApp.db.collection('wallets').doc(this.userId).get();
            
            if (!walletDoc.exists) {
                // Create new wallet for user
                await this.createNewWallet();
            } else {
                this.walletData = walletDoc.data();
                this.balance = this.walletData.balance || 0;
                this.triggerBalanceUpdate();
            }
        } catch (error) {
            console.error("❌ Error loading wallet:", error);
        }
    }
    
    async createNewWallet() {
        try {
            const user = firebaseApp.auth.currentUser;
            const walletId = `WALLET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            const walletData = {
                userId: this.userId,
                email: user.email,
                username: user.email.split('@')[0],
                walletId: walletId,
                balance: 100.00, // Starting bonus
                bonusBalance: 100.00,
                totalDeposited: 0,
                totalWithdrawn: 0,
                totalWon: 0,
                totalLost: 0,
                totalGamesPlayed: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active',
                currency: 'USD',
                settings: {
                    autoPlay: false,
                    soundEnabled: true,
                    betLimits: {
                        min: 1,
                        max: 1000
                    }
                }
            };
            
            await firebaseApp.db.collection('wallets').doc(this.userId).set(walletData);
            
            // Create welcome bonus transaction
            await this.createTransaction({
                type: 'bonus',
                amount: 100.00,
                description: 'Welcome Bonus!',
                game: 'system',
                status: 'completed'
            });
            
            this.walletData = walletData;
            this.balance = 100.00;
            this.triggerBalanceUpdate();
            
            console.log("✅ New wallet created with $100 bonus");
            
        } catch (error) {
            console.error("❌ Error creating wallet:", error);
        }
    }
    
    setupWalletListeners() {
        // Real-time wallet balance listener
        this.walletUnsubscribe = firebaseApp.db.collection('wallets')
            .doc(this.userId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const newData = doc.data();
                    const oldBalance = this.balance;
                    this.walletData = newData;
                    this.balance = newData.balance || 0;
                    
                    // Trigger update if balance changed
                    if (oldBalance !== this.balance) {
                        this.triggerBalanceUpdate();
                    }
                }
            }, (error) => {
                console.error("❌ Wallet listener error:", error);
            });
        
        // Real-time transactions listener
        this.transactionsUnsubscribe = firebaseApp.db.collection('transactions')
            .where('userId', '==', this.userId)
            .orderBy('timestamp', 'desc')
            .limit(20)
            .onSnapshot((snapshot) => {
                const transactions = [];
                snapshot.forEach(doc => {
                    transactions.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                if (this.onTransactionUpdate) {
                    this.onTransactionUpdate(transactions);
                }
            }, (error) => {
                console.error("❌ Transactions listener error:", error);
            });
    }
    
    // ===== WALLET OPERATIONS =====
    
    async deposit(amount, method = 'credit_card', note = '') {
        try {
            if (amount <= 0) throw new Error('Invalid deposit amount');
            
            // Use transaction for atomic operation
            await firebaseApp.db.runTransaction(async (transaction) => {
                const walletRef = firebaseApp.db.collection('wallets').doc(this.userId);
                const walletDoc = await transaction.get(walletRef);
                
                if (!walletDoc.exists) throw new Error('Wallet not found');
                
                const wallet = walletDoc.data();
                const newBalance = (wallet.balance || 0) + amount;
                
                // Update wallet
                transaction.update(walletRef, {
                    balance: newBalance,
                    totalDeposited: firebase.firestore.FieldValue.increment(amount),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Create deposit transaction
                const txRef = firebaseApp.db.collection('transactions').doc();
                transaction.set(txRef, {
                    id: txRef.id,
                    userId: this.userId,
                    type: 'deposit',
                    subType: method,
                    amount: amount,
                    description: note || `Deposit via ${method}`,
                    game: 'system',
                    status: 'completed',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    userEmail: wallet.email,
                    username: wallet.username,
                    previousBalance: wallet.balance || 0,
                    newBalance: newBalance,
                    metadata: {
                        method: method,
                        note: note
                    }
                });
            });
            
            console.log(`✅ Deposit successful: $${amount}`);
            return { success: true, newBalance: this.balance + amount };
            
        } catch (error) {
            console.error("❌ Deposit failed:", error);
            return { success: false, error: error.message };
        }
    }
    
    async withdraw(amount, method = 'bank_transfer', details = '', note = '') {
        try {
            if (amount <= 0) throw new Error('Invalid withdrawal amount');
            if (amount > this.balance) throw new Error('Insufficient balance');
            
            // Use transaction for atomic operation
            await firebaseApp.db.runTransaction(async (transaction) => {
                const walletRef = firebaseApp.db.collection('wallets').doc(this.userId);
                const walletDoc = await transaction.get(walletRef);
                
                if (!walletDoc.exists) throw new Error('Wallet not found');
                
                const wallet = walletDoc.data();
                const newBalance = (wallet.balance || 0) - amount;
                
                // Update wallet
                transaction.update(walletRef, {
                    balance: newBalance,
                    totalWithdrawn: firebase.firestore.FieldValue.increment(amount),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Create withdrawal transaction (pending)
                const txRef = firebaseApp.db.collection('transactions').doc();
                transaction.set(txRef, {
                    id: txRef.id,
                    userId: this.userId,
                    type: 'withdrawal',
                    subType: method,
                    amount: amount,
                    description: note || `Withdrawal to ${method}`,
                    game: 'system',
                    status: 'pending', // Admin must approve
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    userEmail: wallet.email,
                    username: wallet.username,
                    previousBalance: wallet.balance || 0,
                    newBalance: newBalance,
                    metadata: {
                        method: method,
                        details: details,
                        note: note
                    }
                });
                
                // Also create withdrawal request
                const withdrawalRef = firebaseApp.db.collection('withdrawals').doc();
                transaction.set(withdrawalRef, {
                    id: withdrawalRef.id,
                    userId: this.userId,
                    amount: amount,
                    method: method,
                    details: details,
                    status: 'pending',
                    requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    userEmail: wallet.email,
                    username: wallet.username,
                    walletBalance: newBalance
                });
            });
            
            console.log(`✅ Withdrawal requested: $${amount}`);
            return { success: true, message: 'Withdrawal request submitted' };
            
        } catch (error) {
            console.error("❌ Withdrawal failed:", error);
            return { success: false, error: error.message };
        }
    }
    
    async placeBet(gameId, amount, gameType = 'slot', metadata = {}) {
        try {
            if (amount <= 0) throw new Error('Invalid bet amount');
            if (amount > this.balance) throw new Error('Insufficient balance');
            
            // Use transaction for atomic operation
            await firebaseApp.db.runTransaction(async (transaction) => {
                const walletRef = firebaseApp.db.collection('wallets').doc(this.userId);
                const walletDoc = await transaction.get(walletRef);
                
                if (!walletDoc.exists) throw new Error('Wallet not found');
                
                const wallet = walletDoc.data();
                const newBalance = (wallet.balance || 0) - amount;
                
                // Update wallet
                transaction.update(walletRef, {
                    balance: newBalance,
                    totalLost: firebase.firestore.FieldValue.increment(amount),
                    totalGamesPlayed: firebase.firestore.FieldValue.increment(1),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Create bet transaction
                const txRef = firebaseApp.db.collection('transactions').doc();
                transaction.set(txRef, {
                    id: txRef.id,
                    userId: this.userId,
                    type: 'game_bet',
                    subType: gameType,
                    amount: amount,
                    description: `Bet on ${gameType}`,
                    game: gameId,
                    status: 'completed',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    userEmail: wallet.email,
                    username: wallet.username,
                    previousBalance: wallet.balance || 0,
                    newBalance: newBalance,
                    metadata: {
                        gameId: gameId,
                        gameType: gameType,
                        ...metadata
                    }
                });
            });
            
            console.log(`✅ Bet placed: $${amount} on ${gameId}`);
            return { success: true, newBalance: this.balance - amount };
            
        } catch (error) {
            console.error("❌ Bet placement failed:", error);
            return { success: false, error: error.message };
        }
    }
    
    async creditWinnings(gameId, amount, gameType = 'slot', multiplier = 1, metadata = {}) {
        try {
            if (amount <= 0) throw new Error('Invalid win amount');
            
            // Use transaction for atomic operation
            await firebaseApp.db.runTransaction(async (transaction) => {
                const walletRef = firebaseApp.db.collection('wallets').doc(this.userId);
                const walletDoc = await transaction.get(walletRef);
                
                if (!walletDoc.exists) throw new Error('Wallet not found');
                
                const wallet = walletDoc.data();
                const newBalance = (wallet.balance || 0) + amount;
                
                // Update wallet
                transaction.update(walletRef, {
                    balance: newBalance,
                    totalWon: firebase.firestore.FieldValue.increment(amount),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Create win transaction
                const txRef = firebaseApp.db.collection('transactions').doc();
                transaction.set(txRef, {
                    id: txRef.id,
                    userId: this.userId,
                    type: 'game_win',
                    subType: gameType,
                    amount: amount,
                    description: `Won ${multiplier}x on ${gameType}`,
                    game: gameId,
                    status: 'completed',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    userEmail: wallet.email,
                    username: wallet.username,
                    previousBalance: wallet.balance || 0,
                    newBalance: newBalance,
                    metadata: {
                        gameId: gameId,
                        gameType: gameType,
                        multiplier: multiplier,
                        ...metadata
                    }
                });
            });
            
            console.log(`✅ Winnings credited: $${amount} from ${gameId}`);
            return { success: true, newBalance: this.balance + amount };
            
        } catch (error) {
            console.error("❌ Credit winnings failed:", error);
            return { success: false, error: error.message };
        }
    }
    
    async sendMoney(recipientEmail, amount, note = '') {
        try {
            if (amount <= 0) throw new Error('Invalid amount');
            if (amount > this.balance) throw new Error('Insufficient balance');
            
            // Find recipient
            const recipientQuery = await firebaseApp.db.collection('wallets')
                .where('email', '==', recipientEmail.toLowerCase())
                .limit(1)
                .get();
            
            if (recipientQuery.empty) throw new Error('Recipient not found');
            
            const recipientDoc = recipientQuery.docs[0];
            const recipientData = recipientDoc.data();
            
            if (recipientData.userId === this.userId) throw new Error('Cannot send to yourself');
            
            // Use transaction for atomic operation
            await firebaseApp.db.runTransaction(async (transaction) => {
                // Sender wallet
                const senderRef = firebaseApp.db.collection('wallets').doc(this.userId);
                const senderDoc = await transaction.get(senderRef);
                
                if (!senderDoc.exists) throw new Error('Sender wallet not found');
                
                const senderData = senderDoc.data();
                const senderNewBalance = (senderData.balance || 0) - amount;
                
                // Recipient wallet
                const recipientRef = firebaseApp.db.collection('wallets').doc(recipientData.userId);
                const recipientDocSnap = await transaction.get(recipientRef);
                
                if (!recipientDocSnap.exists) throw new Error('Recipient wallet not found');
                
                const recipientWallet = recipientDocSnap.data();
                const recipientNewBalance = (recipientWallet.balance || 0) + amount;
                
                // Update sender
                transaction.update(senderRef, {
                    balance: senderNewBalance,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Update recipient
                transaction.update(recipientRef, {
                    balance: recipientNewBalance,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Create sender transaction
                const senderTxRef = firebaseApp.db.collection('transactions').doc();
                transaction.set(senderTxRef, {
                    id: senderTxRef.id,
                    userId: this.userId,
                    type: 'send',
                    subType: 'peer_transfer',
                    amount: amount,
                    description: note || `Sent to ${recipientEmail}`,
                    game: 'system',
                    status: 'completed',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    userEmail: senderData.email,
                    username: senderData.username,
                    previousBalance: senderData.balance || 0,
                    newBalance: senderNewBalance,
                    metadata: {
                        recipientEmail: recipientEmail,
                        recipientId: recipientData.userId,
                        note: note
                    }
                });
                
                // Create recipient transaction
                const recipientTxRef = firebaseApp.db.collection('transactions').doc();
                transaction.set(recipientTxRef, {
                    id: recipientTxRef.id,
                    userId: recipientData.userId,
                    type: 'receive',
                    subType: 'peer_transfer',
                    amount: amount,
                    description: note || `Received from ${senderData.email}`,
                    game: 'system',
                    status: 'completed',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    userEmail: recipientWallet.email,
                    username: recipientWallet.username,
                    previousBalance: recipientWallet.balance || 0,
                    newBalance: recipientNewBalance,
                    metadata: {
                        senderEmail: senderData.email,
                        senderId: this.userId,
                        note: note
                    }
                });
            });
            
            console.log(`✅ Money sent: $${amount} to ${recipientEmail}`);
            return { success: true, newBalance: this.balance - amount };
            
        } catch (error) {
            console.error("❌ Send money failed:", error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== HELPER METHODS =====
    
    async createTransaction(data) {
        try {
            const txRef = firebaseApp.db.collection('transactions').doc();
            const transactionData = {
                id: txRef.id,
                userId: this.userId,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                ...data
            };
            
            await txRef.set(transactionData);
            return { success: true, id: txRef.id };
            
        } catch (error) {
            console.error("❌ Create transaction error:", error);
            return { success: false, error: error.message };
        }
    }
    
    triggerBalanceUpdate() {
        if (this.onBalanceUpdate) {
            this.onBalanceUpdate(this.balance, this.walletData);
        }
    }
    
    getBalance() {
        return this.balance;
    }
    
    getWalletData() {
        return this.walletData;
    }
    
    formatBalance(balance = this.balance) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(balance);
    }
    
    cleanup() {
        if (this.walletUnsubscribe) {
            this.walletUnsubscribe();
            this.walletUnsubscribe = null;
        }
        if (this.transactionsUnsubscribe) {
            this.transactionsUnsubscribe();
            this.transactionsUnsubscribe = null;
        }
        
        this.userId = null;
        this.walletData = null;
        this.balance = 0;
    }
}

// Create global instance
window.walletSystem = new WalletSystem();
