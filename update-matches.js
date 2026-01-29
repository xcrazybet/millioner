const axios = require('axios');
const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

class MultiSourceFootballCollector {
  constructor() {
    this.sources = {
      rapidapi: process.env.RAPIDAPI_KEY,
      livescore: process.env.LIVESCORE_API_KEY,
      scorebat: process.env.SCOREBAT_TOKEN,
      footballData: process.env.FOOTBALL_DATA_API_KEY,
      flashscore: process.env.FLASHSCORE,
      sofascore: process.env.SOFASCORE,
      apiFootball: process.env.API_FOOTBALL_KEY || '2396236d9d5cd07468ce280da8390ad5'
    };
    
    this.results = {
      live: [],
      upcoming: [],
      finished: [],
      leagues: new Set(),
      stats: {
        total: 0,
        bySource: {},
        lastUpdated: new Date().toISOString()
      }
    };
  }

  async fetchAllSources() {
    const promises = [
      this.fetchRapidAPI().catch(e => this.handleError('rapidapi', e)),
      this.fetchAPIFootball().catch(e => this.handleError('apiFootball', e)),
      this.fetchLiveScore().catch(e => this.handleError('livescore', e)),
      this.fetchFlashScore().catch(e => this.handleError('flashscore', e)),
      this.fetchSofaScore().catch(e => this.handleError('sofascore', e)),
      this.fetchFootballData().catch(e => this.handleError('footballData', e)),
      this.fetchScoreBat().catch(e => this.handleError('scorebat', e))
    ];
    
    await Promise.allSettled(promises);
    return this.processResults();
  }

  async fetchRapidAPI() {
    if (!this.sources.rapidapi) return [];
    
    const options = {
      method: 'GET',
      url: 'https://sportapi7.p.rapidapi.com/api/v1/match/live',
      headers: {
        'x-rapidapi-host': 'sportapi7.p.rapidapi.com',
        'x-rapidapi-key': this.sources.rapidapi
      }
    };
    
    const response = await axios.request(options);
    return this.parseRapidAPI(response.data);
  }

  async fetchAPIFootball() {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://v3.football.api-sports.io/fixtures?date=${today}&timezone=UTC`;
    
    const response = await axios.get('https://api.allorigins.win/get', {
      params: {
        url: encodeURIComponent(url)
      },
      headers: {
        'x-apisports-key': this.sources.apiFootball
      }
    });
    
    const data = JSON.parse(response.data.contents);
    return this.parseAPIFootball(data.response || []);
  }

  async fetchLiveScore() {
    if (!this.sources.livescore) return [];
    
    const response = await axios.get('https://livescore-api.com/api-client/fixtures/live.json', {
      params: {
        key: this.sources.livescore,
        secret: 'your_secret_here' // Need from LiveScore dashboard
      }
    });
    
    return this.parseLiveScore(response.data.data.fixtures || []);
  }

  async fetchFlashScore() {
    // FlashScore mobile API endpoint
    const response = await axios.get('https://d.flashscore.com/x/feed/ss_1_1_', {
      headers: {
        'X-Fsign': 'SW9D1eZo'
      }
    });
    
    return this.parseFlashScore(response.data);
  }

  async fetchSofaScore() {
    const response = await axios.get('https://api.sofascore.com/api/v1/sport/football/events/live');
    return this.parseSofaScore(response.data.events || []);
  }

  async fetchFootballData() {
    if (!this.sources.footballData) return [];
    
    const response = await axios.get('https://api.football-data.org/v4/matches', {
      headers: {
        'X-Auth-Token': this.sources.footballData
      }
    });
    
    return this.parseFootballData(response.data.matches || []);
  }

  async fetchScoreBat() {
    if (!this.sources.scorebat) return [];
    
    const response = await axios.get(`https://www.scorebat.com/video-api/v3/feed/?token=${this.sources.scorebat}`);
    return this.parseScoreBat(response.data.response || []);
  }

  // Parser methods will be implemented next...
  parseRapidAPI(data) { return []; }
  parseAPIFootball(data) { return []; }
  parseLiveScore(data) { return []; }
  parseFlashScore(data) { return []; }
  parseSofaScore(data) { return []; }
  parseFootballData(data) { return []; }
  parseScoreBat(data) { return []; }

  handleError(source, error) {
    console.error(`❌ ${source} failed:`, error.message);
    this.results.stats.bySource[source] = { error: error.message, success: false };
    return [];
  }

  processResults() {
    // Deduplicate, categorize, count
    const allMatches = [...this.results.live, ...this.results.upcoming, ...this.results.finished];
    
    // Remove duplicates by match identifier
    const uniqueMatches = this.deduplicateMatches(allMatches);
    
    // Categorize
    this.results.live = uniqueMatches.filter(m => m.status === 'LIVE');
    this.results.upcoming = uniqueMatches.filter(m => m.status === 'UPCOMING');
    this.results.finished = uniqueMatches.filter(m => m.status === 'FINISHED');
    
    // Update stats
    this.results.stats.total = uniqueMatches.length;
    this.results.stats.bySource = this.calculateSourceStats();
    this.results.stats.lastUpdated = new Date().toISOString();
    
    return this.results;
  }

