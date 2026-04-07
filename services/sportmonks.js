const axios = require('axios');
const NodeCache = require('node-cache');

class SportmonksService {
  constructor() {
    // YOUR API KEY DIRECTLY IN THE CODE
    this.baseURL = 'https://soccer.sportmonks.com/api/v2.0';
    this.token = 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';
    this.cache = new NodeCache({ stdTTL: 60 }); // Cache for 1 minute
    
    console.log('✅ Sportmonks Service Initialized with your API key');
  }

  async getLiveMatches() {
    const cacheKey = 'live_matches';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log('📦 Returning cached live matches');
      return cached;
    }

    try {
      console.log('🔄 Fetching live matches from Sportmonks...');
      const response = await axios.get(`${this.baseURL}/livescores`, {
        params: {
          api_token: this.token,
          include: 'localTeam,visitorTeam,league,season'
        }
      });
      
      const matches = response.data.data || [];
      console.log(`✅ Found ${matches.length} live matches`);
      this.cache.set(cacheKey, matches);
      return matches;
    } catch (error) {
      console.error('❌ Error fetching live matches:', error.response?.data || error.message);
      return [];
    }
  }

  async getUpcomingMatches() {
    const cacheKey = 'upcoming_matches';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      console.log('🔄 Fetching upcoming matches...');
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
      
      const response = await axios.get(`${this.baseURL}/fixtures/between/${today}/${nextWeek}`, {
        params: {
          api_token: this.token,
          include: 'localTeam,visitorTeam,league,season'
        }
      });
      
      const matches = response.data.data || [];
      console.log(`✅ Found ${matches.length} upcoming matches`);
      this.cache.set(cacheKey, matches);
      return matches;
    } catch (error) {
      console.error('❌ Error fetching upcoming matches:', error.response?.data || error.message);
      return [];
    }
  }

  async getFinishedMatches() {
    const cacheKey = 'finished_matches';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      console.log('🔄 Fetching finished matches...');
      const today = new Date().toISOString().split('T')[0];
      const lastWeek = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
      
      const response = await axios.get(`${this.baseURL}/fixtures/between/${lastWeek}/${today}`, {
        params: {
          api_token: this.token,
          include: 'localTeam,visitorTeam,league,season'
        }
      });
      
      const matches = response.data.data || [];
      const finishedMatches = matches.filter(match => 
        match.status === 'FT' || match.status === 'AET' || match.status === 'PEN'
      );
      console.log(`✅ Found ${finishedMatches.length} finished matches`);
      this.cache.set(cacheKey, finishedMatches);
      return finishedMatches;
    } catch (error) {
      console.error('❌ Error fetching finished matches:', error.response?.data || error.message);
      return [];
    }
  }

  async getMatchDetails(matchId) {
    const cacheKey = `match_${matchId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      console.log(`🔄 Fetching details for match ${matchId}...`);
      const response = await axios.get(`${this.baseURL}/fixtures/${matchId}`, {
        params: {
          api_token: this.token,
          include: 'localTeam,visitorTeam,league,season,events,lineups'
        }
      });
      
      const match = response.data.data;
      this.cache.set(cacheKey, match);
      return match;
    } catch (error) {
      console.error(`❌ Error fetching match ${matchId}:`, error.message);
      return null;
    }
  }
}

module.exports = new SportmonksService();
