const functions = require('firebase-functions');
const fetch = require('node-fetch');

// Sportmonks API base URL
const SPORTMONKS_API_BASE_URL = 'https://api.sportmonks.com/v3/football';

/**
 * Cloud Function to securely proxy Sportmonks API calls.
 * The API token is stored in Firebase environment configuration.
 *
 * @param {object} data - The request data.
 * @param {string} data.endpoint - The Sportmonks API endpoint (e.g., '/fixtures', '/leagues').
 * @param {object} [data.params] - Optional query parameters for the API request.
 * @param {object} context - The Cloud Function context.
 * @returns {Promise<object>} - The data from the Sportmonks API.
 */
exports.getSportmonksData = functions.https.onCall(async (data, context) => {
  // Ensure the API token is set in environment variables
  const apiToken = functions.config().sportmonks.key;
  if (!apiToken) {
    throw new functions.https.HttpsError(
      'internal',
      'Sportmonks API key not configured.'
    );
  }

  const { endpoint, params = {} } = data;

  if (!endpoint) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The "endpoint" parameter is required.'
    );
  }

  // Construct the full URL
  const queryParams = new URLSearchParams({
    api_token: apiToken,
    ...params,
  }).toString();

  const url = `${SPORTMONKS_API_BASE_URL}${endpoint}?${queryParams}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Sportmonks API error: ${response.status} - ${errorText}`);
      throw new functions.https.HttpsError(
        'unavailable',
        `Sportmonks API returned an error: ${response.statusText}`
      );
    }
    const json = await response.json();
    return { success: true, data: json };
  } catch (error) {
    console.error('Error fetching data from Sportmonks API:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to fetch data from Sportmonks API: ${error.message}`
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
