import { 
  transferToUser, 
  createDepositRequest, 
  createWithdrawalRequest,
  adminSendToUser,
  getUserWallet,
  getTransactions 
} from '../firebase/firebase.service.js';

// Wallet operations
export class WalletService {
  static async getBalance(userId) {
    const result = await getUserWallet(userId);
    if (result.success) {
      return {
        success: true,
        balance: result.data.balance,
        bonusBalance: result.data.bonusBalance || 0,
        currency: result.data.currency || 'USD'
      };
    }
    return result;
  }
  
  static async getTransactionHistory(userId, limit = 20) {
    return await getTransactions(userId, limit);
  }
  
  static async transferMoney(toUserId, amount, note = '') {
    if (!toUserId || !amount) {
      return { success: false, error: 'Recipient and amount are required' };
    }
    
    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }
    
    return await transferToUser(toUserId, parseFloat(amount), note);
  }
}

// Deposit operations
export class DepositService {
  static async requestDeposit(amount, paymentMethod, currency = 'USD', reference = '') {
    if (!amount || !paymentMethod) {
      return { success: false, error: 'Amount and payment method are required' };
    }
    
    const amountNum = parseFloat(amount);
    if (amountNum < 10) {
      return { success: false, error: 'Minimum deposit is $10' };
    }
    
    if (amountNum > 10000) {
      return { success: false, error: 'Maximum deposit is $10,000' };
    }
    
    return await createDepositRequest(amountNum, paymentMethod, currency, reference);
  }
}

// Withdrawal operations
export class WithdrawalService {
  static async requestWithdrawal(amount, walletAddress, network = 'ETH', notes = '') {
    if (!amount || !walletAddress) {
      return { success: false, error: 'Amount and wallet address are required' };
    }
    
    const amountNum = parseFloat(amount);
    if (amountNum < 20) {
      return { success: false, error: 'Minimum withdrawal is $20' };
    }
    
    if (amountNum > 5000) {
      return { success: false, error: 'Maximum withdrawal is $5,000' };
    }
    
    if (walletAddress.length < 26) {
      return { success: false, error: 'Invalid wallet address' };
    }
    
    return await createWithdrawalRequest(amountNum, walletAddress, network, notes);
  }
}

// Admin operations
export class AdminService {
  static async sendToUser(userId, amount, reason = 'Admin adjustment', notes = '') {
    if (!userId || !amount) {
      return { success: false, error: 'User ID and amount are required' };
    }
    
    const amountNum = parseFloat(amount);
    if (amountNum <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }
    
    if (amountNum > 50000) {
      return { success: false, error: 'Maximum amount is $50,000' };
    }
    
    return await adminSendToUser(userId, amountNum, reason, notes);
  }
}

// Export all services
export default {
  WalletService,
  DepositService,
  WithdrawalService,
  AdminService
};
