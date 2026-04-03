const functions = require('firebase-functions');

// Sportmonks API base URL
const SPORTMONKS_API_BASE_URL = 'https://api.sportmonks.com/v3/football';

/**
 * Cloud Function to securely proxy Sportmonks API calls.
 * The API token is stored in Firebase environment configuration.
 */
exports.getSportmonksData = functions.https.onCall(async (data, context) => {
  // Try multiple ways to get the token
  const configToken = functions.config().sportmonks?.key;
  const envToken = process.env.SPORTMONKS_API_KEY;
  const apiToken = configToken || envToken;

  if (!apiToken) {
    console.error('CRITICAL: Sportmonks API key is missing from BOTH config and env!');
    throw new functions.https.HttpsError(
      'failed-precondition',
      'API Key Missing. Please run: firebase functions:config:set sportmonks.key="YOUR_TOKEN"'
    );
  }

  const { endpoint, params = {} } = data;
  if (!endpoint) {
    throw new functions.https.HttpsError('invalid-argument', 'Endpoint is required');
  }

  const queryParams = new URLSearchParams({
    api_token: apiToken,
    ...params,
  }).toString();

  const url = `${SPORTMONKS_API_BASE_URL}${endpoint}?${queryParams}`;
  console.log(`Calling Sportmonks: ${url}`);

  try {
    // Using native fetch available in Node 18
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Sportmonks Error (${response.status}): ${errorText}`);
      
      if (response.status === 401 || response.status === 403) {
        throw new functions.https.HttpsError('unauthenticated', 'Invalid Sportmonks API Token');
      }
      if (response.status === 429) {
        throw new functions.https.HttpsError('resource-exhausted', 'API Rate limit exceeded');
      }
      
      throw new functions.https.HttpsError('unavailable', `Sportmonks API Error: ${response.status}`);
    }

    const json = await response.json();
    return { success: true, data: json };
  } catch (error) {
    console.error('Network Error:', error.message);
    
    if (error.name === 'TimeoutError' || error.message.includes('timeout') || error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      throw new functions.https.HttpsError(
        'deadline-exceeded',
        'Connection failed. Ensure you have upgraded to the Firebase Blaze plan.'
      );
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Cloud Function to fetch Sportmonks standings for a season.
 * @param {object} data - The request data.
 * @param {number} data.seasonId - The ID of the season to get standings for.
 * @returns {Promise<object>} - The standings data.
 */
exports.getStandings = functions.https.onCall(async (data, context) => {
  const { seasonId } = data;
  if (!seasonId) {
    throw new functions.https.HttpsError('invalid-argument', 'The "seasonId" parameter is required.');
  }
  try {
    const result = await exports.getSportmonksData({
      endpoint: `/standings/seasons/${seasonId}`,
      params: { include: 'team' },
    }, context);
    return result;
  } catch (error) {
    console.error('Error in getStandings:', error);
    throw new functions.https.HttpsError('internal', `Failed to fetch standings: ${error.message}`);
  }
});

/**
 * Cloud Function to fetch Sportmonks top scorers for a season.
 * @param {object} data - The request data.
 * @param {number} data.seasonId - The ID of the season.
 * @returns {Promise<object>} - The top scorers data.
 */
exports.getTopScorers = functions.https.onCall(async (data, context) => {
  const { seasonId } = data;
  if (!seasonId) {
    throw new functions.https.HttpsError('invalid-argument', 'The "seasonId" parameter is required.');
  }
  try {
    const result = await exports.getSportmonksData({
      endpoint: `/topscorers/seasons/${seasonId}`,
      params: { include: 'player;team' },
    }, context);
    return result;
  } catch (error) {
    console.error('Error in getTopScorers:', error);
    throw new functions.https.HttpsError('internal', `Failed to fetch top scorers: ${error.message}`);
  }
});

/**
 * Cloud Function to fetch latest match updates (last 10 seconds).
 * @returns {Promise<object>} - The latest updates data.
 */
exports.getLatestUpdates = functions.https.onCall(async (data, context) => {
  try {
    const result = await exports.getSportmonksData({
      endpoint: '/fixtures/latest',
      params: {
        include: 'participants;scores;events;odds',
      },
    }, context);
    return result;
  } catch (error) {
    console.error('Error in getLatestUpdates:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to fetch latest updates: ${error.message}`
    );
  }
});

/**
 * Cloud Function to fetch all Sportmonks leagues.
 * @returns {Promise<object>} - The leagues data.
 */
exports.getLeagues = functions.https.onCall(async (data, context) => {
  try {
    const result = await exports.getSportmonksData({
      endpoint: '/leagues',
      params: {
        include: 'country;season',
      },
    }, context);
    return result;
  } catch (error) {
    console.error('Error in getLeagues:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to fetch leagues: ${error.message}`
    );
  }
});

/**
 * Cloud Function to fetch live Sportmonks scores.
 * @returns {Promise<object>} - The live scores data.
 */
exports.getLiveScores = functions.https.onCall(async (data, context) => {
  try {
    const result = await exports.getSportmonksData({
      endpoint: '/livescores/inplay',
      params: {
        include: 'participants;scores;events',
      },
    }, context);
    return result;
  } catch (error) {
    console.error('Error in getLiveScores:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to fetch live scores: ${error.message}`
    );
  }
});

/**
 * Cloud Function to fetch betting odds for a specific fixture.
 * @param {object} data - The request data.
 * @param {number} data.fixtureId - The ID of the fixture to get odds for.
 * @returns {Promise<object>} - The betting odds data.
 */
exports.getFixtureOdds = functions.https.onCall(async (data, context) => {
  const { fixtureId } = data;

  if (!fixtureId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The "fixtureId" parameter is required.'
    );
  }

  try {
    const result = await exports.getSportmonksData({
      endpoint: `/odds/pre-match/fixtures/${fixtureId}`,
      params: {
        include: 'bookmaker;market', // Include bookmakers and markets for the odds
      },
    }, context);
    return result;
  } catch (error) {
    console.error(`Error in getFixtureOdds for fixture ${fixtureId}:`, error);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to fetch odds for fixture ${fixtureId}: ${error.message}`
    );
  }
});

/**
 * Cloud Function to fetch upcoming Sportmonks fixtures.
 * @returns {Promise<object>} - The upcoming fixtures data.
 */
exports.getUpcomingFixtures = functions.https.onCall(async (data, context) => {
  try {
    const result = await exports.getSportmonksData({
      endpoint: '/fixtures',
      params: {
        include: 'participants;stages',
        // You might want to add filters for upcoming fixtures, e.g., by date
        // 'filter[starts_between]': '2026-04-03,2026-04-10' (example for next 7 days)
      },
    }, context);
    return result;
  } catch (error) {
    console.error('Error in getUpcomingFixtures:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to fetch upcoming fixtures: ${error.message}`
    );
  }
});
