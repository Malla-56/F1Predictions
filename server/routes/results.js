const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.get('/:round', requireAuth, async (req, res) => {
  const round = parseInt(req.params.round);
  const season = parseInt(req.query.season || 2026);
  const { rows: [row] } = await pool.query(
    'SELECT * FROM race_results WHERE race_round = $1 AND season = $2',
    [round, season]
  );
  if (!row) return res.json(null);
  res.json(JSON.parse(row.result_json));
});

module.exports = router;
