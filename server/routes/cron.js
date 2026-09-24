const express = require('express');
const { fetchPendingResults } = require('../scheduler');
const { sendTipReminders } = require('../reminders');

const router = express.Router();

// Called by Vercel Cron daily at 21:30 UTC — Vercel Cron always sends a GET request
async function handleFetchResults(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const fetched = await fetchPendingResults();
    res.json({ ok: true, fetched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.get('/fetch-results', handleFetchResults);
router.post('/fetch-results', handleFetchResults);

// Called by Vercel Cron daily at 22:00 UTC (8am AEST) — pushes "tips close soon"
// reminders to users who haven't tipped the next race yet
async function handleTipReminders(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const sent = await sendTipReminders();
    res.json({ ok: true, sent });
  } catch (err) {
    console.error('[reminders] error:', err);
    res.status(500).json({ error: err.message });
  }
}

router.get('/tip-reminders', handleTipReminders);
router.post('/tip-reminders', handleTipReminders);

module.exports = router;
