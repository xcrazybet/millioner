// balance-sync.js v3.0 - Production Grade
class BalanceSync {
    constructor() {
        // Use Symbols for private properties (if supported)
        this._balanceListeners = new Set();
        this._transactionListeners = new Set();
        this._lowBalanceListeners = new Set();
        this._authListeners = new Set();
        this._errorListeners = new Set();
        
        // Core state
        this._currentBalance = 0;
        this._userId = null;
        this._lastBalanceUpdate = 0;
        this._wasLowBalance = false;
        this._isInitialized = false;
        this._pendingTransactions = new Map();
        
        // Firebase listeners
        this._unsubscribeBalance = null;
        this._unsubscribeTransactions = null;
        
        // Browser APIs
        this._broadcastChannel = null;
        this._storageListener = null;
        this._db = null;
        this._balanceUpdateDebounce = null;
        
        // Immutable configuration
        this._config = Object.freeze({
            enableOfflineCache: true,
            syncAcrossTabs: true,
            enableBalanceAlerts: true,
            enableAutoRetry: true,
            maxRetryAttempts: 3,
            balanceUpdateDebounceMs: 500,
            maxTransactionHistory: 100,
            lowBalanceThreshold: 1000, // Store as cents ($10.00)
            currency: 'USD'
        });
        
        // Initialize safely
        this._initialize();
    }
    
    // Private methods
    async _initialize() {
        try {
            // Validate dependencies
            if (!window.firebaseApp || !firebaseApp.auth) {
                throw new Error('FIREBASE_NOT_INITIALIZED');
            }
            
            // Setup auth listener
            this._setupAuthListener();
            
            // Setup cross-tab sync if enabled
            if (this._config.syncAcrossTabs) {
                this._setupCrossTabSync();
            }
            
            // Setup offline cache if enabled
            if (this._config.enableOfflineCache && 'indexedDB' in window) {
                await this._setupIndexedDB();
            }
            
            this._isInitialized = true;
            this._dispatchEvent('initialized', { success: true });
            
        } catch (error) {
            console.error('BalanceSync initialization failed:', error);
            this._handleError('INITIALIZATION_FAILED', error);
        }
    }
    
    _setupAuthListener() {
        firebaseApp.auth.onAuthStateChanged(
            async (user) => {
                try {
                    if (user) {
                        this._userId = user.uid;
                        await this._onUserAuthenticated();
                    } else {
                        await this._onUserLoggedOut();
                    }
                } catch (error) {
                    this._handleError('AUTH_STATE_ERROR', error);
                }
            },
            (error) => {
                this._handleError('AUTH_LISTENER_ERROR', error);
            }
        );
    }
    
    async _onUserAuthenticated() {
        // Notify auth listeners
        this._notifyAuthStateChange(true);
        
        // Setup Firebase listeners
        await this._setupFirebaseListeners();
        
        // Load cached data
        if (this._config.enableOfflineCache && this._db) {
            await this._loadCachedData();
        }
        
        // Check pending transactions
        await this._processPendingTransactions();
    }
    
    async _onUserLoggedOut() {
        // Cleanup everything
        await this._cleanup();
        
        // Reset state
        this._userId = null;
        this._currentBalance = 0;
        this._lastBalanceUpdate = 0;
        this._wasLowBalance = false;
        
        // Notify auth listeners
        this._notifyAuthStateChange(false);
        
        // Clear all non-auth listeners
        this._balanceListeners.clear();
        this._transactionListeners.clear();
        this._lowBalanceListeners.clear();
    }
    
    async _setupFirebaseListeners(retryCount = 0) {
        try {
            const [balanceInitialized, transactionsInitialized] = await Promise.all([
                this._setupBalanceListener(),
                this._setupTransactionsListener()
            ]);
            
            if (!balanceInitialized || !transactionsInitialized) {
                throw new Error('LISTENER_SETUP_FAILED');
            }
            
        } catch (error) {
            if (retryCount < this._config.maxRetryAttempts && this._config.enableAutoRetry) {
                const delay = 1000 * Math.pow(2, retryCount); // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
                return this._setupFirebaseListeners(retryCount + 1);
            }
            this._handleError('LISTENER_SETUP_FAILED', error);
        }
    }
    
