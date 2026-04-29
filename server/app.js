const express = require('express');

const app = express();
app.use(express.json());

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/races',       require('./routes/races'));
app.use('/api/drivers',     require('./routes/drivers'));
app.use('/api/predictions', require('./routes/predictions'));
app.use('/api/results',     require('./routes/results'));
app.use('/api/scores',      require('./routes/scores'));
app.use('/api/admin',       require('./routes/admin'));
app.use('/api/cron',        require('./routes/cron'));

module.exports = app;
