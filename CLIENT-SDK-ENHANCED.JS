// ============================================
// FOOTBALL DATA HUB CLIENT SDK v3.0
// Complete solution for websites and apps
// ============================================

(function(global) {
  'use strict';

  const SDK_CONFIG = {
    BASE_URL: 'https://xcrazybet.github.io/millioner/api.html',
    VERSION: '3.0.0',
    WIDGET_URL: 'https://xcrazybet.github.io/millioner/widget.html',
    CACHE_DURATION: 30000,
    WEBSOCKET_URL: 'wss://football-data-hub.glitch.me' // Fallback WebSocket
  };

  class FootballDataHubSDK {
    constructor(options = {}) {
      this.config = {
        apiKey: options.apiKey || 'public',
        baseUrl: options.baseUrl || SDK_CONFIG.BASE_URL,
        cacheEnabled: options.cache !== false,
        debug: options.debug || false,
        autoInit: options.autoInit !== false,
        theme: options.theme || 'dark',
        language: options.language || 'en'
      };
      
      this.cache = new Map();
      this.subscriptions = new Map();
      this.websocket = null;
      this.isConnected = false;
      this.requestQueue = [];
      this.metrics = {
        requests: 0,
        cacheHits: 0,
        errors: 0,
        subscriptions: 0
      };
      
      if (this.config.autoInit) {
        this.init();
      }
    }

    async init() {
      this.log('SDK Initializing', `v${SDK_CONFIG.VERSION}`);
      
      // Load translations
      await this.loadTranslations();
      
      // Setup cache cleanup
      setInterval(() => this.cleanupCache(), 60000);
      
      // Setup metrics reporting
      if (this.config.debug) {
        setInterval(() => this.reportMetrics(), 300000);
      }
      
      // Auto-connect WebSocket if enabled
      if (this.config.websocket !== false) {
        this.connectWebSocket();
      }
      
      this.log('SDK Ready');
      this.emit('ready');
    }

    // ============ CORE API METHODS ============

    async getLiveMatches(params = {}) {
      return this.fetchData('live', params);
    }

    async getFixtures(params = {}) {
      return this.fetchData('fixtures', params);
    }

    async getPredictions(params = {}) {
      return this.fetchData('predictions', params);
    }

    async getOdds(params = {}) {
      return this.fetchData('odds', params);
    }

    async getMatchStats(matchId) {
      return this.fetchData('stats', { match_id: matchId });
    }

    async getStandings(league) {
      return this.fetchData('standings', { league });
    }

    async searchMatches(query, params = {}) {
      return this.fetchData('search', { q: query, ...params });
    }

    async getLeagueInfo(leagueName) {
      return this.fetchData('leagues', { league: leagueName });
    }

    // ============ ENHANCED METHODS ============

    async getValueBets() {
      const data = await this.getOdds();
      return data.data.filter(item => 
        item.value_bets && item.value_bets.length > 0
      ).map(item => ({
        match_id: item.match_id,
        home_team: item.home_team,
        away_team: item.away_team,
        league: item.league,
        value_bets: item.value_bets,
        prediction: this.predictions?.find(p => p.match_id === item.match_id)
      }));
    }

    async getMatchDetails(matchId) {
      const [matchData, statsData, oddsData, predictionData] = await Promise.all([
        this.getMatchById(matchId),
        this.getMatchStats(matchId),
        this.getOdds({ match_id: matchId }),
        this.getPredictions({ match_id: matchId })
      ]);
      
      return {
        match: matchData,
        stats: statsData.data?.[0],
        odds: oddsData.data?.[0],
        prediction: predictionData.data?.[0],
        timeline: this.generateTimeline(matchData),
        insights: this.generateInsights(matchData, predictionData.data?.[0])
      };
    }

    async getMatchById(matchId) {
      const allMatches = await this.getLiveMatches({ limit: 1000 });
      return allMatches.data.find(match => match.id === matchId) || null;
    }

    async getTeamMatches(teamName, params = {}) {
      const data = await this.searchMatches(teamName, params);
      const teamMatches = data.data.filter(match => 
        match.home_team.toLowerCase().includes(teamName.toLowerCase()) ||
        match.away_team.toLowerCase().includes(teamName.toLowerCase())
      );
      
      return {
        ...data,
        data: teamMatches,
        team: teamName,
        stats: this.calculateTeamStats(teamName, teamMatches)
      };
    }

    async getLiveScores() {
      const data = await this.getLiveMatches();
      return {
        matches: data.data,
        summary: {
          total: data.data.length,
          byLeague: this.groupByLeague(data.data),
          goals: this.calculateGoals(data.data),
          average_minute: this.calculateAverageMinute(data.data)
        }
      };
    }

    // ============ REAL-TIME FEATURES ============

    subscribeToLiveMatches(callback, options = {}) {
      const subId = 'sub_' + Date.now();
      const config = {
        interval: options.interval || 10000,
        filters: options.filters || {},
        lastData: null
      };
      
      const poll = async () => {
        if (!this.subscriptions.has(subId)) return;
        
        try {
          const data = await this.getLiveMatches(config.filters);
          
          // Only callback if data changed
          if (!config.lastData || JSON.stringify(data.data) !== JSON.stringify(config.lastData)) {
            config.lastData = data.data;
            callback(data);
          }
        } catch (error) {
          callback({ error: error.message, data: [] });
        }
        
        if (this.subscriptions.has(subId)) {
          setTimeout(poll, config.interval);
        }
      };
      
      this.subscriptions.set(subId, { callback, config, type: 'live' });
      this.metrics.subscriptions++;
      
      poll();
      
      return {
        unsubscribe: () => {
          this.subscriptions.delete(subId);
          this.log('Unsubscribed from live matches');
        },
        updateFilters: (newFilters) => {
          const sub = this.subscriptions.get(subId);
          if (sub) sub.config.filters = newFilters;
        },
        id: subId
      };
    }

    subscribeToMatch(matchId, callback, options = {}) {
      const subId = 'match_' + matchId + '_' + Date.now();
      const config = {
        interval: options.interval || 5000,
        lastData: null
      };
      
      const poll = async () => {
        if (!this.subscriptions.has(subId)) return;
        
        try {
          const data = await this.getMatchDetails(matchId);
          
          if (!config.lastData || JSON.stringify(data) !== JSON.stringify(config.lastData)) {
            config.lastData = data;
            callback(data);
          }
        } catch (error) {
          callback({ error: error.message, match: null });
        }
        
        if (this.subscriptions.has(subId)) {
          setTimeout(poll, config.interval);
        }
      };
      
      this.subscriptions.set(subId, { callback, config, type: 'match', matchId });
      poll();
      
      return {
        unsubscribe: () => this.subscriptions.delete(subId),
        id: subId
      };
    }

    // ============ WIDGET SYSTEM ============

    embedWidget(container, options = {}) {
      const widgetId = 'widget_' + Date.now();
      const config = {
        type: options.type || 'predictions',
        theme: options.theme || this.config.theme,
        league: options.league || null,
        limit: options.limit || 5,
        autoRefresh: options.autoRefresh !== false,
        showHeader: options.showHeader !== false
      };
      
      const containerEl = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
      
      if (!containerEl) {
        throw new Error('Container not found');
      }
      
      containerEl.innerHTML = this.createWidgetHTML(widgetId, config);
      this.initializeWidget(widgetId, config);
      
      return {
        update: (newOptions) => this.updateWidget(widgetId, newOptions),
        destroy: () => this.destroyWidget(widgetId),
        refresh: () => this.refreshWidget(widgetId)
      };
    }

    createWidgetHTML(widgetId, config) {
      return `
        <div id="${widgetId}" class="fhd-widget fhd-theme-${config.theme}" data-type="${config.type}">
          ${config.showHeader ? `
            <div class="fhd-widget-header">
              <div class="fhd-widget-title">
                <span class="fhd-widget-icon">⚽</span>
                <h3>${this.getWidgetTitle(config.type)}</h3>
              </div>
              <div class="fhd-widget-controls">
                <button class="fhd-refresh-btn" onclick="window.FootballDataHub.refreshWidget('${widgetId}')">
                  🔄
                </button>
              </div>
            </div>
          ` : ''}
          <div class="fhd-widget-body" id="${widgetId}_body">
            <div class="fhd-loading">
              <div class="fhd-spinner"></div>
              <div>Loading ${config.type}...</div>
            </div>
          </div>
          ${config.autoRefresh ? `
            <div class="fhd-widget-footer">
              <small>Updates every 60 seconds</small>
            </div>
          ` : ''}
        </div>
      `;
    }

    async initializeWidget(widgetId, config) {
      const bodyEl = document.getElementById(widgetId + '_body');
      if (!bodyEl) return;
      
      try {
        let data;
        switch(config.type) {
          case 'predictions':
            data = await this.getPredictions({ limit: config.limit });
            bodyEl.innerHTML = this.renderPredictions(data.data, config);
            break;
          case 'live':
            data = await this.getLiveMatches({ limit: config.limit });
            bodyEl.innerHTML = this.renderLiveMatches(data.data, config);
            break;
          case 'valuebets':
            data = await this.getValueBets();
            bodyEl.innerHTML = this.renderValueBets(data, config);
            break;
          case 'standings':
            data = await this.getStandings(config.league || 'Premier League');
            bodyEl.innerHTML = this.renderStandings(data.data, config);
            break;
          default:
            data = await this.getLiveMatches({ limit: config.limit });
            bodyEl.innerHTML = this.renderLiveMatches(data.data, config);
        }
        
        // Setup auto-refresh if enabled
        if (config.autoRefresh) {
          const intervalId = setInterval(async () => {
            await this.refreshWidget(widgetId);
          }, 60000);
          
          this.widgetIntervals = this.widgetIntervals || new Map();
          this.widgetIntervals.set(widgetId, intervalId);
        }
        
      } catch (error) {
        bodyEl.innerHTML = `
          <div class="fhd-error">
            <div>⚠️ Failed to load widget</div>
            <small>${error.message}</small>
            <button onclick="window.FootballDataHub.refreshWidget('${widgetId}')">
              Retry
            </button>
          </div>
        `;
      }
    }

    // ============ CORE FETCH METHOD ============

    async fetchData(endpoint, params = {}) {
      this.metrics.requests++;
      
      // Check cache
      const cacheKey = this.getCacheKey(endpoint, params);
      const cached = this.cache.get(cacheKey);
      
      if (this.config.cacheEnabled && cached && Date.now() - cached.timestamp < SDK_CONFIG.CACHE_DURATION) {
        this.metrics.cacheHits++;
        this.log(`Cache hit for ${endpoint}`);
        return {
          ...cached.data,
          _cached: true,
          _timestamp: cached.timestamp
        };
      }
      
      try {
        const url = this.buildUrl(endpoint, params);
        const response = await this.fetchWithTimeout(url, 10000);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'API error');
        }
        
        // Cache successful response
        if (this.config.cacheEnabled) {
          this.cache.set(cacheKey, {
            data: data,
            timestamp: Date.now()
          });
        }
        
        return {
          ...data,
          _cached: false,
          _timestamp: Date.now()
        };
        
      } catch (error) {
        this.metrics.errors++;
        this.log(`Fetch error: ${error.message}`);
        
        // Return cached data even if stale
        if (cached) {
          return {
            ...cached.data,
            _cached: true,
            _stale: true,
            _error: error.message
          };
        }
        
        throw error;
      }
    }

    // ============ UTILITY METHODS ============

    async fetchWithTimeout(url, timeout) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    }

    buildUrl(endpoint, params) {
      const url = new URL(this.config.baseUrl);
      url.searchParams.append('endpoint', endpoint);
      
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          url.searchParams.append(key, value.toString());
        }
      });
      
      if (this.config.apiKey && this.config.apiKey !== 'public') {
        url.searchParams.append('api_key', this.config.apiKey);
      }
      
      return url.toString();
    }

    getCacheKey(endpoint, params) {
      return `${endpoint}:${JSON.stringify(params)}`;
    }

    cleanupCache() {
      const now = Date.now();
      let removed = 0;
      
      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > SDK_CONFIG.CACHE_DURATION * 2) {
          this.cache.delete(key);
          removed++;
        }
      }
      
      if (removed > 0 && this.config.debug) {
        this.log(`Cleaned ${removed} expired cache entries`);
      }
    }

    connectWebSocket() {
      try {
        // Try to connect to WebSocket server
        this.websocket = new WebSocket(SDK_CONFIG.WEBSOCKET_URL);
        
        this.websocket.onopen = () => {
          this.isConnected = true;
          this.log('WebSocket connected');
          this.emit('websocket:connected');
          
          // Process queued requests
          this.processRequestQueue();
        };
        
        this.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
          } catch (error) {
            this.log('WebSocket parse error:', error);
          }
        };
        
        this.websocket.onerror = (error) => {
          this.log('WebSocket error:', error);
          this.emit('websocket:error', error);
        };
        
        this.websocket.onclose = () => {
          this.isConnected = false;
          this.log('WebSocket disconnected');
          this.emit('websocket:disconnected');
          
          // Try to reconnect after 5 seconds
          setTimeout(() => this.connectWebSocket(), 5000);
        };
        
      } catch (error) {
        this.log('WebSocket initialization failed:', error);
      }
    }

    handleWebSocketMessage(data) {
      switch(data.type) {
        case 'match_update':
          this.emit('match:update', data.payload);
          break;
        case 'live_scores':
          this.emit('scores:update', data.payload);
          break;
        case 'goal':
          this.emit('goal', data.payload);
          this.showGoalNotification(data.payload);
          break;
        case 'prediction_update':
          this.emit('prediction:update', data.payload);
          break;
      }
    }

    showGoalNotification(goalData) {
      if (Notification.permission === 'granted') {
        new Notification('⚽ GOAL!', {
          body: `${goalData.team} scores! ${goalData.home} - ${goalData.away}`,
          icon: 'https://xcrazybet.github.io/millioner/football-icon.png'
        });
      }
    }

    // ============ RENDER METHODS ============

    renderPredictions(predictions, config) {
      if (!predictions || predictions.length === 0) {
        return this.renderEmptyState('No predictions available');
      }
      
      return `
        <div class="fhd-predictions">
          ${predictions.map(pred => `
            <div class="fhd-prediction-card">
              <div class="fhd-prediction-header">
                <div class="fhd-prediction-teams">
                  ${pred.home_team} vs ${pred.away_team}
                </div>
                <div class="fhd-prediction-confidence">
                  ${pred.prediction?.confidence || '70'}% confident
                </div>
              </div>
              
              <div class="fhd-prediction-odds">
                <div class="fhd-odd ${this.getHighestOdd(pred.prediction) === 'home' ? 'fhd-recommended' : ''}">
                  <div class="fhd-odd-label">Home</div>
                  <div class="fhd-odd-value">${pred.prediction?.home_win || '0'}%</div>
                </div>
                <div class="fhd-odd ${this.getHighestOdd(pred.prediction) === 'draw' ? 'fhd-recommended' : ''}">
                  <div class="fhd-odd-label">Draw</div>
                  <div class="fhd-odd-value">${pred.prediction?.draw || '0'}%</div>
                </div>
                <div class="fhd-odd ${this.getHighestOdd(pred.prediction) === 'away' ? 'fhd-recommended' : ''}">
                  <div class="fhd-odd-label">Away</div>
                  <div class="fhd-odd-value">${pred.prediction?.away_win || '0'}%</div>
                </div>
              </div>
              
              <div class="fhd-prediction-recommendation">
                <strong>AI Tip:</strong> ${this.getRecommendation(pred)}
              </div>
              
              <div class="fhd-prediction-footer">
                <span>${pred.league}</span>
                <button class="fhd-small-btn" onclick="window.FootballDataHub.showMatchDetails('${pred.match_id}')">
                  Details
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    renderLiveMatches(matches, config) {
      if (!matches || matches.length === 0) {
        return this.renderEmptyState('No live matches');
      }
      
      return `
        <div class="fhd-live-matches">
          ${matches.map(match => `
            <div class="fhd-match-card fhd-status-${match.status.toLowerCase()}">
              <div class="fhd-match-header">
                <div class="fhd-match-league">${match.league}</div>
                <div class="fhd-match-status">${match.status} ${match.minute || ''}</div>
              </div>
              
              <div class="fhd-match-teams">
                <div class="fhd-team">
                  <div class="fhd-team-name">${match.home_team}</div>
                  <div class="fhd-team-score">${match.home_score}</div>
                </div>
                <div class="fhd-vs">-</div>
                <div class="fhd-team">
                  <div class="fhd-team-name">${match.away_team}</div>
                  <div class="fhd-team-score">${match.away_score}</div>
                </div>
              </div>
              
              <div class="fhd-match-score">${match.score}</div>
              
              <div class="fhd-match-footer">
                <span>${match.country}</span>
                <span>${this.formatTime(match.start_time)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    renderValueBets(valueBets, config) {
      if (!valueBets || valueBets.length === 0) {
        return this.renderEmptyState('No value bets found');
      }
      
      return `
        <div class="fhd-value-bets">
          ${valueBets.map(bet => `
            <div class="fhd-value-bet-card">
              <div class="fhd-value-bet-header">
                <div class="fhd-value-bet-teams">${bet.home_team} vs ${bet.away_team}</div>
                <div class="fhd-value-bet-flag">🎯 VALUE BET</div>
              </div>
              
              <div class="fhd-value-bet-details">
                ${bet.value_bets.map(vb => `
                  <div class="fhd-value-market">
                    <span>${vb.market.replace('_', ' ').toUpperCase()}</span>
                    <span class="fhd-value-amount ${vb.value.includes('+') ? 'fhd-positive' : 'fhd-negative'}">
                      ${vb.value}
                    </span>
                    <span class="fhd-odds">@${vb.odds}</span>
                  </div>
                `).join('')}
              </div>
              
              <div class="fhd-value-bet-prediction">
                AI Confidence: ${bet.prediction?.prediction?.confidence || '70'}%
              </div>
              
              <div class="fhd-value-bet-actions">
                <button class="fhd-action-btn fhd-bet-btn">💰 Place Bet</button>
                <button class="fhd-action-btn fhd-details-btn" 
                        onclick="window.FootballDataHub.showMatchDetails('${bet.match_id}')">
                  📊 Details
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    renderEmptyState(message) {
      return `
        <div class="fhd-empty-state">
          <div class="fhd-empty-icon">⚽</div>
          <div class="fhd-empty-message">${message}</div>
          <button class="fhd-empty-btn" onclick="window.FootballDataHub.refreshWidget(this.closest('.fhd-widget').id)">
            Refresh
          </button>
        </div>
      `;
    }

    // ============ EVENT SYSTEM ============

    on(event, callback) {
      this._events = this._events || {};
      this._events[event] = this._events[event] || [];
      this._events[event].push(callback);
    }

    off(event, callback) {
      if (!this._events || !this._events[event]) return;
      const index = this._events[event].indexOf(callback);
      if (index > -1) this._events[event].splice(index, 1);
    }

    emit(event, data) {
      if (!this._events || !this._events[event]) return;
      this._events[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          this.log(`Event handler error for ${event}:`, error);
        }
      });
    }

    // ============ PUBLIC API ============

    refreshWidget(widgetId) {
      const widgetEl = document.getElementById(widgetId);
      if (!widgetEl) return;
      
      const bodyEl = document.getElementById(widgetId + '_body');
      const type = widgetEl.dataset.type;
      const config = {
        type: type,
        theme: widgetEl.classList.contains('fhd-theme-dark') ? 'dark' : 'light',
        limit: 5,
        showHeader: !!widgetEl.querySelector('.fhd-widget-header')
      };
      
      bodyEl.innerHTML = `
        <div class="fhd-loading">
          <div class="fhd-spinner"></div>
          <div>Refreshing...</div>
        </div>
      `;
      
      setTimeout(() => this.initializeWidget(widgetId, config), 500);
    }

    showMatchDetails(matchId) {
      this.emit('match:details:request', matchId);
      
      // Create modal with match details
      const modal = document.createElement('div');
      modal.className = 'fhd-modal-overlay';
      modal.innerHTML = `
        <div class="fhd-modal">
          <div class="fhd-modal-header">
            <h3>Match Details</h3>
            <button class="fhd-modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
          </div>
          <div class="fhd-modal-body" id="match_details_${matchId}">
            Loading...
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // Load match details
      this.getMatchDetails(matchId).then(data => {
        const content = document.getElementById(`match_details_${matchId}`);
        content.innerHTML = this.renderMatchDetails(data);
      }).catch(error => {
        const content = document.getElementById(`match_details_${matchId}`);
        content.innerHTML = `<div class="fhd-error">Error loading details: ${error.message}</div>`;
      });
    }

    getMetrics() {
      return {
        ...this.metrics,
        cacheSize: this.cache.size,
        subscriptions: this.subscriptions.size,
        websocket: this.isConnected
      };
    }

    clearCache() {
      this.cache.clear();
      this.log('Cache cleared');
    }

    setApiKey(apiKey) {
      this.config.apiKey = apiKey;
      this.clearCache();
      this.log('API key updated');
    }

    setTheme(theme) {
      this.config.theme = theme;
      this.emit('theme:changed', theme);
    }

    // ============ HELPER METHODS ============

    getHighestOdd(prediction) {
      if (!prediction) return 'draw';
      const home = parseFloat(prediction.home_win);
      const draw = parseFloat(prediction.draw);
      const away = parseFloat(prediction.away_win);
      
      if (home >= draw && home >= away) return 'home';
      if (draw >= home && draw >= away) return 'draw';
      return 'away';
    }

    getRecommendation(prediction) {
      const highest = this.getHighestOdd(prediction.prediction);
      const confidence = prediction.prediction?.confidence || '70';
      
      switch(highest) {
        case 'home':
          return `${prediction.home_team} to win (${confidence}% confidence)`;
        case 'draw':
          return `Draw (${confidence}% confidence)`;
        case 'away':
          return `${prediction.away_team} to win (${confidence}% confidence)`;
      }
    }

    formatTime(timestamp) {
      if (!timestamp) return '';
      try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return '';
      }
    }

    getWidgetTitle(type) {
      const titles = {
        predictions: 'AI Predictions',
        live: 'Live Scores',
        valuebets: 'Value Bets',
        standings: 'League Standings'
      };
      return titles[type] || 'Football Data';
    }

    log(...args) {
      if (this.config.debug) {
        console.log(`[FootballDataHub]`, ...args);
      }
    }

    reportMetrics() {
      const hitRate = this.metrics.requests > 0 
        ? ((this.metrics.cacheHits / this.metrics.requests) * 100).toFixed(1)
        : 0;
      
      this.log(`Metrics: ${this.metrics.requests} req, ${hitRate}% cache hit, ${this.metrics.errors} errors`);
    }
  }

  // ============ GLOBAL SETUP ============

  // Create global instance
  global.FootballDataHub = new FootballDataHubSDK();
  
  // Quick access functions
  global.getFootballData = async function(endpoint = 'live', params = {}) {
    return global.FootballDataHub.fetchData(endpoint, params);
  };

  global.embedFootballWidget = function(container, options = {}) {
    return global.FootballDataHub.embedWidget(container, options);
  };

  global.subscribeToLiveScores = function(callback, options = {}) {
    return global.FootballDataHub.subscribeToLiveMatches(callback, options);
  };

  // Auto-initialize with config if available
  if (global.FootballDataHubConfig) {
    global.FootballDataHub = new FootballDataHubSDK(global.FootballDataHubConfig);
  }

  // ============ STYLES ============

  const styles = document.createElement('style');
  styles.textContent = `
    .fhd-widget {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      max-width: 400px;
      margin: 20px auto;
      transition: all 0.3s;
    }
    
    .fhd-theme-dark {
      background: linear-gradient(135deg, #1e293b, #0f172a);
      color: #f8fafc;
      border: 1px solid #334155;
    }
    
    .fhd-theme-light {
      background: white;
      color: #1e293b;
      border: 1px solid #e2e8f0;
    }
    
    .fhd-widget-header {
      padding: 15px;
      border-bottom: 1px solid;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .fhd-theme-dark .fhd-widget-header {
      border-color: #334155;
      background: rgba(59, 130, 246, 0.1);
    }
    
    .fhd-theme-light .fhd-widget-header {
      border-color: #e2e8f0;
      background: #f8fafc;
    }
    
    .fhd-widget-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .fhd-widget-icon {
      font-size: 24px;
    }
    
    .fhd-widget-title h3 {
      margin: 0;
      font-size: 16px;
    }
    
    .fhd-refresh-btn {
      background: none;
      border: 1px solid;
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.3s;
    }
    
    .fhd-theme-dark .fhd-refresh-btn {
      border-color: #4ade80;
      color: #4ade80;
    }
    
    .fhd-theme-light .fhd-refresh-btn {
      border-color: #10b981;
      color: #10b981;
    }
    
    .fhd-refresh-btn:hover {
      transform: rotate(90deg);
    }
    
    .fhd-widget-body {
      padding: 15px;
      max-height: 500px;
      overflow-y: auto;
    }
    
    .fhd-loading {
      text-align: center;
      padding: 40px 20px;
    }
    
    .fhd-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(59, 130, 246, 0.3);
      border-top-color: #3b82f6;
      border-radius: 50%;
      margin: 0 auto 15px;
      animation: fhd-spin 1s linear infinite;
    }
    
    @keyframes fhd-spin {
      to { transform: rotate(360deg); }
    }
    
    .fhd-prediction-card, .fhd-match-card, .fhd-value-bet-card {
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      transition: transform 0.3s;
    }
    
    .fhd-theme-dark .fhd-prediction-card,
    .fhd-theme-dark .fhd-match-card,
    .fhd-theme-dark .fhd-value-bet-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid #334155;
    }
    
    .fhd-theme-light .fhd-prediction-card,
    .fhd-theme-light .fhd-match-card,
    .fhd-theme-light .fhd-value-bet-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }
    
    .fhd-prediction-card:hover,
    .fhd-match-card:hover,
    .fhd-value-bet-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(0,0,0,0.1);
    }
    
    .fhd-prediction-header,
    .fhd-match-header,
    .fhd-value-bet-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    
    .fhd-prediction-teams,
    .fhd-match-league,
    .fhd-value-bet-teams {
      font-weight: bold;
      font-size: 14px;
    }
    
    .fhd-prediction-confidence,
    .fhd-match-status,
    .fhd-value-bet-flag {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 10px;
      font-weight: bold;
    }
    
    .fhd-prediction-confidence {
      background: rgba(139, 92, 246, 0.2);
      color: #8b5cf6;
    }
    
    .fhd-match-status {
      background: rgba(74, 222, 128, 0.2);
      color: #4ade80;
    }
    
    .fhd-value-bet-flag {
      background: rgba(34, 197, 94, 0.2);
      color: #4ade80;
    }
    
    .fhd-prediction-odds,
    .fhd-match-teams {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin: 15px 0;
    }
    
    .fhd-odd {
      text-align: center;
      padding: 10px;
      border-radius: 6px;
    }
    
    .fhd-theme-dark .fhd-odd {
      background: rgba(255,255,255,0.05);
    }
    
    .fhd-theme-light .fhd-odd {
      background: rgba(30, 41, 59, 0.05);
    }
    
    .fhd-odd.fhd-recommended {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3));
      transform: scale(1.05);
    }
    
    .fhd-odd-label {
      font-size: 11px;
      opacity: 0.8;
      margin-bottom: 4px;
    }
    
    .fhd-odd-value {
      font-size: 16px;
      font-weight: bold;
    }
    
    .fhd-match-teams {
      align-items: center;
    }
    
    .fhd-team {
      text-align: center;
    }
    
    .fhd-team-name {
      font-size: 12px;
      margin-bottom: 5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .fhd-team-score {
      font-size: 20px;
      font-weight: bold;
    }
    
    .fhd-vs {
      font-size: 14px;
      opacity: 0.6;
    }
    
    .fhd-match-score {
      font-size: 24px;
      font-weight: bold;
      text-align: center;
      margin: 10px 0;
      color: #fbbf24;
    }
    
    .fhd-prediction-recommendation,
    .fhd-value-bet-prediction {
      font-size: 13px;
      text-align: center;
      padding: 8px;
      margin: 10px 0;
      border-radius: 6px;
    }
    
    .fhd-theme-dark .fhd-prediction-recommendation,
    .fhd-theme-dark .fhd-value-bet-prediction {
      background: rgba(139, 92, 246, 0.1);
      border: 1px solid rgba(139, 92, 246, 0.3);
    }
    
    .fhd-theme-light .fhd-prediction-recommendation,
    .fhd-theme-light .fhd-value-bet-prediction {
      background: rgba(139, 92, 246, 0.05);
      border: 1px solid rgba(139, 92, 246, 0.1);
    }
    
    .fhd-prediction-footer,
    .fhd-match-footer,
    .fhd-value-bet-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;
      font-size: 11px;
    }
    
    .fhd-small-btn,
    .fhd-action-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }
    
    .fhd-theme-dark .fhd-small-btn,
    .fhd-theme-dark .fhd-action-btn {
      background: #3b82f6;
      color: white;
    }
    
    .fhd-theme-light .fhd-small-btn,
    .fhd-theme-light .fhd-action-btn {
      background: #1d4ed8;
      color: white;
    }
    
    .fhd-small-btn:hover,
    .fhd-action-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
    
    .fhd-value-bet-details {
      margin: 10px 0;
    }
    
    .fhd-value-market {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px;
      margin-bottom: 5px;
      border-radius: 6px;
      font-size: 12px;
    }
    
    .fhd-theme-dark .fhd-value-market {
      background: rgba(255,255,255,0.03);
    }
    
    .fhd-theme-light .fhd-value-market {
      background: rgba(30, 41, 59, 0.03);
    }
    
    .fhd-value-amount {
      font-weight: bold;
    }
    
    .fhd-positive {
      color: #4ade80;
    }
    
    .fhd-negative {
      color: #ef4444;
    }
    
    .fhd-odds {
      color: #fbbf24;
    }
    
    .fhd-value-bet-actions {
      display: flex;
      gap: 10px;
    }
    
    .fhd-bet-btn {
      background: #10b981 !important;
      flex: 2;
    }
    
    .fhd-details-btn {
      background: #8b5cf6 !important;
      flex: 1;
    }
    
    .fhd-empty-state {
      text-align: center;
      padding: 40px 20px;
    }
    
    .fhd-empty-icon {
      font-size: 48px;
      margin-bottom: 15px;
      opacity: 0.5;
    }
    
    .fhd-empty-message {
      margin-bottom: 20px;
      color: #64748b;
    }
    
    .fhd-empty-btn {
      padding: 8px 20px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    
    .fhd-widget-footer {
      padding: 10px 15px;
      border-top: 1px solid;
      text-align: center;
      font-size: 10px;
      opacity: 0.6;
    }
    
    .fhd-theme-dark .fhd-widget-footer {
      border-color: #334155;
    }
    
    .fhd-theme-light .fhd-widget-footer {
      border-color: #e2e8f0;
    }
    
    .fhd-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    }
    
    .fhd-modal {
      background: white;
      border-radius: 12px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow: hidden;
    }
    
    .fhd-modal-header {
      padding: 20px;
      background: #3b82f6;
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .fhd-modal-close {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
    }
    
    .fhd-modal-body {
      padding: 20px;
      overflow-y: auto;
      max-height: 60vh;
    }
    
    .fhd-error {
      text-align: center;
      padding: 20px;
      color: #ef4444;
    }
    
    /* Responsive */
    @media (max-width: 480px) {
      .fhd-widget {
        margin: 10px;
      }
      
      .fhd-prediction-odds,
      .fhd-match-teams {
        grid-template-columns: repeat(3, 1fr);
        gap: 5px;
      }
      
      .fhd-prediction-teams,
      .fhd-match-league {
        font-size: 12px;
      }
    }
  `;
  
  document.head.appendChild(styles);

  // ============ INITIALIZATION MESSAGE ============

  console.log(`
  ⚽ Football Data Hub SDK v${SDK_CONFIG.VERSION} Loaded!
  
  Quick Start:
  1. Get live matches: FootballDataHub.getLiveMatches()
  2. Embed widget: embedFootballWidget('#container', {type: 'predictions'})
  3. Subscribe: FootballDataHub.subscribeToLiveMatches(data => {})
  
  Features:
  • Real-time scores & predictions
  • AI-powered betting tips
  • Value bet identification
  • Live match subscriptions
  • Easy embed widgets
  
  Documentation: https://xcrazybet.github.io/millioner
  `);

})(typeof window !== 'undefined' ? window : global);
