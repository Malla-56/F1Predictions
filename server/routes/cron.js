const express = require('express');
const { fetchPendingResults } = require('../scheduler');

const router = express.Router();

// Called by Vercel Cron daily at 14:00 UTC — Vercel Cron always sends a GET request
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

module.exports = router;
