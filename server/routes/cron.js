const express = require('express');
const { fetchPendingResults } = require('../scheduler');

const router = express.Router();

// Called by Vercel Cron daily at 14:00 UTC
router.post('/fetch-results', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const fetched = await fetchPendingResults();
    res.json({ ok: true, fetched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
