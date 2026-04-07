const axios = require('axios');
const NodeCache = require('node-cache');

class SportmonksService {
  constructor() {
    this.baseURL = process.env.SPORTMONKS_BASE_URL;
    this.token = process.env.SPORTMONKS_API_TOKEN;
    // Cache for 1 minute to avoid rate limits
    this.cache = new NodeCache({ stdTTL: 60 });
    
    console.log('Sportmonks Service Initialized');
  }

  // Get live matches
  async getLiveMatches() {
    const cacheKey = 'live_matches';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.baseURL}/livescores`, {
        params: {
          api_token: this.token,
          include: 'localTeam,visitorTeam,league,season'
        }
      });
      
      const matches = response.data.data || [];
      this.cache.set(cacheKey, matches);
      return matches;
    } catch (error) {
      console.error('Error fetching live matches:', error.response?.data || error.message);
      return [];
    }
  }

  // Get upcoming matches (next 7 days)
  async getUpcomingMatches() {
    const cacheKey = 'upcoming_matches';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
      
      const response = await axios.get(`${this.baseURL}/fixtures/between/${today}/${nextWeek}`, {
        params: {
          api_token: this.token,
          include: 'localTeam,visitorTeam,league,season'
        }
      });
      
      const matches = response.data.data || [];
      this.cache.set(cacheKey, matches);
      return matches;
    } catch (error) {
      console.error('Error fetching upcoming matches:', error.response?.data || error.message);
      return [];
    }
  }

  // Get finished matches (last 7 days)
  async getFinishedMatches() {
    const cacheKey = 'finished_matches';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const today = new Date().toISOString().split('T')[0];
      const lastWeek = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
      
      const response = await axios.get(`${this.baseURL}/fixtures/between/${lastWeek}/${today}`, {
        params: {
          api_token: this.token,
          include: 'localTeam,visitorTeam,league,season'
        }
      });
      
      const matches = response.data.data || [];
      // Filter only finished matches
      const finishedMatches = matches.filter(match => match.status === 'FT' || match.status === 'AET');
      this.cache.set(cacheKey, finishedMatches);
      return finishedMatches;
    } catch (error) {
      console.error('Error fetching finished matches:', error.response?.data || error.message);
      return [];
    }
  }

  // Get single match details
  async getMatchDetails(matchId) {
    const cacheKey = `match_${matchId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
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
      console.error(`Error fetching match ${matchId}:`, error.response?.data || error.message);
      return null;
    }
  }

  // Get betting odds for a match
  async getMatchOdds(matchId) {
    const cacheKey = `odds_${matchId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`${this.baseURL}/odds/fixture/${matchId}`, {
        params: {
          api_token: this.token,
          include: 'bookmaker,market'
        }
      });
      
      const odds = response.data.data || [];
      this.cache.set(cacheKey, odds);
      return odds;
    } catch (error) {
      console.error(`Error fetching odds for match ${matchId}:`, error.message);
      return [];
    }
  }
}

module.exports = new SportmonksService();
