require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// API routes
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/races',       require('./routes/races'));
app.use('/api/drivers',     require('./routes/drivers'));
app.use('/api/predictions', require('./routes/predictions'));
app.use('/api/results',     require('./routes/results'));
app.use('/api/scores',      require('./routes/scores'));
app.use('/api/admin',       require('./routes/admin'));

// Serve built React app in production
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 3877;
app.listen(PORT, () => console.log(`Pulse Pitlane Picks running on http://localhost:${PORT}`));
