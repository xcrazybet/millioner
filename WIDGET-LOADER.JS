// ============================================
// FOOTBALL WIDGET LOADER
// Simple one-line embed for clients
// ============================================

(function() {
  'use strict';
  
  // Configuration
  const CONFIG = {
    SDK_URL: 'https://xcrazybet.github.io/millioner/client-sdk-enhanced.js',
    DEFAULT_THEME: 'dark',
    DEFAULT_TYPE: 'predictions',
    DEFAULT_LIMIT: 5
  };
  
  // Find all widget containers
  const widgetContainers = document.querySelectorAll('[data-football-widget], #football-widget');
  
  if (widgetContainers.length === 0) {
    console.warn('No football widget containers found');
    return;
  }
  
  // Load SDK
  const script = document.createElement('script');
  script.src = CONFIG.SDK_URL;
  
  script.onload = function() {
    // Initialize widgets
    widgetContainers.forEach(container => {
      const options = {
        type: container.dataset.type || CONFIG.DEFAULT_TYPE,
        theme: container.dataset.theme || CONFIG.DEFAULT_THEME,
        league: container.dataset.league || null,
        limit: parseInt(container.dataset.limit) || CONFIG.DEFAULT_LIMIT,
        autoRefresh: container.dataset.autorefresh !== 'false',
        showHeader: container.dataset.showheader !== 'false'
      };
      
      // Initialize widget
      if (window.FootballDataHub) {
        window.FootballDataHub.embedWidget(container, options);
      } else {
        console.error('FootballDataHub SDK not loaded');
      }
    });
  };
  
  script.onerror = function() {
    console.error('Failed to load Football Data Hub SDK');
    widgetContainers.forEach(container => {
      container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #666;">
          <div>⚽</div>
          <div>Football widget failed to load</div>
          <small>Please check your internet connection</small>
        </div>
      `;
    });
  };
  
  // Add to document
  document.head.appendChild(script);
  
  // Add loading state
  widgetContainers.forEach(container => {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: #666;">
        <div style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; margin: 0 auto 15px; animation: spin 1s linear infinite;"></div>
        <div>Loading football data...</div>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
  });
  
  // Log initialization
  console.log('⚽ Football Widget Loader initialized');
})();