  deduplicateMatches(matches) {
    const seen = new Map();
    return matches.filter(match => {
      const key = `${match.homeTeam}-${match.awayTeam}-${match.league}-${match.date}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        return true;
      }
      return false;
    });
  }

  calculateSourceStats() {
    // Track which sources contributed matches
    return {};
  }

  async saveToFirebase() {
    const matchesRef = db.collection('games').doc('current');
    
    const data = {
      live_matches: this.results.live,
      upcoming_matches: this.results.upcoming,
      finished_matches: this.results.finished,
      leagues: Array.from(this.results.leagues),
      stats: this.results.stats,
      last_updated: new Date().toISOString(),
      updated_by: 'github_actions'
    };
    
    await matchesRef.set(data);
    console.log(`✅ Saved ${this.results.stats.total} matches to Firebase`);
  }

  async saveToJSON() {
    const data = {
      data: {
        live_matches: this.results.live,
        fixtures: [...this.results.upcoming, ...this.results.finished],
        leagues: Array.from(this.results.leagues),
        last_updated: this.results.stats.lastUpdated,
        stats: this.results.stats
      },
      saved_at: new Date().toISOString(),
      extraction_count: 1,
      timestamp: Date.now(),
      environment: 'github_actions'
    };
    
    fs.writeFileSync('matches.json', JSON.stringify(data, null, 2));
    fs.writeFileSync('football_data.json', JSON.stringify(data, null, 2)); // Backup
    
    console.log(`💾 Saved ${this.results.stats.total} matches to JSON files`);
  }

  async saveHealthStatus() {
    const health = {
      status: 'healthy',
      last_run: new Date().toISOString(),
      matches_count: this.results.stats.total,
      sources: this.results.stats.bySource,
      next_run: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      version: '1.0.0'
    };
    
    fs.writeFileSync('health.json', JSON.stringify(health, null, 2));
  }
}

// Main execution
(async () => {
  try {
    console.log('🚀 Starting multi-source football data collection...');
    
    const collector = new MultiSourceFootballCollector();
    await collector.fetchAllSources();
    await collector.saveToFirebase();
    await collector.saveToJSON();
    await collector.saveHealthStatus();
    
    console.log('🎉 Collection completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    
    // Save error log
    fs.writeFileSync('error.log', JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    process.exit(1);
  }
})();
const axios = require('axios');
const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

class MultiSourceFootballCollector {
  constructor() {
    this.sources = {
      rapidapi: process.env.RAPIDAPI_KEY,
      livescore: process.env.LIVESCORE_API_KEY,
      scorebat: process.env.SCOREBAT_TOKEN,
      footballData: process.env.FOOTBALL_DATA_API_KEY,
      flashscore: process.env.FLASHSCORE,
      sofascore: process.env.SOFASCORE,
      apiFootball: process.env.API_FOOTBALL_KEY || '2396236d9d5cd07468ce280da8390ad5'
    };
    
    this.results = {
      live: [],
      upcoming: [],
      finished: [],
      leagues: new Set(),
      stats: {
        total: 0,
        bySource: {},
        lastUpdated: new Date().toISOString()
      }
    };
  }

  async fetchAllSources() {
    const promises = [
      this.fetchRapidAPI().catch(e => this.handleError('rapidapi', e)),
      this.fetchAPIFootball().catch(e => this.handleError('apiFootball', e)),
      this.fetchLiveScore().catch(e => this.handleError('livescore', e)),
      this.fetchFlashScore().catch(e => this.handleError('flashscore', e)),
      this.fetchSofaScore().catch(e => this.handleError('sofascore', e)),
      this.fetchFootballData().catch(e => this.handleError('footballData', e)),
      this.fetchScoreBat().catch(e => this.handleError('scorebat', e))
    ];
    
    await Promise.allSettled(promises);
    return this.processResults();
  }

  async fetchRapidAPI() {
    if (!this.sources.rapidapi) return [];
    
    const options = {
      method: 'GET',
      url: 'https://sportapi7.p.rapidapi.com/api/v1/match/live',
      headers: {
        'x-rapidapi-host': 'sportapi7.p.rapidapi.com',
        'x-rapidapi-key': this.sources.rapidapi
      }
    };
    
    const response = await axios.request(options);
    return this.parseRapidAPI(response.data);
  }

  async fetchAPIFootball() {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://v3.football.api-sports.io/fixtures?date=${today}&timezone=UTC`;
    
    const response = await axios.get('https://api.allorigins.win/get', {
      params: {
        url: encodeURIComponent(url)
      },
      headers: {
        'x-apisports-key': this.sources.apiFootball
      }
    });
    
    const data = JSON.parse(response.data.contents);
    return this.parseAPIFootball(data.response || []);
  }

  async fetchLiveScore() {
    if (!this.sources.livescore) return [];
    
    const response = await axios.get('https://livescore-api.com/api-client/fixtures/live.json', {
      params: {
        key: this.sources.livescore,
        secret: 'your_secret_here' // Need from LiveScore dashboard
      }
    });
    
    return this.parseLiveScore(response.data.data.fixtures || []);
  }

  async fetchFlashScore() {
    // FlashScore mobile API endpoint
    const response = await axios.get('https://d.flashscore.com/x/feed/ss_1_1_', {
      headers: {
        'X-Fsign': 'SW9D1eZo'
      }
    });
    
    return this.parseFlashScore(response.data);
  }

  async fetchSofaScore() {
    const response = await axios.get('https://api.sofascore.com/api/v1/sport/football/events/live');
    return this.parseSofaScore(response.data.events || []);
  }

  async fetchFootballData() {
    if (!this.sources.footballData) return [];
    
    const response = await axios.get('https://api.football-data.org/v4/matches', {
      headers: {
        'X-Auth-Token': this.sources.footballData
      }
    });
    
    return this.parseFootballData(response.data.matches || []);
  }

  async fetchScoreBat() {
    if (!this.sources.scorebat) return [];
    
    const response = await axios.get(`https://www.scorebat.com/video-api/v3/feed/?token=${this.sources.scorebat}`);
    return this.parseScoreBat(response.data.response || []);
  }

  // Parser methods will be implemented next...
  parseRapidAPI(data) { return []; }
  parseAPIFootball(data) { return []; }
  parseLiveScore(data) { return []; }
  parseFlashScore(data) { return []; }
  parseSofaScore(data) { return []; }
  parseFootballData(data) { return []; }
  parseScoreBat(data) { return []; }

  handleError(source, error) {
    console.error(`❌ ${source} failed:`, error.message);
    this.results.stats.bySource[source] = { error: error.message, success: false };
    return [];
  }

  processResults() {
    // Deduplicate, categorize, count
    const allMatches = [...this.results.live, ...this.results.upcoming, ...this.results.finished];
    
    // Remove duplicates by match identifier
    const uniqueMatches = this.deduplicateMatches(allMatches);
    
    // Categorize
    this.results.live = uniqueMatches.filter(m => m.status === 'LIVE');
    this.results.upcoming = uniqueMatches.filter(m => m.status === 'UPCOMING');
    this.results.finished = uniqueMatches.filter(m => m.status === 'FINISHED');
    
    // Update stats
    this.results.stats.total = uniqueMatches.length;
    this.results.stats.bySource = this.calculateSourceStats();
    this.results.stats.lastUpdated = new Date().toISOString();
    
    return this.results;
  }

  deduplicateMatches(matches) {
    const seen = new Map();
    return matches.filter(match => {
      const key = `${match.homeTeam}-${match.awayTeam}-${match.league}-${match.date}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        return true;
      }
      return false;
    });
  }

  calculateSourceStats() {
    // Track which sources contributed matches
    return {};
  }

  async saveToFirebase() {
    const matchesRef = db.collection('games').doc('current');
    
    const data = {
      live_matches: this.results.live,
      upcoming_matches: this.results.upcoming,
      finished_matches: this.results.finished,
      leagues: Array.from(this.results.leagues),
      stats: this.results.stats,
      last_updated: new Date().toISOString(),
      updated_by: 'github_actions'
    };
    
    await matchesRef.set(data);
    console.log(`✅ Saved ${this.results.stats.total} matches to Firebase`);
  }

  async saveToJSON() {
    const data = {
      data: {
        live_matches: this.results.live,
        fixtures: [...this.results.upcoming, ...this.results.finished],
        leagues: Array.from(this.results.leagues),
        last_updated: this.results.stats.lastUpdated,
        stats: this.results.stats
      },
      saved_at: new Date().toISOString(),
      extraction_count: 1,
      timestamp: Date.now(),
      environment: 'github_actions'
    };
    
    fs.writeFileSync('matches.json', JSON.stringify(data, null, 2));
    fs.writeFileSync('football_data.json', JSON.stringify(data, null, 2)); // Backup
    
    console.log(`💾 Saved ${this.results.stats.total} matches to JSON files`);
  }

  async saveHealthStatus() {
    const health = {
      status: 'healthy',
      last_run: new Date().toISOString(),
      matches_count: this.results.stats.total,
      sources: this.results.stats.bySource,
      next_run: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      version: '1.0.0'
    };
    
    fs.writeFileSync('health.json', JSON.stringify(health, null, 2));
  }
}

// Main execution
(async () => {
  try {
    console.log('🚀 Starting multi-source football data collection...');
    
    const collector = new MultiSourceFootballCollector();
    await collector.fetchAllSources();
    await collector.saveToFirebase();
    await collector.saveToJSON();
    await collector.saveHealthStatus();
    
    console.log('🎉 Collection completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    
    // Save error log
    fs.writeFileSync('error.log', JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    process.exit(1);
  }
})();
