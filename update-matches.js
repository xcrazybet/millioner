const axios = require('axios');
const fs = require('fs');
const path = require('path');

class GitHubFootballCollector {
  constructor() {
    this.sources = {
      apiFootball: '2396236d9d5cd07468ce280da8390ad5'
    };
    
    this.results = {
      live: [],
      upcoming: [],
      finished: [],
      last_updated: new Date().toISOString()
    };
  }

  async collectAllData() {
    console.log('🚀 Collecting football data...');
    
    try {
      // Collect from API-Football (primary)
      const apiFootballData = await this.collectFromAPIFootball();
      this.results.live = apiFootballData.live;
      this.results.upcoming = apiFootballData.upcoming;
      this.results.finished = apiFootballData.finished;
      
      // Collect from SofaScore
      const sofaScoreData = await this.collectFromSofaScore();
      this.mergeMatches(sofaScoreData);
      
      console.log(`✅ Collected: ${this.results.live.length} live, ${this.results.upcoming.length} upcoming`);
      
      await this.saveToGitHub();
      
    } catch (error) {
      console.error('Collection failed:', error);
      // Save error log
      fs.writeFileSync('collection-error.json', JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
  }

  async collectFromAPIFootball() {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://v3.football.api-sports.io/fixtures?date=${today}&timezone=UTC`;
    
    const response = await axios.get(url, {
      headers: {
        'x-apisports-key': this.sources.apiFootball
      },
      timeout: 10000
    });
    
    const fixtures = response.data.response || [];
    
    const live = [];
    const upcoming = [];
    const finished = [];
    
    fixtures.forEach(fixture => {
      const match = {
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
        start_time: fixture.fixture.date
      };
      
      if (match.status === 'LIVE') live.push(match);
      else if (match.status === 'UPCOMING') upcoming.push(match);
      else if (match.status === 'FINISHED') finished.push(match);
    });
    
    return { live, upcoming, finished };
  }

  async collectFromSofaScore() {
    try {
      const response = await axios.get('https://api.sofascore.com/api/v1/sport/football/events/live', {
        timeout: 5000
      });
      
      const liveMatches = (response.data.events || []).map(event => ({
        id: `sofascore_${event.id}`,
        home_team: event.homeTeam.name,
        away_team: event.awayTeam.name,
        home_score: event.homeScore.current?.toString() || '0',
        away_score: event.awayScore.current?.toString() || '0',
        score: `${event.homeScore.current || 0}-${event.awayScore.current || 0}`,
        minute: event.status.description || '0\'',
        league: event.tournament.name,
        country: event.tournament.category.name,
        status: event.status.type === 'inprogress' ? 'LIVE' : 'FINISHED',
        source: 'sofascore',
        timestamp: new Date().toISOString(),
        start_time: new Date(event.startTimestamp * 1000).toISOString()
      }));
      
      return {
        live: liveMatches.filter(m => m.status === 'LIVE'),
        upcoming: [],
        finished: liveMatches.filter(m => m.status === 'FINISHED')
      };
      
    } catch (error) {
      console.log('SofaScore failed:', error.message);
      return { live: [], upcoming: [], finished: [] };
    }
  }

  mergeMatches(newData) {
    // Simple merge - prioritize API-Football
    this.results.live = [...this.results.live, ...newData.live];
    this.results.upcoming = [...this.results.upcoming, ...newData.upcoming];
    this.results.finished = [...this.results.finished, ...newData.finished];
  }

  mapAPIFootballStatus(status) {
    const statusMap = {
      'NS': 'UPCOMING', '1H': 'LIVE', 'HT': 'LIVE', '2H': 'LIVE',
      'FT': 'FINISHED', 'AET': 'FINISHED', 'PEN': 'FINISHED',
      'PST': 'POSTPONED', 'CANC': 'CANCELLED'
    };
    return statusMap[status] || 'UNKNOWN';
  }

  async saveToGitHub() {
    const data = {
      data: {
        live_matches: this.results.live,
        fixtures: [...this.results.upcoming, ...this.results.finished],
        leagues: this.extractLeagues(),
        last_updated: new Date().toISOString(),
        stats: {
          total: this.results.live.length + this.results.upcoming.length + this.results.finished.length,
          live: this.results.live.length,
          upcoming: this.results.upcoming.length,
          finished: this.results.finished.length
        }
      },
      saved_at: new Date().toISOString(),
      environment: 'github_actions',
      version: '2.0.0'
    };
    
    // Save main file
    fs.writeFileSync('matches.json', JSON.stringify(data, null, 2));
    
    // Save backup with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = 'data-backups';
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
    fs.writeFileSync(`${backupDir}/matches_${timestamp}.json`, JSON.stringify(data, null, 2));
    
    // Save compressed version
    fs.writeFileSync('matches.min.json', JSON.stringify(data));
    
    // Save health status
    const health = {
      status: 'healthy',
      last_run: new Date().toISOString(),
      matches_count: data.data.stats.total,
      next_run: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    };
    fs.writeFileSync('health.json', JSON.stringify(health, null, 2));
    
    console.log(`💾 Saved ${data.data.stats.total} matches to GitHub`);
    
    // Clean old backups (keep last 24 hours)
    this.cleanupOldBackups();
  }

  extractLeagues() {
    const allMatches = [...this.results.live, ...this.results.upcoming, ...this.results.finished];
    const leagueMap = new Map();
    
    allMatches.forEach(match => {
      if (match.league && match.country) {
        const key = `${match.league}|${match.country}`;
        if (!leagueMap.has(key)) {
          leagueMap.set(key, {
            name: match.league,
            country: match.country,
            match_count: 1
          });
        } else {
          leagueMap.get(key).match_count++;
        }
      }
    });
    
    return Array.from(leagueMap.values());
  }

  cleanupOldBackups() {
    const backupDir = 'data-backups';
    if (!fs.existsSync(backupDir)) return;
    
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('matches_') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(backupDir, f),
        time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    // Keep only backups from last 24 hours
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    const toDelete = files.filter(f => f.time < cutoff);
    
    toDelete.forEach(file => {
      fs.unlinkSync(file.path);
      console.log(`🗑️ Deleted old backup: ${file.name}`);
    });
  }
}

// Main execution
(async () => {
  try {
    console.log('='.repeat(50));
    console.log('🚀 GitHub Football Data Collector');
    console.log('='.repeat(50));
    
    const collector = new GitHubFootballCollector();
    await collector.collectAllData();
    
    console.log('='.repeat(50));
    console.log('🎉 Collection completed successfully!');
    console.log('📁 Data saved to: matches.json');
    console.log('🔄 Next run: 15 minutes');
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
})();
