const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

app.get('/proxy/*', async (req, res) => {
    const url = `https://api.sportmonks.com/${req.params[0]}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
});

app.listen(3000);
