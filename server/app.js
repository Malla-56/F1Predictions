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
app.use('/api/polls',       require('./routes/polls'));

// Safety net: catches sync throws / next(err) from any route so clients always
// get { error: string } JSON instead of a raw platform error page.
app.use((err, req, res, next) => {
  console.error('unhandled error', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
