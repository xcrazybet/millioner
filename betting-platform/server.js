import express from "express";
import fetch from "node-fetch";
import admin from "firebase-admin";
import serviceAccount from "./serviceAccountKey.json" assert { type: "json" };

const app = express();
const PORT = 3000;
const TOKEN = "DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy";

// Firebase init
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://x-bet-prod-jd.firebaseio.com"
});
const db = admin.firestore();

app.use(express.static("public"));

async function proxyAndStore(url, res, collection) {
  try {
    const response = await fetch(url);
    const data = await response.json();

    // Store each item in Firestore
    if (data.data) {
      for (const item of data.data) {
        const id = item.id || item.fixture_id || Date.now();
        await db.collection(collection).doc(String(id)).set(item, { merge: true });
      }
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch/store data" });
  }
}

// Routes
app.get("/api/inplay", (req, res) =>
  proxyAndStore(
    `https://api.sportmonks.com/v3/football/livescores/inplay?api_token=${TOKEN}&include=state;lineups;events;statistics;periods`,
    res,
    "games"
  )
);

app.get("/api/upcoming", (req, res) =>
  proxyAndStore(
    `https://api.sportmonks.com/v3/football/fixtures/upcoming?api_token=${TOKEN}&include=participants;state`,
    res,
    "fixtures"
  )
);

app.get("/api/odds", (req, res) =>
  proxyAndStore(
    `https://api.sportmonks.com/v3/football/odds/inplay?api_token=${TOKEN}`,
    res,
    "odds"
  )
);

app.listen(PORT, () =>
  console.log(`✅ Backend with Firebase running at http://localhost:${PORT}`)
);
