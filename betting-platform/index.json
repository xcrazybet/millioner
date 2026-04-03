const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

const TOKEN = "DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy";

// Helper to fetch and store
async function fetchAndStore(url, collection, idField = "id") {
  const response = await fetch(url);
  const data = await response.json();
  if (data.data) {
    for (const item of data.data) {
      const id = item[idField] || item.fixture_id || Date.now();
      await db.collection(collection).doc(String(id)).set(item, { merge: true });
    }
  }
}

// Fixtures (live/finished/upcoming)
exports.syncFixtures = functions.pubsub.schedule("every 5 minutes").onRun(async () => {
  await fetchAndStore(
    `https://api.sportmonks.com/v3/football/fixtures/latest?api_token=${TOKEN}&include=participants;scores;events;odds;state`,
    "games"
  );
  return null;
});

// Odds
exports.syncOdds = functions.pubsub.schedule("every 10 minutes").onRun(async () => {
  await fetchAndStore(
    `https://api.sportmonks.com/v3/football/odds/inplay?api_token=${TOKEN}`,
    "odds"
  );
  return null;
});

// Standings
exports.syncStandings = functions.pubsub.schedule("every 30 minutes").onRun(async () => {
  await fetchAndStore(
    `https://api.sportmonks.com/v3/football/standings?api_token=${TOKEN}`,
    "standings"
  );
  return null;
});

// Teams
exports.syncTeams = functions.pubsub.schedule("every 12 hours").onRun(async () => {
  await fetchAndStore(
    `https://api.sportmonks.com/v3/football/teams?api_token=${TOKEN}`,
    "teams"
  );
  return null;
});

// Players
exports.syncPlayers = functions.pubsub.schedule("every 12 hours").onRun(async () => {
  await fetchAndStore(
    `https://api.sportmonks.com/v3/football/players?api_token=${TOKEN}`,
    "players"
  );
  return null;
});

// Leagues
exports.syncLeagues = functions.pubsub.schedule("every 12 hours").onRun(async () => {
  await fetchAndStore(
    `https://api.sportmonks.com/v3/football/leagues?api_token=${TOKEN}`,
    "leagues"
  );
  return null;
});