    async _setupBalanceListener() {
        if (!this._userId) return false;
        
        // Cleanup existing listener
        if (this._unsubscribeBalance) {
            this._unsubscribeBalance();
        }
        
        return new Promise((resolve, reject) => {
            const walletRef = firebaseApp.db.collection('wallets').doc(this._userId);
            let isFirstSnapshot = true;
            
            this._unsubscribeBalance = walletRef.onSnapshot(
                async (doc) => {
                    try {
                        if (!doc.exists) {
                            await this._createUserWallet();
                            this._currentBalance = 0;
                        } else {
                            const data = doc.data();
                            const previousBalance = this._currentBalance;
                            
                            // Convert to cents for precision
                            const newBalanceInCents = Math.round((data.balance || 0) * 100);
                            const previousBalanceInCents = Math.round(previousBalance * 100);
                            
                            this._currentBalance = newBalanceInCents / 100;
                            
                            // Check for significant changes (at least 1 cent)
                            if (Math.abs(newBalanceInCents - previousBalanceInCents) >= 1) {
                                this._notifyBalanceChange(previousBalance, this._currentBalance);
                            }
                            
                            // Update timestamp
                            this._lastBalanceUpdate = Date.now();
                            
                            // Cache balance if offline storage is available
                            if (this._config.enableOfflineCache && this._db) {
                                await this._cacheBalance();
                            }
                        }
                        
                        // Debounce notifications
                        this._debounceBalanceUpdate();
                        
                        // Resolve on first successful snapshot
                        if (isFirstSnapshot) {
                            isFirstSnapshot = false;
                            resolve(true);
                        }
                        
                    } catch (error) {
                        console.error('Balance snapshot error:', error);
                        if (isFirstSnapshot) {
                            reject(error);
                        }
                    }
                },
                (error) => {
                    console.error('Balance listener error:', error);
                    if (isFirstSnapshot) {
                        reject(error);
                    }
                    
                    // Try to use cached data
                    if (this._config.enableOfflineCache) {
                        this._loadCachedData();
                    }
                }
            );
            
            // Timeout for initialization
            setTimeout(() => {
                if (isFirstSnapshot) {
                    reject(new Error('BALANCE_LISTENER_TIMEOUT'));
                }
            }, 10000);
        });
    }
    
    async _setupTransactionsListener() {
        if (!this._userId) return false;
        
        if (this._unsubscribeTransactions) {
            this._unsubscribeTransactions();
        }
        
        return new Promise((resolve, reject) => {
            let isFirstSnapshot = true;
            
            this._unsubscribeTransactions = firebaseApp.db.collection('transactions')
                .where('userId', '==', this._userId)
                .orderBy('timestamp', 'desc')
                .limit(this._config.maxTransactionHistory)
                .onSnapshot(
                    async (snapshot) => {
                        try {
                            const transactions = [];
                            snapshot.forEach(doc => {
                                transactions.push({
                                    id: doc.id,
                                    ...doc.data()
                                });
                            });
                            
                            this._notifyTransactionListeners(transactions);
                            
                            // Cache transactions
                            if (this._config.enableOfflineCache && this._db) {
                                await this._cacheTransactions(transactions);
                            }
                            
                            if (isFirstSnapshot) {
                                isFirstSnapshot = false;
                                resolve(true);
                            }
                            
                        } catch (error) {
                            console.error('Transaction snapshot error:', error);
                            if (isFirstSnapshot) {
                                reject(error);
                            }
                        }
                    },
                    (error) => {
                        console.error('Transaction listener error:', error);
                        if (isFirstSnapshot) {
                            reject(error);
                        }
                        
                        // Load cached transactions
                        if (this._config.enableOfflineCache) {
                            this._loadCachedTransactions();
                        }
                    }
                );
            
            // Timeout for initialization
            setTimeout(() => {
                if (isFirstSnapshot) {
                    reject(new Error('TRANSACTIONS_LISTENER_TIMEOUT'));
                }
            }, 10000);
        });
    }
    
