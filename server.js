const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

app.get('/api/matches', async (req, res) => {
    const response = await fetch('https://api.sportmonks.com/v3/football/livescores?api_token=DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy');
    const data = await response.json();
    res.json(data);
});

app.listen(3000);
