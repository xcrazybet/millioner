const axios = require('axios');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

class EnhancedFootballCollector {
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
      leagues: new Map(),
      stats: {
        total: 0,
        bySource: {},
        lastUpdated: new Date().toISOString(),
        collectionTime: 0
      }
    };
    
    this.dataEnhancer = new DataEnhancer();
  }

  async fetchAllSources() {
    console.log('🔄 Collecting from all sources...');
    const startTime = Date.now();
    
    const promises = [
      this.fetchWithRetry(() => this.fetchAPIFootball(), 'apiFootball', 3),
      this.fetchWithRetry(() => this.fetchSofaScore(), 'sofascore', 2),
      this.fetchWithRetry(() => this.fetchRapidAPI(), 'rapidapi', 2),
      this.fetchWithRetry(() => this.fetchFootballData(), 'footballData', 2),
      this.fetchWithRetry(() => this.fetchScoreBat(), 'scorebat', 2),
      this.fetchWithRetry(() => this.fetchLiveScore(), 'livescore', 2),
      this.fetchWithRetry(() => this.fetchFlashScore(), 'flashscore', 2)
    ];
    
    const results = await Promise.allSettled(promises);
    
    // Process results
    results.forEach((result, index) => {
      const sourceNames = ['apiFootball', 'sofascore', 'rapidapi', 'footballData', 'scorebat', 'livescore', 'flashscore'];
      const source = sourceNames[index];
      
      if (result.status === 'fulfilled' && result.value && result.value.length > 0) {
        console.log(`✅ ${source}: ${result.value.length} matches`);
        this.results.stats.bySource[source] = {
          success: true,
          count: result.value.length,
          timestamp: new Date().toISOString()
        };
        
        // Categorize matches
        result.value.forEach(match => {
          if (match.status === 'LIVE') {
            this.results.live.push(match);
          } else if (match.status === 'UPCOMING') {
            this.results.upcoming.push(match);
          } else if (match.status === 'FINISHED') {
            this.results.finished.push(match);
          }
          
          // Track leagues
          if (match.league && match.country) {
            const key = `${match.league}_${match.country}`;
            if (!this.results.leagues.has(key)) {
              this.results.leagues.set(key, {
                name: match.league,
                country: match.country,
                match_count: 1
              });
            } else {
              const league = this.results.leagues.get(key);
              league.match_count++;
            }
          }
        });
        
      } else {
        console.log(`❌ ${source}: Failed - ${result.reason?.message || 'Unknown error'}`);
        this.results.stats.bySource[source] = {
          success: false,
          error: result.reason?.message || 'Unknown error',
          count: 0
        };
      }
    });
    
    this.results.stats.collectionTime = Date.now() - startTime;
    return this.processResults();
  }

  async fetchWithRetry(fetchFn, sourceName, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fetchFn();
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        console.log(`⚠️ ${sourceName} attempt ${attempt} failed, retrying...`);
        await this.delay(1000 * attempt);
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchAPIFootball() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const url = `https://v3.football.api-sports.io/fixtures?date=${today}&timezone=UTC`;
      
      const response = await axios.get(url, {
        headers: {
          'x-apisports-key': this.sources.apiFootball
        },
        timeout: 10000
      });
      
      const fixtures = response.data.response || [];
      
      return fixtures.map(fixture => ({
        id: `apif_${fixture.fixture.id}`,
        home_team: fixture.teams.home.name,
        away_team: fixture.teams.away.name,
        home_score: fixture.goals.home?.toString() || '0',
        away_score: fixture.goals.away?.toString() || '0',
        score: `${fixture.goals.home || 0}-${fixture.goals.away || 0}`,
        minute: fixture.fixture.status.elapsed ? `${fixture.fixture.status.elapsed}'` : 
                fixture.fixture.status.short === 'HT' ? 'HT' : 
                fixture.fixture.status.short === 'FT' ? 'FT' : 'NS',
        league: fixture.league.name,
        country: fixture.league.country,
        status: this.mapAPIFootballStatus(fixture.fixture.status.short),
        source: 'api-football',
        timestamp: new Date().toISOString(),
        start_time: fixture.fixture.date,
        venue: fixture.fixture.venue?.name,
        referee: fixture.fixture.referee,
        odds: fixture.odds ? this.extractOdds(fixture.odds) : null
      }));
    } catch (error) {
      console.error('API-Football error:', error.message);
      throw error;
    }
  }

  async fetchSofaScore() {
    try {
      const response = await axios.get('https://api.sofascore.com/api/v1/sport/football/events/live', {
        timeout: 10000
      });
      
      return (response.data.events || []).map(event => ({
        id: `sofascore_${event.id}`,
        home_team: event.homeTeam.name,
        away_team: event.awayTeam.name,
        home_score: event.homeScore.current?.toString() || '0',
        away_score: event.awayScore.current?.toString() || '0',
        score: `${event.homeScore.current || 0}-${event.awayScore.current || 0}`,
        minute: event.status.description || '0\'',
        league: event.tournament.name,
        country: event.tournament.category.name,
        status: event.status.type === 'inprogress' ? 'LIVE' : 
               event.status.type === 'finished' ? 'FINISHED' : 'UPCOMING',
        source: 'sofascore',
        timestamp: new Date().toISOString(),
        start_time: new Date(event.startTimestamp * 1000).toISOString()
      }));
    } catch (error) {
      console.error('SofaScore error:', error.message);
      throw error;
    }
  }

  async fetchRapidAPI() {
    if (!this.sources.rapidapi) {
      throw new Error('RapidAPI key not configured');
    }
    
    try {
      const options = {
        method: 'GET',
        url: 'https://sportapi7.p.rapidapi.com/api/v1/match/live',
        headers: {
          'x-rapidapi-host': 'sportapi7.p.rapidapi.com',
          'x-rapidapi-key': this.sources.rapidapi
        },
        timeout: 10000
      };
      
      const response = await axios.request(options);
      return this.parseRapidAPI(response.data);
    } catch (error) {
      console.error('RapidAPI error:', error.message);
      throw error;
    }
  }

  async fetchFootballData() {
    if (!this.sources.footballData) {
      throw new Error('Football-Data.org key not configured');
    }
    
    try {
      const response = await axios.get('https://api.football-data.org/v4/matches', {
        headers: {
          'X-Auth-Token': this.sources.footballData
        },
        timeout: 10000
      });
      
      return (response.data.matches || []).map(match => ({
        id: `footballdata_${match.id}`,
        home_team: match.homeTeam.name,
        away_team: match.awayTeam.name,
        home_score: match.score.fullTime.home?.toString() || '0',
        away_score: match.score.fullTime.away?.toString() || '0',
        score: `${match.score.fullTime.home || 0}-${match.score.fullTime.away || 0}`,
        minute: match.status === 'IN_PLAY' ? 'LIVE' : 
                match.status === 'FINISHED' ? 'FT' : 'NS',
        league: match.competition.name,
        country: match.area.name,
        status: this.mapFootballDataStatus(match.status),
        source: 'football-data',
        timestamp: new Date().toISOString(),
        start_time: match.utcDate
      }));
    } catch (error) {
      console.error('Football-Data error:', error.message);
      throw error;
    }
  }

  async fetchScoreBat() {
    try {
      const response = await axios.get('https://www.scorebat.com/video-api/v3/', {
        timeout: 10000
      });
      
      return (response.data.response || []).map(match => ({
        id: `scorebat_${match.id}`,
        home_team: match.side1.name,
        away_team: match.side2.name,
        home_score: this.extractScoreFromTitle(match.title, 'home'),
        away_score: this.extractScoreFromTitle(match.title, 'away'),
        score: this.extractScoreFromTitle(match.title, 'both'),
        minute: 'LIVE',
        league: match.competition.name,
        country: match.competition.area.name,
        status: 'LIVE',
        source: 'scorebat',
        timestamp: new Date().toISOString(),
        start_time: new Date().toISOString(),
        has_video: match.videos && match.videos.length > 0
      }));
    } catch (error) {
      console.error('ScoreBat error:', error.message);
      throw error;
    }
  }

  async fetchLiveScore() {
    if (!this.sources.livescore) {
      throw new Error('LiveScore key not configured');
    }
    
    try {
      const response = await axios.get('https://livescore-api.com/api-client/fixtures/live.json', {
        params: {
          key: this.sources.livescore,
          secret: process.env.LIVESCORE_SECRET || 'demo'
        },
        timeout: 10000
      });
      
      return (response.data.data.fixtures || []).map(fixture => ({
        id: `livescore_${fixture.id}`,
        home_team: fixture.home_name,
        away_team: fixture.away_name,
        home_score: fixture.homeGoalCount || '0',
        away_score: fixture.awayGoalCount || '0',
        score: `${fixture.homeGoalCount || 0}-${fixture.awayGoalCount || 0}`,
        minute: fixture.time || 'NS',
        league: fixture.competition.name,
        country: fixture.competition.country,
        status: fixture.status === 'INPLAY' ? 'LIVE' : 
                fixture.status === 'FINISHED' ? 'FINISHED' : 'UPCOMING',
        source: 'livescore',
        timestamp: new Date().toISOString(),
        start_time: fixture.date
      }));
    } catch (error) {
      console.error('LiveScore error:', error.message);
      throw error;
    }
  }

  async fetchFlashScore() {
    try {
      const response = await axios.get('https://d.flashscore.com/x/feed/ss_1_1_', {
        headers: {
          'X-Fsign': 'SW9D1eZo'
        },
        timeout: 10000
      });
      
      // Parse FlashScore data (simplified)
      return this.parseFlashScore(response.data);
    } catch (error) {
      console.error('FlashScore error:', error.message);
      throw error;
    }
  }

  // Helper methods
  mapAPIFootballStatus(status) {
    const statusMap = {
      'NS': 'UPCOMING', '1H': 'LIVE', 'HT': 'LIVE', '2H': 'LIVE',
      'FT': 'FINISHED', 'AET': 'FINISHED', 'PEN': 'FINISHED',
      'PST': 'POSTPONED', 'CANC': 'CANCELLED', 'SUSP': 'SUSPENDED',
      'INT': 'INTERRUPTED', 'ABD': 'ABANDONED'
    };
    return statusMap[status] || 'UNKNOWN';
  }

  mapFootballDataStatus(status) {
    const statusMap = {
      'SCHEDULED': 'UPCOMING',
      'LIVE': 'LIVE',
      'IN_PLAY': 'LIVE',
      'PAUSED': 'LIVE',
      'FINISHED': 'FINISHED',
      'POSTPONED': 'POSTPONED',
      'SUSPENDED': 'SUSPENDED',
      'CANCELLED': 'CANCELLED'
    };
    return statusMap[status] || 'UNKNOWN';
  }

  extractScoreFromTitle(title, type) {
    if (!title) return '0';
    
    const scoreMatch = title.match(/(\d+)\s*[-:]\s*(\d+)/);
    if (scoreMatch) {
      if (type === 'home') return scoreMatch[1];
      if (type === 'away') return scoreMatch[2];
      return `${scoreMatch[1]}-${scoreMatch[2]}`;
    }
    return type === 'both' ? '0-0' : '0';
  }

  extractOdds(oddsData) {
    if (!oddsData || !Array.isArray(oddsData.bookmakers)) {
      return null;
    }
    
    const odds = {};
    oddsData.bookmakers.forEach(bookmaker => {
      bookmaker.bets.forEach(bet => {
        if (bet.name === 'Match Winner') {
          bet.values.forEach(value => {
            odds[value.value.toLowerCase()] = value.odd;
          });
        }
      });
    });
    
    return odds;
  }

  parseRapidAPI(data) {
    // Parse RapidAPI response
    return (data.matches || []).map(match => ({
      id: `rapidapi_${match.id}`,
      home_team: match.home_team?.name,
      away_team: match.away_team?.name,
      home_score: match.home_score?.toString() || '0',
      away_score: match.away_score?.toString() || '0',
      score: `${match.home_score || 0}-${match.away_score || 0}`,
      minute: match.minute || 'NS',
      league: match.league?.name,
      country: match.country?.name,
      status: match.status === 'inplay' ? 'LIVE' : 
              match.status === 'finished' ? 'FINISHED' : 'UPCOMING',
      source: 'rapidapi',
      timestamp: new Date().toISOString(),
      start_time: match.time
    }));
  }

  parseFlashScore(data) {
    // Simplified FlashScore parser
    return []; // Return empty array as placeholder
  }

  processResults() {
    // Combine all matches
    const allMatches = [
      ...this.results.live,
      ...this.results.upcoming,
      ...this.results.finished
    ];
    
    // Deduplicate
    const uniqueMatches = this.deduplicateMatches(allMatches);
    
    // Re-categorize after deduplication
    this.results.live = uniqueMatches.filter(m => m.status === 'LIVE');
    this.results.upcoming = uniqueMatches.filter(m => m.status === 'UPCOMING');
    this.results.finished = uniqueMatches.filter(m => m.status === 'FINISHED');
    
    // Enhance data
    this.results.live = this.dataEnhancer.enhanceMatches(this.results.live);
    this.results.upcoming = this.dataEnhancer.enhanceMatches(this.results.upcoming);
    this.results.finished = this.dataEnhancer.enhanceMatches(this.results.finished);
    
    // Update stats
    this.results.stats.total = uniqueMatches.length;
    this.results.stats.lastUpdated = new Date().toISOString();
    this.results.stats.successSources = Object.values(this.results.stats.bySource)
      .filter(s => s.success).length;
    
    console.log(`📊 Results: ${this.results.live.length} live, ${this.results.upcoming.length} upcoming, ${this.results.finished.length} finished`);
    
    return this.results;
  }

  deduplicateMatches(matches) {
    const seen = new Map();
    const uniqueMatches = [];
    
    matches.forEach(match => {
      const key = `${match.home_team}_${match.away_team}_${match.league}_${match.start_time?.substring(0, 10)}`;
      
      if (!seen.has(key)) {
        seen.set(key, true);
        
        // Prioritize sources
        const sourcePriority = {
          'api-football': 1,
          'sofascore': 2,
          'rapidapi': 3,
          'football-data': 4,
          'scorebat': 5,
          'livescore': 6,
          'flashscore': 7
        };
        
        // If we already have this match from a better source, skip
        let shouldAdd = true;
        uniqueMatches.forEach((existingMatch, index) => {
          const existingKey = `${existingMatch.home_team}_${existingMatch.away_team}_${existingMatch.league}_${existingMatch.start_time?.substring(0, 10)}`;
          if (existingKey === key) {
            const currentPriority = sourcePriority[match.source] || 99;
            const existingPriority = sourcePriority[existingMatch.source] || 99;
            
            if (currentPriority < existingPriority) {
              // Replace with better source
              uniqueMatches[index] = match;
            }
            shouldAdd = false;
          }
        });
        
        if (shouldAdd) {
          uniqueMatches.push(match);
        }
      }
    });
    
    return uniqueMatches;
  }

  async saveToFirebase() {
    try {
      const matchesRef = db.collection('games').doc('current');
      
      const data = {
        live_matches: this.results.live,
        fixtures: [...this.results.upcoming, ...this.results.finished],
        leagues: Array.from(this.results.leagues.values()),
        last_updated: new Date().toISOString(),
        stats: this.results.stats,
        updated_by: 'github_actions_v2',
        version: '2.0.0'
      };
      
      await matchesRef.set(data);
      console.log(`✅ Saved ${this.results.stats.total} matches to Firebase`);
      
      // Also save collection log
      await this.saveCollectionLog();
      
    } catch (error) {
      console.error('Firebase save error:', error);
      throw error;
    }
  }

  async saveCollectionLog() {
    try {
      const logRef = db.collection('collection_logs').doc(Date.now().toString());
      
      const logData = {
        timestamp: new Date().toISOString(),
        stats: this.results.stats,
        sources: this.results.stats.bySource,
        total_matches: this.results.stats.total,
        collection_time_ms: this.results.stats.collectionTime
      };
      
      await logRef.set(logData);
      console.log('📝 Saved collection log');
    } catch (error) {
      console.error('Log save error:', error);
    }
  }

  async saveToJSON() {
    const data = {
      data: {
        live_matches: this.results.live,
        fixtures: [...this.results.upcoming, ...this.results.finished],
        leagues: Array.from(this.results.leagues.values()),
        last_updated: this.results.stats.lastUpdated,
        stats: this.results.stats
      },
      saved_at: new Date().toISOString(),
      extraction_count: await this.getExtractionCount(),
      timestamp: Date.now(),
      environment: 'github_actions_v2',
      version: '2.0.0'
    };
    
    // Save main file
    fs.writeFileSync('matches.json', JSON.stringify(data, null, 2));
    
    // Save backup with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(`backups/matches_${timestamp}.json`, JSON.stringify(data, null, 2));
    
    // Save compressed version
    fs.writeFileSync('matches.min.json', JSON.stringify(data));
    
    console.log(`💾 Saved ${this.results.stats.total} matches to JSON files`);
  }

  async getExtractionCount() {
    try {
      const statsRef = db.collection('collection_stats').doc('current');
      const doc = await statsRef.get();
      
      if (doc.exists) {
        const data = doc.data();
        return (data.total_collections || 0) + 1;
      }
      return 1;
    } catch (error) {
      return 1;
    }
  }

  async saveHealthStatus() {
    const health = {
      status: 'healthy',
      last_run: new Date().toISOString(),
      matches_count: this.results.stats.total,
      live_matches: this.results.live.length,
      upcoming_matches: this.results.upcoming.length,
      finished_matches: this.results.finished.length,
      sources: this.results.stats.bySource,
      collection_time_ms: this.results.stats.collectionTime,
      success_sources: this.results.stats.successSources,
      next_run: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      version: '2.0.0'
    };
    
    fs.writeFileSync('health.json', JSON.stringify(health, null, 2));
    console.log('❤️ Health status saved');
  }

  async cleanupOldBackups() {
    try {
      const backupsDir = 'backups';
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir);
      }
      
      const files = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('matches_') && f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(backupsDir, f),
          time: fs.statSync(path.join(backupsDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
      
      // Keep only last 50 backups
      if (files.length > 50) {
        files.slice(50).forEach(file => {
          fs.unlinkSync(file.path);
          console.log(`🗑️ Deleted old backup: ${file.name}`);
        });
      }
    } catch (error) {
      console.error('Backup cleanup error:', error);
    }
  }
}