    async _createUserWallet() {
        try {
            const user = firebaseApp.auth.currentUser;
            const walletData = {
                userId: this._userId,
                email: user.email,
                username: user.displayName || user.email.split('@')[0],
                balance: 0, // Store as float for Firestore, but we'll convert to cents in code
                balanceCents: 0, // Added for precision
                walletId: `WALLET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                currency: this._config.currency,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                totalDeposits: 0,
                totalWithdrawn: 0,
                totalWon: 0,
                totalLost: 0,
                status: 'active',
                kycStatus: 'pending',
                settings: {
                    lowBalanceAlert: true,
                    transactionNotifications: true
                },
                version: 1
            };
            
            await firebaseApp.db.collection('wallets').doc(this._userId).set(walletData);
            return walletData;
            
        } catch (error) {
            console.error('Error creating wallet:', error);
            throw error;
        }
    }
    
    _setupCrossTabSync() {
        // Setup BroadcastChannel for modern browsers
        if (typeof BroadcastChannel !== 'undefined') {
            this._broadcastChannel = new BroadcastChannel('balance_sync_channel');
            this._broadcastChannel.onmessage = (event) => {
                this._handleBroadcastMessage(event.data);
            };
        }
        
        // Setup localStorage for cross-tab communication (fallback)
        this._storageListener = (e) => {
            if (e.key === 'balance_sync_update' && this._userId) {
                this._handleStorageMessage(e.newValue);
            }
        };
        window.addEventListener('storage', this._storageListener);
    }
    
    _handleBroadcastMessage(data) {
        if (data.type === 'balance_update' && data.userId === this._userId) {
            // Only accept updates that are newer than our current state
            if (data.timestamp > this._lastBalanceUpdate) {
                this._currentBalance = data.balance;
                this._lastBalanceUpdate = data.timestamp;
                this._notifyBalanceListeners();
                this._checkLowBalance();
            }
        }
    }
    
    _handleStorageMessage(newValue) {
        try {
            const data = JSON.parse(newValue);
            if (data.userId === this._userId && data.timestamp > this._lastBalanceUpdate) {
                this._currentBalance = data.balance;
                this._lastBalanceUpdate = data.timestamp;
                this._notifyBalanceListeners();
                this._checkLowBalance();
            }
        } catch (error) {
            console.error('Storage message error:', error);
        }
    }
    
    async _setupIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('BalanceSyncDB', 2);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create or upgrade balance store
                if (!db.objectStoreNames.contains('balance')) {
                    const balanceStore = db.createObjectStore('balance', { keyPath: 'userId' });
                    balanceStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // Create or upgrade transactions store
                if (!db.objectStoreNames.contains('transactions')) {
                    const transactionStore = db.createObjectStore('transactions', { keyPath: 'id' });
                    transactionStore.createIndex('userId', 'userId', { unique: false });
                    transactionStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // Add version field for migrations
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
            };
            
            request.onsuccess = (event) => {
                this._db = event.target.result;
                
                // Set up error handling for IDB
                this._db.onerror = (event) => {
                    console.error('IndexedDB error:', event.target.error);
                    this._handleError('INDEXED_DB_ERROR', event.target.error);
                };
                
                // Store schema version
                this._storeMetadata('schema_version', 2);
                resolve();
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }
    
    async _storeMetadata(key, value) {
        if (!this._db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this._db.transaction(['metadata'], 'readwrite');
            const store = transaction.objectStore('metadata');
            const request = store.put({ key, value, updatedAt: Date.now() });
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    async _cacheBalance() {
        if (!this._db || !this._userId) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this._db.transaction(['balance'], 'readwrite');
            const store = transaction.objectStore('balance');
            
            const data = {
                userId: this._userId,
                balance: this._currentBalance,
                balanceCents: Math.round(this._currentBalance * 100),
                timestamp: this._lastBalanceUpdate,
                cachedAt: Date.now()
            };
            
            const request = store.put(data);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    async _loadCachedData() {
        await Promise.all([
            this._loadCachedBalance(),
            this._loadCachedTransactions()
        ]);
    }
    
    async _loadCachedBalance() {
        if (!this._db || !this._userId) return;
        
        return new Promise((resolve) => {
            const transaction = this._db.transaction(['balance'], 'readonly');
            const store = transaction.objectStore('balance');
            const request = store.get(this._userId);
            
            request.onsuccess = (event) => {
                const data = event.target.result;
                if (data) {
                    // Only use cache if less than 5 minutes old
                    const cacheAge = Date.now() - data.cachedAt;
                    if (cacheAge < 5 * 60 * 1000) {
                        this._currentBalance = data.balance;
                        this._lastBalanceUpdate = data.timestamp;
                        this._notifyBalanceListeners();
                    }
                }
                resolve();
            };
            
            request.onerror = () => resolve();
        });
    }
    
    async _cacheTransactions(transactions) {
        if (!this._db || !this._userId) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this._db.transaction(['transactions'], 'readwrite');
            const store = transaction.objectStore('transactions');
            
            // Clear old transactions for this user
            const index = store.index('userId');
            const clearRequest = index.openCursor(IDBKeyRange.only(this._userId));
            
            clearRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    // All old transactions cleared, now add new ones
                    const operations = transactions.map(tx => {
                        return new Promise((innerResolve, innerReject) => {
                            const txWithCache = {
                                ...tx,
                                cachedAt: Date.now()
                            };
                            const request = store.put(txWithCache);
                            request.onsuccess = () => innerResolve();
                            request.onerror = () => innerReject(request.error);
                        });
                    });
                    
                    Promise.all(operations).then(resolve).catch(reject);
                }
            };
            
            clearRequest.onerror = () => reject(clearRequest.error);
        });
    }
    
    async _loadCachedTransactions() {
        if (!this._db || !this._userId) return;
        
        return new Promise((resolve) => {
            const transaction = this._db.transaction(['transactions'], 'readonly');
            const store = transaction.objectStore('transactions');
            const index = store.index('userId');
            const request = index.getAll(IDBKeyRange.only(this._userId));
            
            request.onsuccess = (event) => {
                const transactions = event.target.result
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, this._config.maxTransactionHistory);
                
                this._notifyTransactionListeners(transactions);
                resolve();
            };
            
            request.onerror = () => resolve();
        });
    }
    
    _debounceBalanceUpdate() {
        clearTimeout(this._balanceUpdateDebounce);
        this._balanceUpdateDebounce = setTimeout(() => {
            this._notifyBalanceListeners();
            this._checkLowBalance();
            this._broadcastBalanceUpdate();
        }, this._config.balanceUpdateDebounceMs);
    }
    
    _broadcastBalanceUpdate() {
        const updateData = {
            type: 'balance_update',
            userId: this._userId,
            balance: this._currentBalance,
            timestamp: this._lastBalanceUpdate
        };
        
        // BroadcastChannel for modern browsers
        if (this._broadcastChannel) {
            this._broadcastChannel.postMessage(updateData);
        }
        
        // localStorage for cross-tab (fallback)
        localStorage.setItem('balance_sync_update', JSON.stringify(updateData));
    }
    
    _notifyBalanceListeners() {
        const balance = this._currentBalance;
        for (const callback of this._balanceListeners) {
            try {
                callback(balance);
            } catch (error) {
                console.error('Balance listener error:', error);
            }
        }
    }
    
    _notifyTransactionListeners(transactions) {
        for (const callback of this._transactionListeners) {
            try {
                callback(transactions);
            } catch (error) {
                console.error('Transaction listener error:', error);
            }
        }
    }
    
    _notifyLowBalanceListeners(balance) {
        for (const listener of this._lowBalanceListeners) {
            try {
                listener.callback(balance);
            } catch (error) {
                console.error('Low balance listener error:', error);
            }
        }
    }
    
    _notifyAuthStateChange(isAuthenticated) {
        for (const callback of this._authListeners) {
            try {
                callback(isAuthenticated, this._userId);
            } catch (error) {
                console.error('Auth state listener error:', error);
            }
        }
    }
    
    _notifyBalanceChange(previousBalance, newBalance) {
        // Dispatch custom event for external consumers
        const event = new CustomEvent('balance_changed', {
            detail: {
                previousBalance,
                newBalance,
                userId: this._userId,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    }
    
    _checkLowBalance() {
        const balanceInCents = Math.round(this._currentBalance * 100);
        const thresholdInCents = this._config.lowBalanceThreshold;
        const isLowNow = balanceInCents < thresholdInCents;
        
        // Only notify when state changes from not-low to low
        if (isLowNow && !this._wasLowBalance) {
            this._notifyLowBalanceListeners(this._currentBalance);
        }
        
        this._wasLowBalance = isLowNow;
    }
    
    _handleError(errorCode, error) {
        console.error(`BalanceSync Error [${errorCode}]:`, error);
        
        // Dispatch error event
        this._dispatchEvent('error', {
            code: errorCode,
            message: error.message,
            userId: this._userId,
            timestamp: Date.now()
        });
        
        // Notify error listeners
        for (const callback of this._errorListeners) {
            try {
                callback(errorCode, error);
            } catch (listenerError) {
                console.error('Error listener error:', listenerError);
            }
        }
    }
    
    _dispatchEvent(eventName, detail) {
        const event = new CustomEvent(`balance_sync:${eventName}`, { detail });
        window.dispatchEvent(event);
    }
    
    async _processPendingTransactions() {
        if (!this._userId) return;
        
        // Process any pending transactions from offline mode
        const pendingKey = `pending_transactions_${this._userId}`;
        try {
            const pending = localStorage.getItem(pendingKey);
            if (pending) {
                const transactions = JSON.parse(pending);
                for (const tx of transactions) {
                    await this._syncPendingTransaction(tx);
                }
                localStorage.removeItem(pendingKey);
            }
        } catch (error) {
            console.error('Error processing pending transactions:', error);
        }
    }
    
    async _syncPendingTransaction(transaction) {
        // This would call a Cloud Function to sync offline transactions
        // For now, just log them
        console.log('Processing pending transaction:', transaction);
    }
    
    async _cleanup() {
        // Clear timers
        clearTimeout(this._balanceUpdateDebounce);
        this._balanceUpdateDebounce = null;
        
        // Unsubscribe from Firebase
        if (this._unsubscribeBalance) {
            this._unsubscribeBalance();
            this._unsubscribeBalance = null;
        }
        
        if (this._unsubscribeTransactions) {
            this._unsubscribeTransactions();
            this._unsubscribeTransactions = null;
        }
        
        // Close BroadcastChannel
        if (this._broadcastChannel) {
            this._broadcastChannel.close();
            this._broadcastChannel = null;
        }
        
        // Remove storage event listener
        if (this._storageListener) {
            window.removeEventListener('storage', this._storageListener);
            this._storageListener = null;
        }
        
        // Clear IndexedDB references
        this._db = null;
        
        // Clear pending transactions
        this._pendingTransactions.clear();
    }
    
    // Public API
    onBalanceUpdate(callback, options = { immediate: true }) {
        const wrappedCallback = (balance) => {
            try {
                callback(balance);
            } catch (error) {
                console.error('Balance callback error:', error);
            }
        };
        
        this._balanceListeners.add(wrappedCallback);
        
        if (options.immediate && this._currentBalance !== null) {
            wrappedCallback(this._currentBalance);
        }
        
        return () => this._balanceListeners.delete(wrappedCallback);
    }
    
    onTransactionsUpdate(callback) {
        const wrappedCallback = (transactions) => {
            try {
                callback(transactions);
            } catch (error) {
                console.error('Transactions callback error:', error);
            }
        };
        
        this._transactionListeners.add(wrappedCallback);
        return () => this._transactionListeners.delete(wrappedCallback);
    }
    
    onLowBalance(callback, thresholdInDollars) {
        const threshold = thresholdInDollars ? 
            Math.round(thresholdInDollars * 100) : 
            this._config.lowBalanceThreshold;
        
        const wrappedCallback = (balance) => {
            try {
                callback(balance);
            } catch (error) {
                console.error('Low balance callback error:', error);
            }
        };
        
        const listener = { callback: wrappedCallback, threshold };
        this._lowBalanceListeners.add(listener);
        
        // Immediate check
        if (Math.round(this._currentBalance * 100) < threshold) {
            wrappedCallback(this._currentBalance);
        }
        
        return () => this._lowBalanceListeners.delete(listener);
    }
    
    onAuthStateChange(callback) {
        const wrappedCallback = (isAuthenticated, userId) => {
            try {
                callback(isAuthenticated, userId);
            } catch (error) {
                console.error('Auth state callback error:', error);
            }
        };
        
        this._authListeners.add(wrappedCallback);
        return () => this._authListeners.delete(wrappedCallback);
    }
    
    onError(callback) {
        const wrappedCallback = (errorCode, error) => {
            try {
                callback(errorCode, error);
            } catch (listenerError) {
                console.error('Error callback error:', listenerError);
            }
        };
        
        this._errorListeners.add(wrappedCallback);
        return () => this._errorListeners.delete(wrappedCallback);
    }
    
    getCurrentBalance() {
        return this._currentBalance;
    }
    
    getBalanceInfo() {
        const balanceInCents = Math.round(this._currentBalance * 100);
        const thresholdInCents = this._config.lowBalanceThreshold;
        
        return {
            balance: this._currentBalance,
            balanceCents: balanceInCents,
            formatted: this.formatBalance(this._currentBalance),
            formattedShort: this.formatBalanceShort(this._currentBalance),
            isLow: balanceInCents < thresholdInCents,
            threshold: thresholdInCents / 100,
            thresholdCents: thresholdInCents,
            userId: this._userId,
            currency: this._config.currency,
            lastUpdated: this._lastBalanceUpdate,
            isInitialized: this._isInitialized
        };
    }
    
    formatBalance(balance, options = {}) {
        const config = {
            style: 'currency',
            currency: options.currency || this._config.currency,
            minimumFractionDigits: options.minimumFractionDigits ?? 2,
            maximumFractionDigits: options.maximumFractionDigits ?? 2,
            ...options
        };
        
        // Ensure we're working with a number
        const numericBalance = typeof balance === 'number' ? balance : parseFloat(balance) || 0;
        return new Intl.NumberFormat('en-US', config).format(numericBalance);
    }
    
    formatBalanceShort(balance) {
        const numericBalance = typeof balance === 'number' ? balance : parseFloat(balance) || 0;
        
        if (numericBalance >= 1000000) {
            return `$${(numericBalance / 1000000).toFixed(1)}M`;
        } else if (numericBalance >= 1000) {
            return `$${(numericBalance / 1000).toFixed(1)}K`;
        } else {
            return this.formatBalance(numericBalance);
        }
    }
    
    async refresh() {
        if (!this._userId) return false;
        
        try {
            const walletDoc = await firebaseApp.db.collection('wallets').doc(this._userId).get();
            if (walletDoc.exists) {
                const data = walletDoc.data();
                this._currentBalance = data.balance || 0;
                this._lastBalanceUpdate = Date.now();
                this._notifyBalanceListeners();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Refresh failed:', error);
            return false;
        }
    }
    
    async executeTransaction(type, amount, metadata = {}) {
        // This is a CLIENT-SIDE ONLY method for user-initiated transactions
        // All admin functionality must be moved to Cloud Functions
        
        if (!this._userId) {
            throw new Error('USER_NOT_AUTHENTICATED');
        }
        
        // Convert amount to cents for precision
        const amountInCents = Math.round(amount * 100);
        if (amountInCents <= 0) {
            throw new Error('INVALID_AMOUNT');
        }
        
        // For withdrawals, check balance
        if (type === 'withdrawal') {
            const currentBalanceInCents = Math.round(this._currentBalance * 100);
            if (currentBalanceInCents < amountInCents) {
                throw new Error('INSUFFICIENT_FUNDS');
            }
        }
        
        // Call Cloud Function for the actual transaction
        try {
            const transactionFunction = firebaseApp.functions.httpsCallable('executeTransaction');
            const result = await transactionFunction({
                type,
                amount: amountInCents / 100, // Send as dollars for API
                amountCents: amountInCents,
                metadata,
                timestamp: Date.now()
            });
            
            return result.data;
            
        } catch (error) {
            console.error('Transaction failed:', error);
            
            // Store pending transaction for offline retry
            if (error.code === 'unavailable' || navigator.onLine === false) {
                this._storePendingTransaction(type, amountInCents, metadata);
            }
            
            throw error;
        }
    }
    
    _storePendingTransaction(type, amountInCents, metadata) {
        if (!this._userId) return;
        
        const pendingKey = `pending_transactions_${this._userId}`;
        const transaction = {
            id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type,
            amountCents: amountInCents,
            metadata,
            timestamp: Date.now(),
            status: 'pending'
        };
        
        try {
            let pending = [];
            const existing = localStorage.getItem(pendingKey);
            if (existing) {
                pending = JSON.parse(existing);
            }
            
            pending.push(transaction);
            localStorage.setItem(pendingKey, JSON.stringify(pending));
            
        } catch (error) {
            console.error('Failed to store pending transaction:', error);
        }
    }
    
    // Admin functionality - CLIENT WRAPPER ONLY
    async adminTransferToUser(targetUserId, amount, reason = 'admin_transfer', notes = '') {
        // This is just a wrapper that calls a Cloud Function
        // ALL business logic must be in the Cloud Function
        
        if (!this._userId) {
            throw new Error('ADMIN_NOT_AUTHENTICATED');
        }
        
        try {
            const adminFunction = firebaseApp.functions.httpsCallable('adminTransferToUser');
            const result = await adminFunction({
                targetUserId,
                amount: Math.round(amount * 100) / 100, // Ensure 2 decimal places
                reason,
                notes,
                adminId: this._userId,
                timestamp: Date.now()
            });
            
            return result.data;
            
        } catch (error) {
            console.error('Admin transfer failed:', error);
            throw error;
        }
    }
    
    async cleanup() {
        await this._cleanup();
    }
    
    // Static methods
    static getInstance() {
        if (!window.__balanceSyncInstance) {
            window.__balanceSyncInstance = new BalanceSync();
        }
        return window.__balanceSyncInstance;
    }
    
    static destroyInstance() {
        if (window.__balanceSyncInstance) {
            window.__balanceSyncInstance.cleanup();
            window.__balanceSyncInstance = null;
        }
    }
}

// Initialize singleton with proper error handling
if (!window.balanceSync) {
    try {
        window.balanceSync = BalanceSync.getInstance();
        
        // Export for module systems
        if (typeof module !== 'undefined' && module.exports) {
            module.exports = {
                BalanceSync,
                getInstance: () => window.balanceSync
            };
        }
    } catch (error) {
        console.error('Failed to initialize BalanceSync:', error);
        // Create a dummy instance that throws errors on use
        window.balanceSync = {
            onBalanceUpdate: () => { throw new Error('BalanceSync not initialized'); },
            onError: (callback) => callback('INIT_FAILED', error),
            getCurrentBalance: () => 0,
            formatBalance: (balance) => `$${balance?.toFixed(2) || '0.00'}`
        };
    }
}
