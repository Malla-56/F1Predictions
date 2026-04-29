require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const app = require('./app');
const path = require('path');
const express = require('express');

// Serve the built React app locally (after `npm run build`)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 3877;
app.listen(PORT, () => console.log(`Pulse Pitlane Picks running on http://localhost:${PORT}`));
