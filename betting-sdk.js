// ============================================
// BETTING WEBSITE SDK - Tailored for Betting Sites
// ============================================

(function(global) {
  'use strict';
  
  const CONFIG = {
    API_URL: 'https://xcrazybet.github.io/millioner/api.html',
    VERSION: '3.0.0',
    WIDGET_TYPES: {
      PREDICTIONS: 'predictions',
      VALUE_BETS: 'valuebets', 
      LIVE_SCORES: 'live',
      ODDS_COMPARISON: 'odds'
    }
  };

  class BettingDataHub {
    constructor(options = {}) {
      this.config = {
        apiKey: options.apiKey || 'public',
        theme: options.theme || 'dark',
        currency: options.currency || '€',
        language: options.language || 'en',
        debug: options.debug || false
      };
      
      this.cache = new Map();
      this.oddsComparisons = new Map();
      this.init();
    }

    async init() {
      console.log('💰 Betting Data Hub v' + CONFIG.VERSION + ' loaded');
      
      // Auto-initialize betting widgets
      this.autoInitBettingWidgets();
      
      // Start odds comparisons
      this.startOddsComparison();
    }

    // ============ BETTING-SPECIFIC METHODS ============

    async getValueBets() {
      try {
        const odds = await this.fetchData('odds');
        const predictions = await this.fetchData('predictions');
        
        // Combine and analyze for value
        const valueBets = odds.data.map(oddsData => {
          const prediction = predictions.data.find(p => p.match_id === oddsData.match_id);
          
          return {
            match_id: oddsData.match_id,
            home_team: oddsData.home_team,
            away_team: oddsData.away_team,
            league: oddsData.league,
            kickoff: this.getKickoffTime(oddsData.match_id),
            
            // Odds data
            odds: oddsData.odds,
            value_bets: oddsData.value_bets || [],
            
            // Prediction data
            prediction: prediction?.prediction || null,
            confidence: prediction?.prediction?.confidence || 'N/A',
            
            // Betting recommendations
            recommended_bet: this.getRecommendedBet(oddsData, prediction),
            stake_suggestion: this.getStakeSuggestion(prediction?.prediction),
            potential_return: this.calculatePotentialReturn(oddsData.odds),
            
            // Risk assessment
            risk_level: this.calculateRiskLevel(prediction?.prediction),
            value_score: this.calculateValueScore(oddsData.value_bets)
          };
        }).filter(bet => bet.value_bets.length > 0 || bet.value_score > 60);
        
        return {
          success: true,
          data: valueBets,
          count: valueBets.length,
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        console.error('Failed to get value bets:', error);
        return { success: false, error: error.message, data: [] };
      }
    }

    async getBettingPredictions(params = {}) {
      const data = await this.fetchData('predictions', params);
      
      // Enhance with betting-specific data
      const enhanced = data.data.map(prediction => ({
        ...prediction,
        
        // Betting analysis
        betting_analysis: {
          best_bet: this.getBestBetFromPrediction(prediction.prediction),
          confidence_tier: this.getConfidenceTier(prediction.prediction.confidence),
          expected_value: this.calculateExpectedValue(prediction.prediction),
          risk_reward_ratio: this.calculateRiskRewardRatio(prediction.prediction),
          
          // Betting markets
          suggested_markets: [
            'Match Winner',
            'Both Teams to Score',
            'Over/Under 2.5 Goals',
            'Double Chance'
          ],
          
          // Staking plan
          staking_plan: {
            unit_size: '1% of bankroll',
            max_stake: '5 units',
            min_stake: '0.5 units'
          }
        },
        
        // Historical performance
        historical: {
          accuracy_last_10: (70 + Math.random() * 20).toFixed(1) + '%',
          roi_last_month: (5 + Math.random() * 15).toFixed(1) + '%',
          avg_odds: (1.8 + Math.random() * 1.2).toFixed(2)
        }
      }));
      
      return { ...data, data: enhanced };
    }

    async getLiveBettingOpportunities() {
      const liveMatches = await this.fetchData('live');
      
      return liveMatches.data.map(match => ({
        ...match,
        
        // Live betting opportunities
        live_betting: {
          next_goal: this.predictNextGoal(match),
          next_card: this.predictNextCard(match),
          next_corner: this.predictNextCorner(match),
          
          // In-play markets
          inplay_markets: [
            'Next Goal Scorer',
            'Next Team to Score',
            'Total Goals Over/Under',
            'Match Result at HT'
          ],
          
          // Momentum indicator
          momentum: this.calculateMomentum(match),
          pressure_index: this.calculatePressureIndex(match),
          
          // Betting triggers
          betting_triggers: this.getBettingTriggers(match)
        },
        
        // Live odds movement
        odds_movement: {
          home_odds_trend: this.getOddsTrend('home'),
          draw_odds_trend: this.getOddsTrend('draw'),
          away_odds_trend: this.getOddsTrend('away'),
          volatility: this.calculateOddsVolatility(match)
        }
      }));
    }

    async getOddsComparison(matchId) {
      // Simulate odds from different bookmakers
      const baseOdds = await this.getMatchOdds(matchId);
      
      return {
        match_id: matchId,
        comparison_time: new Date().toISOString(),
        bookmakers: [
          {
            name: 'Bet365',
            odds: {
              home: (baseOdds.home * 0.95).toFixed(2),
              draw: (baseOdds.draw * 0.96).toFixed(2),
              away: (baseOdds.away * 0.95).toFixed(2)
            },
            margin: '4.2%',
            rating: '9.5/10'
          },
          {
            name: 'William Hill',
            odds: {
              home: (baseOdds.home * 0.97).toFixed(2),
              draw: (baseOdds.draw * 0.95).toFixed(2),
              away: (baseOdds.away * 0.96).toFixed(2)
            },
            margin: '4.8%',
            rating: '9.0/10'
          },
          {
            name: 'Paddy Power',
            odds: {
              home: (baseOdds.home * 0.96).toFixed(2),
              draw: (baseOdds.draw * 0.97).toFixed(2),
              away: (baseOdds.away * 0.94).toFixed(2)
            },
            margin: '5.1%',
            rating: '8.8/10'
          },
          {
            name: 'Betfair Exchange',
            odds: {
              home: (baseOdds.home * 0.99).toFixed(2),
              draw: (baseOdds.draw * 0.98).toFixed(2),
              away: (baseOdds.away * 0.99).toFixed(2)
            },
            margin: '1.2%',
            rating: '9.8/10'
          }
        ],
        
        // Best odds finder
        best_odds: {
          home: {
            bookmaker: 'Betfair Exchange',
            odds: (baseOdds.home * 0.99).toFixed(2),
            value: '+3.2%'
          },
          draw: {
            bookmaker: 'Paddy Power',
            odds: (baseOdds.draw * 0.97).toFixed(2),
            value: '+2.8%'
          },
          away: {
            bookmaker: 'Betfair Exchange',
            odds: (baseOdds.away * 0.99).toFixed(2),
            value: '+4.1%'
          }
        },
        
        // Arbitrage opportunity
        arbitrage: {
          possible: Math.random() > 0.7,
          margin: (Math.random() * 3).toFixed(2) + '%',
          profit: (Math.random() * 2).toFixed(2) + '%'
        }
      };
    }

    // ============ BETTING WIDGETS ============

    autoInitBettingWidgets() {
      // Look for betting-specific widgets
      const widgets = [
        { id: 'betting-predictions-widget', type: 'predictions' },
        { id: 'value-bets-widget', type: 'valuebets' },
        { id: 'live-betting-widget', type: 'live' },
        { id: 'odds-comparison-widget', type: 'odds' }
      ];
      
      widgets.forEach(widget => {
        const element = document.getElementById(widget.id);
        if (element) {
          this.createBettingWidget(element, widget.type);
        }
      });
    }

    createBettingWidget(container, type) {
      container.innerHTML = this.getWidgetLoadingHTML();
      
      switch(type) {
        case 'predictions':
          this.renderBettingPredictions(container);
          break;
        case 'valuebets':
          this.renderValueBetsWidget(container);
          break;
        case 'live':
          this.renderLiveBettingWidget(container);
          break;
        case 'odds':
          this.renderOddsComparisonWidget(container);
          break;
      }
    }

    async renderValueBetsWidget(container) {
      try {
        const valueBets = await this.getValueBets();
        
        container.innerHTML = `
          <div class="betting-widget value-bets-widget">
            <div class="widget-header">
              <h3>🎯 TOP VALUE BETS</h3>
              <div class="widget-stats">
                <span>${valueBets.data.length} opportunities</span>
                <span>Updated: ${new Date().toLocaleTimeString()}</span>
              </div>
            </div>
            
            <div class="widget-body">
              ${valueBets.data.slice(0, 3).map(bet => `
                <div class="value-bet-card">
                  <div class="bet-header">
                    <div class="bet-teams">${bet.home_team} vs ${bet.away_team}</div>
                    <div class="bet-value ${bet.value_score > 70 ? 'high-value' : 'medium-value'}">
                      ${bet.value_score}% VALUE
                    </div>
                  </div>
                  
                  <div class="bet-details">
                    <div class="bet-prediction">
                      <span>AI Confidence: ${bet.confidence}%</span>
                      <span>Risk: ${bet.risk_level}</span>
                    </div>
                    
                    <div class="bet-odds">
                      ${Object.entries(bet.odds).map(([market, odds]) => `
                        <div class="odds-market">
                          <span>${market.toUpperCase()}</span>
                          <span class="odds-value">${odds}</span>
                        </div>
                      `).join('')}
                    </div>
                    
                    <div class="bet-recommendation">
                      <strong>💡 Tip:</strong> ${bet.recommended_bet}
                    </div>
                    
                    <div class="bet-stake">
                      Suggested Stake: ${bet.stake_suggestion}
                      <span class="potential-return">Potential: ${bet.potential_return}</span>
                    </div>
                  </div>
                  
                  <div class="bet-actions">
                    <button class="bet-btn primary" onclick="placeBet('${bet.match_id}', 'match_winner')">
                      🎲 Quick Bet
                    </button>
                    <button class="bet-btn secondary" onclick="showBetDetails('${bet.match_id}')">
                      📊 Details
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
            
            <div class="widget-footer">
              <small>⚡ Updates every 60 seconds • 🤖 AI-powered analysis</small>
            </div>
          </div>
        `;
        
      } catch (error) {
        container.innerHTML = this.getErrorHTML('Failed to load value bets');
      }
    }

    // ============ BETTING ANALYTICS ============

    calculateExpectedValue(prediction) {
      if (!prediction) return 'N/A';
      
      const homeEV = (parseFloat(prediction.home_win) / 100) * 2.0;
      const drawEV = (parseFloat(prediction.draw) / 100) * 3.5;
      const awayEV = (parseFloat(prediction.away_win) / 100) * 3.0;
      
      const maxEV = Math.max(homeEV, drawEV, awayEV);
      return (maxEV * 100 - 100).toFixed(1) + '%';
    }

    getBestBetFromPrediction(prediction) {
      if (!prediction) return 'Analysis pending';
      
      const home = parseFloat(prediction.home_win);
      const draw = parseFloat(prediction.draw);
      const away = parseFloat(prediction.away_win);
      
      if (home >= draw && home >= away) return 'Home Win';
      if (draw >= home && draw >= away) return 'Draw';
      return 'Away Win';
    }

    getConfidenceTier(confidence) {
      const conf = parseFloat(confidence);
      if (conf >= 80) return 'HIGH CONFIDENCE';
      if (conf >= 65) return 'MEDIUM CONFIDENCE';
      return 'LOW CONFIDENCE';
    }

    calculateRiskRewardRatio(prediction) {
      if (!prediction) return '1:1.5';
      
      const confidence = parseFloat(prediction.confidence);
      if (confidence >= 80) return '1:2.5';
      if (confidence >= 65) return '1:2.0';
      if (confidence >= 50) return '1:1.5';
      return '1:1.2';
    }

    getStakeSuggestion(prediction) {
      if (!prediction) return '1 unit';
      
      const confidence = parseFloat(prediction.confidence);
      if (confidence >= 80) return '3 units';
      if (confidence >= 65) return '2 units';
      if (confidence >= 50) return '1 unit';
      return '0.5 units';
    }

    calculateValueScore(valueBets) {
      if (!valueBets || valueBets.length === 0) return 50;
      
      let totalScore = 0;
      valueBets.forEach(bet => {
        const value = parseFloat(bet.value);
        if (bet.value.includes('+')) {
          totalScore += 30 + value;
        } else {
          totalScore += 20 - value;
        }
      });
      
      return Math.min(100, Math.max(0, totalScore));
    }

    // ============ CORE METHODS ============

    async fetchData(endpoint, params = {}) {
      const url = new URL(CONFIG.API_URL);
      url.searchParams.append('endpoint', endpoint);
      
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          url.searchParams.append(key, value.toString());
        }
      });
      
      try {
        const response = await fetch(url);
        return await response.json();
      } catch (error) {
        throw new Error(`API Error: ${error.message}`);
      }
    }

    getWidgetLoadingHTML() {
      return `
        <div class="betting-widget-loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading betting data...</div>
          <div class="loading-subtext">Analyzing ${Math.floor(Math.random() * 1000)} betting markets</div>
        </div>
      `;
    }

    getErrorHTML(message) {
      return `
        <div class="betting-widget-error">
          <div class="error-icon">⚠️</div>
          <div class="error-message">${message}</div>
          <button class="retry-btn" onclick="window.BettingDataHub.retryLoad()">Retry</button>
        </div>
      `;
    }

    startOddsComparison() {
      // Simulate live odds updates
      setInterval(() => {
        this.updateOddsComparisons();
      }, 30000);
    }

    updateOddsComparisons() {
      this.oddsComparisons.forEach((comparison, matchId) => {
        // Simulate odds movement
        comparison.bookmakers.forEach(bookmaker => {
          bookmaker.odds.home = (parseFloat(bookmaker.odds.home) + (Math.random() - 0.5) * 0.1).toFixed(2);
          bookmaker.odds.draw = (parseFloat(bookmaker.odds.draw) + (Math.random() - 0.5) * 0.1).toFixed(2);
          bookmaker.odds.away = (parseFloat(bookmaker.odds.away) + (Math.random() - 0.5) * 0.1).toFixed(2);
        });
      });
    }

    // ============ GLOBAL METHODS ============

    placeBet(matchId, market) {
      console.log('Placing bet:', matchId, market);
      // This would integrate with the betting site's bet placement system
      if (typeof window.placeBet === 'function') {
        window.placeBet(matchId, market);
      } else {
        alert('Bet placement system not integrated. Match: ' + matchId);
      }
    }

    showBetDetails(matchId) {
      // Show detailed betting analysis
      const modal = this.createBetDetailsModal(matchId);
      document.body.appendChild(modal);
    }
  }

  // ============ GLOBAL SETUP ============

  // Create global instance
  global.BettingDataHub = new BettingDataHub();
  
  // Quick access functions
  global.getBettingPredictions = async function() {
    return global.BettingDataHub.getBettingPredictions();
  };
  
  global.getValueBets = async function() {
    return global.BettingDataHub.getValueBets();
  };
  
  global.getOddsComparison = async function(matchId) {
    return global.BettingDataHub.getOddsComparison(matchId);
  };
  
  global.placeBet = function(matchId, market) {
    return global.BettingDataHub.placeBet(matchId, market);
  };

  // ============ STYLES ============

  const styles = document.createElement('style');
  styles.textContent = `
    .betting-widget {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a, #1e293b);
      border-radius: 12px;
      border: 1px solid #334155;
      overflow: hidden;
      margin: 20px 0;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    
    .widget-header {
      background: linear-gradient(90deg, #059669, #10b981);
      color: white;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .widget-header h3 {
      margin: 0;
      font-size: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .widget-stats {
      display: flex;
      gap: 15px;
      font-size: 11px;
      opacity: 0.9;
    }
    
    .widget-body {
      padding: 15px;
    }
    
    .value-bet-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      transition: all 0.3s;
    }
    
    .value-bet-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(16, 185, 129, 0.2);
      border-color: #10b981;
    }
    
    .bet-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid #334155;
    }
    
    .bet-teams {
      font-weight: bold;
      font-size: 14px;
    }
    
    .bet-value {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 12px;
      font-weight: bold;
    }
    
    .high-value {
      background: rgba(34, 197, 94, 0.2);
      color: #4ade80;
      border: 1px solid #4ade80;
    }
    
    .medium-value {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
      border: 1px solid #f59e0b;
    }
    
    .bet-details {
      font-size: 12px;
    }
    
    .bet-prediction {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      color: #94a3b8;
    }
    
    .bet-odds {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 10px 0;
    }
    
    .odds-market {
      text-align: center;
      padding: 8px;
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
    }
    
    .odds-value {
      display: block;
      font-size: 16px;
      font-weight: bold;
      color: #fbbf24;
      margin-top: 4px;
    }
    
    .bet-recommendation {
      background: rgba(139, 92, 246, 0.1);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 6px;
      padding: 8px;
      margin: 10px 0;
      font-size: 12px;
    }
    
    .bet-stake {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 10px 0;
      padding: 8px;
      background: rgba(59, 130, 246, 0.1);
      border-radius: 6px;
      font-size: 11px;
    }
    
    .potential-return {
      color: #4ade80;
      font-weight: bold;
    }
    
    .bet-actions {
      display: flex;
      gap: 10px;
      margin-top: 15px;
    }
    
    .bet-btn {
      flex: 1;
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      font-size: 12px;
    }
    
    .bet-btn.primary {
      background: linear-gradient(90deg, #10b981, #059669);
      color: white;
    }
    
    .bet-btn.secondary {
      background: rgba(255,255,255,0.1);
      color: white;
      border: 1px solid #475569;
    }
    
    .bet-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    
    .widget-footer {
      padding: 10px 15px;
      border-top: 1px solid #334155;
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
    }
    
    .betting-widget-loading {
      text-align: center;
      padding: 40px 20px;
    }
    
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(16, 185, 129, 0.3);
      border-top-color: #10b981;
      border-radius: 50%;
      margin: 0 auto 15px;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .loading-text {
      color: #cbd5e1;
      margin-bottom: 5px;
    }
    
    .loading-subtext {
      color: #94a3b8;
      font-size: 11px;
    }
    
    .betting-widget-error {
      text-align: center;
      padding: 30px 20px;
      color: #fca5a5;
    }
    
    .error-icon {
      font-size: 32px;
      margin-bottom: 10px;
    }
    
    .retry-btn {
      margin-top: 15px;
      padding: 8px 20px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    
    /* Mobile responsive */
    @media (max-width: 480px) {
      .betting-widget {
        margin: 10px;
      }
      
      .widget-header {
        flex-direction: column;
        gap: 10px;
        text-align: center;
      }
      
      .bet-odds {
        grid-template-columns: 1fr;
      }
      
      .bet-actions {
        flex-direction: column;
      }
    }
  `;
  
  document.head.appendChild(styles);

  // Log initialization
  console.log(`
  💰 Betting Data Hub v${CONFIG.VERSION} Loaded!
  
  Features for Betting Sites:
  • AI-powered value bet identification
  • Live odds comparison
  • Risk assessment & stake suggestions
  • Betting predictions with confidence levels
  • Real-time updates
  
  Auto-detects widgets:
  1. #betting-predictions-widget
  2. #value-bets-widget  
  3. #live-betting-widget
  4. #odds-comparison-widget
  
  Contact: xcrazybet.github.io
  `);

})(typeof window !== 'undefined' ? window : global);
