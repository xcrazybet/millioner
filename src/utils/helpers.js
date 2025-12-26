// Format currency
export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

// Format date
export const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Validate email
export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Validate wallet address (basic)
export const validateWalletAddress = (address) => {
  return address && address.length >= 26 && address.length <= 64;
};

// Generate random ID
export const generateId = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Debounce function
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Copy to clipboard
export const copyToClipboard = (text) => {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  } else {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    return new Promise((res, rej) => {
      document.execCommand('copy') ? res() : rej();
      textArea.remove();
    });
  }
};

// Show notification
export const showNotification = (message, type = 'info', duration = 3000) => {
  // Remove existing notification
  const existing = document.querySelector('.custom-notification');
  if (existing) existing.remove();
  
  // Create new notification
  const notification = document.createElement('div');
  notification.className = `custom-notification ${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      ${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'} 
      ${message}
    </div>
  `;
  
  // Add styles
  const styles = `
    .custom-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 8px;
      color: white;
      z-index: 9999;
      animation: slideIn 0.3s ease;
      font-family: Arial, sans-serif;
      max-width: 400px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .custom-notification.success { background: #10b981; }
    .custom-notification.error { background: #ef4444; }
    .custom-notification.info { background: #3b82f6; }
    .custom-notification .notification-content {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
  
  document.body.appendChild(notification);
  
  // Auto remove after duration
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    notification.style.transform = 'translateX(100%)';
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      if (styleSheet.parentNode) {
        styleSheet.parentNode.removeChild(styleSheet);
      }
    }, 300);
  }, duration);
};

// Get query parameter
export const getQueryParam = (param) => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
};

// Set query parameter
export const setQueryParam = (param, value) => {
  const url = new URL(window.location);
  url.searchParams.set(param, value);
  window.history.pushState({}, '', url);
};

// Remove query parameter
export const removeQueryParam = (param) => {
  const url = new URL(window.location);
  url.searchParams.delete(param);
  window.history.pushState({}, '', url);
};

// Load script dynamically
export const loadScript = (src, callback) => {
  const script = document.createElement('script');
  script.src = src;
  script.onload = () => callback && callback();
  script.onerror = () => console.error(`Failed to load script: ${src}`);
  document.head.appendChild(script);
};
