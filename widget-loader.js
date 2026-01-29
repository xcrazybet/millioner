// ============================================
// SIMPLE WIDGET LOADER - For Non-Technical Clients
// ============================================

(function() {
  'use strict';
  
  // Create widget container if not exists
  if (!document.getElementById('football-widget')) {
    const widget = document.createElement('div');
    widget.id = 'football-widget';
    widget.style.cssText = 'margin: 20px auto; max-width: 400px;';
    document.body.appendChild(widget);
  }
  
  // Load the main SDK
  const script = document.createElement('script');
  script.src = 'https://xcrazybet.github.io/millioner/client-sdk-enhanced.js';
  
  script.onload = function() {
    // Wait for SDK to be ready
    setTimeout(() => {
      if (window.FootballDataHub) {
        window.FootballDataHub.embedWidget('#football-widget', {
          type: 'predictions',
          theme: 'dark',
          limit: 5,
          autoRefresh: true,
          showHeader: true
        });
      }
    }, 1000);
  };
  
  script.onerror = function() {
    document.getElementById('football-widget').innerHTML = `
      <div style="text-align: center; padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626;">
        <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
        <div>Football widget failed to load</div>
        <small>Please check your internet connection</small>
      </div>
    `;
  };
  
  document.head.appendChild(script);
})();