class DataEnhancer {
  enhanceMatches(matches) {
    return matches.map(match => ({
      ...match,
      prediction: this.generatePrediction(match),
      key_stats: this.generateKeyStats(match),
      importance: this.calculateImportance(match),
      last_updated: new Date().toISOString()
    }));
  }

  generatePrediction(match) {
    // Simple prediction algorithm
    const homeAdvantage = 0.15;
    const leagueFactor = this.getLeagueFactor(match.league);
    
    let homeWin = 0.35 + homeAdvantage + leagueFactor;
    let draw = 0.30;
    let awayWin = 0.35 - homeAdvantage;
    
    // Adjust based on match status
    if (match.status === 'LIVE') {
      const [homeScore, awayScore] = match.score.split('-').map(Number);
      const goalDiff = homeScore - awayScore;
      
      if (goalDiff > 0) homeWin += 0.2;
      else if (goalDiff < 0) awayWin += 0.2;
    }
    
    // Normalize
    const total = homeWin + draw + awayWin;
    homeWin /= total;
    draw /= total;
    awayWin /= total;
    
    return {
      home_win: (homeWin * 100).toFixed(1),
      draw: (draw * 100).toFixed(1),
      away_win: (awayWin * 100).toFixed(1),
      predicted_score: this.predictScore(homeWin, awayWin),
      confidence: (70 + Math.random() * 20).toFixed(1)
    };
  }

