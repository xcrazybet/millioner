// Transfer money to another user
const transferToUser = async (toUserId, amount, note) => {
  try {
    const transferFn = httpsCallable(functions, 'transferToUser');
    const result = await transferFn({ toUserId, amount, note });
    return result.data;
  } catch (error) {
    console.error('Transfer failed:', error.message);
    throw error;
  }
};

// Create deposit request
const createDeposit = async (amount, paymentMethod, reference) => {
  try {
    const depositFn = httpsCallable(functions, 'createDepositRequest');
    const result = await depositFn({ 
      amount, 
      paymentMethod, 
      reference 
    });
    return result.data;
  } catch (error) {
    console.error('Deposit failed:', error.message);
    throw error;
  }
};

// Create withdrawal request
const createWithdrawal = async (amount, walletAddress) => {
  try {
    const withdrawalFn = httpsCallable(functions, 'createWithdrawalRequest');
    const result = await withdrawalFn({ 
      amount, 
      walletAddress 
    });
    return result.data;
  } catch (error) {
    console.error('Withdrawal failed:', error.message);
    throw error;
  }
};

// Admin: Send money to user
const adminSendToUser = async (userId, amount, reason) => {
  try {
    const sendFn = httpsCallable(functions, 'adminSendToUser');
    const result = await sendFn({ userId, amount, reason });
    return result.data;
  } catch (error) {
    console.error('Admin send failed:', error.message);
    throw error;
  }
};
