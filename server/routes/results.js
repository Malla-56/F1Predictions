const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const parseRound = require('../middleware/round');
const { SEASON } = require('../config');

const router = express.Router();
router.param('round', parseRound);

router.get('/:round', requireAuth, async (req, res) => {
  const { rows: [row] } = await pool.query(
    'SELECT * FROM race_results WHERE race_round = $1 AND season = $2',
    [req.round, SEASON]
  );
  if (!row) return res.json(null);
  const result = JSON.parse(row.result_json);
  // Older stored results called the sprint winner "sprintPole".
  if (!result.sprintWinner) result.sprintWinner = result.sprintFinishOrder?.[0] || result.sprintPole || null;
  res.json(result);
});

module.exports = router;