  getLeagueFactor(league) {
    const factors = {
      'Premier League': 0.05,
      'La Liga': 0.04,
      'Serie A': 0.03,
      'Bundesliga': 0.04,
      'Ligue 1': 0.02,
      'UEFA Champions League': 0.06,
      'UEFA Europa League': 0.04,
      'FA Cup': 0.03
    };
    return factors[league] || 0.02;
  }

  predictScore(homeWin, awayWin) {
    const homeGoals = Math.round(homeWin * 2.5);
    const awayGoals = Math.round(awayWin * 1.5);
    return `${homeGoals}-${awayGoals}`;
  }

  generateKeyStats(match) {
    return {
      importance: this.calculateImportance(match),
      excitement: Math.floor(Math.random() * 100),
      goal_expectancy: (Math.random() * 4).toFixed(1),
      competitive: Math.random() > 0.3
    };
  }

  calculateImportance(match) {
    let importance = 50;
    
    // League importance
    if (match.league?.includes('Champions League')) importance += 30;
    else if (match.league?.includes('Premier') || match.league?.includes('La Liga')) importance += 20;
    else if (match.league?.includes('Serie A') || match.league?.includes('Bundesliga')) importance += 15;
    
    // Match status
    if (match.status === 'LIVE') importance += 20;
    if (match.status === 'FINISHED') importance -= 10;
    
    // Derbies/rivalries
    const rivalries = [
      ['Manchester United', 'Liverpool'],
      ['Barcelona', 'Real Madrid'],
      ['AC Milan', 'Inter Milan'],
      ['Celtic', 'Rangers']
    ];
    
    rivalries.forEach(([team1, team2]) => {
      if ((match.home_team?.includes(team1) && match.away_team?.includes(team2)) ||
          (match.home_team?.includes(team2) && match.away_team?.includes(team1))) {
        importance += 25;
      }
    });
    
    return Math.min(100, Math.max(0, importance));
  }
}

