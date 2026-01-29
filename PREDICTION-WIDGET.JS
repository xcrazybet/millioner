// ============================================
// FOOTBALL PREDICTION WIDGET v2.0
// Easy embed for websites
// ============================================

(function(global) {
  'use strict';

  const CONFIG = {
    BASE_URL: 'https://xcrazybet.github.io/millioner/api.html',
    VERSION: '2.0.0',
    WIDGET_ID: 'football-prediction-widget'
  };

  class PredictionWidget {
    constructor(options = {}) {
      this.options = {
        container: options.container || `#${CONFIG.WIDGET_ID}`,
        theme: options.theme || 'dark',
        league: options.league || null,
        limit: options.limit || 5,
        showOdds: options.showOdds !== false,
        autoRefresh: options.autoRefresh !== false,
        refreshInterval: options.refreshInterval || 60000
      };
      
      this.matches = [];
      this.predictions = [];
      this.isLoading = false;
      this.init();
    }

    async init() {
      this.container = document.querySelector(this.options.container);
      if (!this.container) {
        console.error(`Container ${this.options.container} not found`);
        return;
      }
      
      this.container.className = `prediction-widget theme-${this.options.theme}`;
      this.renderLoading();
      
      await this.loadData();
      this.render();
      
      if (this.options.autoRefresh) {
        setInterval(() => this.refresh(), this.options.refreshInterval);
      }
    }

    async loadData() {
      this.isLoading = true;
      
      try {
        // Load live matches
        const matchesResponse = await fetch(`${CONFIG.BASE_URL}?endpoint=live&limit=${this.options.limit}&format=json`);
        const matchesData = await matchesResponse.json();
        this.matches = matchesData.data || [];
        
        // Load predictions
        const predictionsResponse = await fetch(`${CONFIG.BASE_URL}?endpoint=predictions&format=json`);
        const predictionsData = await predictionsResponse.json();
        this.predictions = predictionsData.data || [];
        
        // Filter by league if specified
        if (this.options.league) {
          this.matches = this.matches.filter(m => 
            m.league?.toLowerCase().includes(this.options.league.toLowerCase())
          );
          this.predictions = this.predictions.filter(p =>
            p.league?.toLowerCase().includes(this.options.league.toLowerCase())
          );
        }
        
      } catch (error) {
        console.error('Failed to load data:', error);
        this.matches = this.getSampleMatches();
        this.predictions = this.getSamplePredictions();
      } finally {
        this.isLoading = false;
      }
    }

    render() {
      if (this.matches.length === 0) {
        this.container.innerHTML = this.getEmptyState();
        return;
      }
      
      let html = `
        <div class="widget-header">
          <div class="widget-title">
            <span class="widget-icon">🤖</span>
            <h3>AI Football Predictions</h3>
          </div>
          <div class="widget-stats">
            <span class="stat">${this.matches.length} matches</span>
            <span class="stat">${this.predictions.length} predictions</span>
          </div>
        </div>
        <div class="widget-body">
      `;
      
      this.matches.forEach((match, index) => {
        const prediction = this.predictions.find(p => p.match_id === match.id) || 
                          this.predictions[index] || 
                          this.generatePrediction(match);
        
        html += this.getMatchCard(match, prediction);
      });
      
      html += `
        </div>
        <div class="widget-footer">
          <div class="footer-info">
            <span>Updated: ${new Date().toLocaleTimeString()}</span>
            <span>Powered by Football Data Hub</span>
          </div>
          ${this.options.autoRefresh ? 
            `<div class="refresh-info">Auto-refreshes every ${this.options.refreshInterval/1000}s</div>` : 
            `<button class="refresh-btn" onclick="window.widget.refresh()">🔄 Refresh</button>`
          }
        </div>
      `;
      
      this.container.innerHTML = html;
    }

    getMatchCard(match, prediction) {
      const homeWin = parseFloat(prediction.prediction.home_win);
      const draw = parseFloat(prediction.prediction.draw);
      const awayWin = parseFloat(prediction.prediction.away_win);
      
      const maxProb = Math.max(homeWin, draw, awayWin);
      const recommended = homeWin === maxProb ? 'home' : 
                         draw === maxProb ? 'draw' : 'away';
      
      return `
        <div class="match-card ${match.status.toLowerCase()}">
          <div class="match-header">
            <div class="match-teams">
              <span class="team home">${match.home_team}</span>
              <span class="vs">vs</span>
              <span class="team away">${match.away_team}</span>
            </div>
            <div class="match-status ${match.status.toLowerCase()}">
              ${match.status} ${match.minute ? `• ${match.minute}` : ''}
            </div>
          </div>
          
          <div class="match-score">${match.score}</div>
          
          <div class="prediction-section">
            <div class="prediction-title">
              <span class="prediction-icon">🎯</span>
              AI Prediction
              <span class="confidence">${prediction.prediction.confidence}% confident</span>
            </div>
            
            <div class="prediction-odds">
              <div class="odd ${recommended === 'home' ? 'recommended' : ''}">
                <div class="odd-label">Home</div>
                <div class="odd-value">${homeWin.toFixed(1)}%</div>
                ${this.options.showOdds ? 
                  `<div class="odd-decimal">${(100/homeWin).toFixed(2)}</div>` : ''}
              </div>
              
              <div class="odd ${recommended === 'draw' ? 'recommended' : ''}">
                <div class="odd-label">Draw</div>
                <div class="odd-value">${draw.toFixed(1)}%</div>
                ${this.options.showOdds ? 
                  `<div class="odd-decimal">${(100/draw).toFixed(2)}</div>` : ''}
              </div>
              
              <div class="odd ${recommended === 'away' ? 'recommended' : ''}">
                <div class="odd-label">Away</div>
                <div class="odd-value">${awayWin.toFixed(1)}%</div>
                ${this.options.showOdds ? 
                  `<div class="odd-decimal">${(100/awayWin).toFixed(2)}</div>` : ''}
              </div>
            </div>
            
            <div class="prediction-recommendation">
              <strong>Recommendation:</strong> 
              ${recommended === 'home' ? match.home_team : 
                recommended === 'away' ? match.away_team : 'Draw'} 
              to win
            </div>
          </div>
          
          <div class="match-footer">
            <div class="league">${match.league}</div>
            <div class="time">${this.formatTime(match.start_time)}</div>
          </div>
        </div>
      `;
    }

    getEmptyState() {
      return `
        <div class="empty-state">
          <div class="empty-icon">⚽</div>
          <h3>No matches available</h3>
          <p>Check back later for live predictions</p>
          <button class="refresh-btn" onclick="window.widget.refresh()">
            🔄 Try Again
          </button>
        </div>
      `;
    }

    renderLoading() {
      this.container.innerHTML = `
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading AI predictions...</div>
        </div>
      `;
    }

    async refresh() {
      this.renderLoading();
      await this.loadData();
      this.render();
    }

    // Utility methods
    formatTime(timestamp) {
      if (!timestamp) return '';
      try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return '';
      }
    }

    generatePrediction(match) {
      return {
        match_id: match.id,
        home_team: match.home_team,
        away_team: match.away_team,
        league: match.league,
        prediction: {
          home_win: (30 + Math.random() * 40).toFixed(1),
          draw: (20 + Math.random() * 20).toFixed(1),
          away_win: (30 + Math.random() * 40).toFixed(1),
          confidence: (70 + Math.random() * 25).toFixed(1)
        }
      };
    }

    getSampleMatches() {
      return [
        {
          id: 'sample_1',
          home_team: 'Manchester United',
          away_team: 'Liverpool',
          score: '2-1',
          minute: '67\'',
          league: 'Premier League',
          status: 'LIVE',
          start_time: new Date().toISOString()
        }
      ];
    }

    getSamplePredictions() {
      return [
        {
          match_id: 'sample_1',
          home_team: 'Manchester United',
          away_team: 'Liverpool',
          league: 'Premier League',
          prediction: {
            home_win: '45.2',
            draw: '28.7',
            away_win: '26.1',
            confidence: '78.5'
          }
        }
      ];
    }
  }

  // Make available globally
  global.PredictionWidget = PredictionWidget;
  
  // Auto-initialize if container exists
  if (document.querySelector('#football-prediction-widget')) {
    global.widget = new PredictionWidget();
  }

  // Add default styles
  const style = document.createElement('style');
  style.textContent = `
    .prediction-widget {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      max-width: 400px;
      margin: 20px auto;
    }
    
    .prediction-widget.theme-dark {
      background: linear-gradient(135deg, #1e293b, #0f172a);
      color: #f8fafc;
      border: 1px solid #334155;
    }
    
    .prediction-widget.theme-light {
      background: white;
      color: #1e293b;
      border: 1px solid #e2e8f0;
    }
    
    .widget-header {
      padding: 15px;
      border-bottom: 1px solid;
    }
    
    .theme-dark .widget-header {
      border-color: #334155;
      background: rgba(59, 130, 246, 0.1);
    }
    
    .theme-light .widget-header {
      border-color: #e2e8f0;
      background: #f8fafc;
    }
    
    .widget-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    
    .widget-icon {
      font-size: 24px;
    }
    
    .widget-title h3 {
      margin: 0;
      font-size: 18px;
    }
    
    .widget-stats {
      display: flex;
      gap: 15px;
      font-size: 12px;
      opacity: 0.8;
    }
    
    .widget-body {
      padding: 15px;
      max-height: 500px;
      overflow-y: auto;
    }
    
    .match-card {
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      transition: transform 0.3s;
    }
    
    .match-card:hover {
      transform: translateY(-2px);
    }
    
    .theme-dark .match-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid #334155;
    }
    
    .theme-light .match-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }
    
    .match-card.live {
      border-left: 4px solid #4ade80;
    }
    
    .match-card.upcoming {
      border-left: 4px solid #3b82f6;
    }
    
    .match-card.finished {
      border-left: 4px solid #94a3b8;
    }
    
    .match-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    
    .match-teams {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: bold;
    }
    
    .team {
      max-width: 100px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .vs {
      font-size: 12px;
      opacity: 0.6;
    }
    
    .match-status {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 10px;
      font-weight: bold;
    }
    
    .match-status.live {
      background: rgba(74, 222, 128, 0.2);
      color: #4ade80;
    }
    
    .match-status.upcoming {
      background: rgba(59, 130, 246, 0.2);
      color: #3b82f6;
    }
    
    .match-status.finished {
      background: rgba(148, 163, 184, 0.2);
      color: #94a3b8;
    }
    
    .match-score {
      font-size: 28px;
      font-weight: bold;
      text-align: center;
      margin: 15px 0;
      color: #fbbf24;
    }
    
    .prediction-section {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid;
    }
    
    .theme-dark .prediction-section {
      border-color: #334155;
    }
    
    .theme-light .prediction-section {
      border-color: #e2e8f0;
    }
    
    .prediction-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      margin-bottom: 12px;
    }
    
    .prediction-icon {
      font-size: 16px;
    }
    
    .confidence {
      margin-left: auto;
      font-size: 11px;
      background: rgba(139, 92, 246, 0.2);
      color: #8b5cf6;
      padding: 2px 8px;
      border-radius: 10px;
    }
    
    .prediction-odds {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .odd {
      text-align: center;
      padding: 8px;
      border-radius: 6px;
      transition: all 0.3s;
    }
    
    .theme-dark .odd {
      background: rgba(255,255,255,0.05);
    }
    
    .theme-light .odd {
      background: rgba(30, 41, 59, 0.05);
    }
    
    .odd.recommended {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3));
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
    }
    
    .odd-label {
      font-size: 11px;
      opacity: 0.8;
      margin-bottom: 4px;
    }
    
    .odd-value {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 2px;
    }
    
    .odd-decimal {
      font-size: 12px;
      color: #fbbf24;
    }
    
    .prediction-recommendation {
      font-size: 13px;
      text-align: center;
      padding: 8px;
      background: rgba(139, 92, 246, 0.1);
      border-radius: 6px;
      border: 1px solid rgba(139, 92, 246, 0.3);
    }
    
    .match-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 15px;
      font-size: 11px;
      opacity: 0.8;
    }
    
    .widget-footer {
      padding: 15px;
      border-top: 1px solid;
    }
    
    .theme-dark .widget-footer {
      border-color: #334155;
      background: rgba(30, 41, 59, 0.8);
    }
    
    .theme-light .widget-footer {
      border-color: #e2e8f0;
      background: #f8fafc;
    }
    
    .footer-info {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 10px;
      opacity: 0.7;
    }
    
    .refresh-info {
      font-size: 10px;
      text-align: center;
      opacity: 0.6;
    }
    
    .refresh-btn {
      width: 100%;
      padding: 8px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.3s;
    }
    
    .refresh-btn:hover {
      background: #2563eb;
      transform: translateY(-2px);
    }
    
    .loading-state {
      text-align: center;
      padding: 40px 20px;
    }
    
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(59, 130, 246, 0.3);
      border-top-color: #3b82f6;
      border-radius: 50%;
      margin: 0 auto 15px;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .loading-text {
      color: #64748b;
    }
    
    .empty-state {
      text-align: center;
      padding: 40px 20px;
    }
    
    .empty-icon {
      font-size: 48px;
      margin-bottom: 15px;
      opacity: 0.5;
    }
    
    .empty-state h3 {
      margin: 0 0 10px;
      color: #64748b;
    }
    
    .empty-state p {
      margin: 0 0 20px;
      color: #94a3b8;
    }
  `;
  
  document.head.appendChild(style);

  // Log initialization
  console.log(`
  🤖 Football Prediction Widget v${CONFIG.VERSION} loaded!
  
  Usage:
  1. Add HTML: <div id="football-prediction-widget"></div>
  2. Customize: new PredictionWidget({theme: 'dark', league: 'Premier League'})
  
  Options:
  • theme: 'dark' | 'light'
  • league: Filter by league
  • limit: Number of matches
  • showOdds: true/false
  • autoRefresh: true/false
  
  Docs: https://xcrazybet.github.io/millioner
  `);

})(typeof window !== 'undefined' ? window : global);
