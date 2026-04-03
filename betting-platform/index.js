const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

const TOKEN = "YOUR_SPORTMONKS_API_TOKEN"; // replace with your token

// Helper to fetch and store into Firestore
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

// -------------------- FIXTURES --------------------
exports.syncFixtures = functions.pubsub.schedule("every 5 minutes").onRun(async () => {
  await fetchAndStore(
    `https://api.sportmonks.com/v3/football/fixtures/latest?api_token=${TOKEN}&include=participants;scores;events;odds;state`,
    "games"
  );
  return null;
});

exports.syncFixturesNow = functions.https.onRequest(async (req, res) => {
  try {
    await fetchAndStore(
      `https://api.sportmonks.com/v3/football/fixtures/latest?api_token=${TOKEN}&include=participants;scores;events;odds;state`,
      "games"
    );
    res.send("Fixtures synced!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error syncing fixtures");
  }
});

// -------------------- ODDS --------------------
exports.syncOdds = functions.pubsub.schedule("every 10 minutes").onRun(async () => {
  await fetchAndStore(
    `https://api.sportmonks.com/v3/football/odds/inplay?api_token=${TOKEN}`,
    "odds"
  );
  return null;
});

exports.syncOddsNow = functions.https.onRequest(async (req, res) => {
  try {
    await fetchAndStore(
      `https://api.sportmonks.com/v3/football/odds/inplay?api_token=${TOKEN}`,
      "odds"
    );
    res.send("Odds synced!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error syncing odds");
  }
});

// -------------------- STANDINGS --------------------
exports.syncStandings = functions.pubsub.schedule("every 30 minutes").onRun(async () => {
  await fetchAndStore(
    `https://api.sportmonks.com/v3/football/standings?api_token=${TOKEN}`,
    "standings"
  );
  return null;
});

exports.syncStandingsNow = functions.https.onRequest(async (req, res) => {
  try {
    await fetchAndStore(
      `https://api.sportmonks.com/v3/football/standings?api_token=${TOKEN}`,
      "standings"
    );
    res.send("Standings synced!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error syncing standings");
  }
});

// -------------------- TEAMS --------------------
exports.syncTeams = functions.pubsub.schedule("every 12 hours").onRun(async () => {
  await fetchAndStore(
    `https://api.sportmonks.com/v3/football/teams?api_token=${TOKEN}`,
    "teams"
  );
  return null;
});

exports.syncTeamsNow = functions.https.onRequest(async (req, res) => {
  try {
    await fetchAndStore(
      `https://api.sportmonks.com/v3/football/teams?api_token=${TOKEN}`,
      "teams"
    );
    res.send("Teams synced!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error syncing teams");
  }
});

// -------------------- PLAYERS --------------------
exports.syncPlayers = functions.pubsub.schedule("every 12 hours").onRun(async () => {
  await fetchAndStore(
    `https://api.sportmonks.com/v3/football/players?api_token=${TOKEN}`,
    "players"
  );
  return null;
});

exports.syncPlayersNow = functions.https.onRequest(async (req, res) => {
  try {
    await fetchAndStore(
      `https://api.sportmonks.com/v3/football/players?api_token=${TOKEN}`,
      "players"
    );
    res.send("Players synced!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error syncing players");
  }
});

// -------------------- LEAGUES --------------------
exports.syncLeagues = functions.pubsub.schedule("every 12 hours").onRun(async () => {
  await fetchAndStore(
    `https://api.sportmonks.com/v3/football/leagues?api_token=${TOKEN}`,
    "leagues"
  );
  return null;
});

exports.syncLeaguesNow = functions.https.onRequest(async (req, res) => {
  try {
    await fetchAndStore(
      `https://api.sportmonks.com/v3/football/leagues?api_token=${TOKEN}`,
      "leagues"
    );
    res.send("Leagues synced!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error syncing leagues");
  }
});