// Main execution
(async () => {
  try {
    console.log('🚀 Starting enhanced football data collection...');
    console.log('='.repeat(50));
    
    const collector = new EnhancedFootballCollector();
    
    // Ensure backups directory exists
    if (!fs.existsSync('backups')) {
      fs.mkdirSync('backups');
    }
    
    // Collect data
    await collector.fetchAllSources();
    
    // Save data
    await collector.saveToFirebase();
    await collector.saveToJSON();
    await collector.saveHealthStatus();
    await collector.cleanupOldBackups();
    
    console.log('='.repeat(50));
    console.log('🎉 Collection completed successfully!');
    console.log(`📊 Total matches: ${collector.results.stats.total}`);
    console.log(`⚡ Live matches: ${collector.results.live.length}`);
    console.log(`⏰ Collection time: ${collector.results.stats.collectionTime}ms`);
    console.log('='.repeat(50));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    
    // Save error log
    const errorLog = {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      sources: error.sources || {}
    };
    
    fs.writeFileSync('error.log', JSON.stringify(errorLog, null, 2));
    
    // Try to save partial data
    try {
      const partialData = {
        data: {
          live_matches: [],
          fixtures: [],
          leagues: [],
          last_updated: new Date().toISOString(),
          stats: { total: 0, error: error.message }
        },
        saved_at: new Date().toISOString(),
        error: error.message
      };
      
      fs.writeFileSync('matches.json', JSON.stringify(partialData, null, 2));
      console.log('💾 Saved partial data due to error');
    } catch (saveError) {
      console.error('Failed to save partial data:', saveError);
    }
    
    process.exit(1);
  }
})();
