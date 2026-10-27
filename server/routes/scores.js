const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const parseRound = require('../middleware/round');
const { SEASON } = require('../config');

const router = express.Router();
router.param('round', parseRound);

// Point values for each rule — readable by everyone so tip entry shows the real values
router.get('/rules', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT rule_key, points, description FROM scoring_rules ORDER BY id');
  res.json(rows);
});

// Scores for a specific round — returns per-user points + breakdown
router.get('/round/:round', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT rs.*, u.display_name
    FROM race_scores rs JOIN users u ON rs.user_id = u.id
    WHERE rs.race_round = $1 AND rs.season = $2 AND u.is_active = 1
  `, [req.round, SEASON]);

  const avg = rows.length > 0
    ? Math.round(rows.reduce((sum, r) => sum + r.points_total, 0) / rows.length)
    : 0;

  res.json({
    leagueAverage: avg,
    scores: rows.map(r => ({
      userId: r.user_id,
      displayName: r.display_name,
      points: r.points_total,
      breakdown: JSON.parse(r.breakdown),
    })),
  });
});

router.get('/', requireAuth, async (req, res) => {
  const { rows: users } = await pool.query('SELECT id, display_name FROM users WHERE is_active = 1');
  const { rows: scores } = await pool.query('SELECT * FROM race_scores WHERE season = $1', [SEASON]);

  const scoresBy = {};
  for (const s of scores) {
    if (!scoresBy[s.user_id]) scoresBy[s.user_id] = {};
    scoresBy[s.user_id][s.race_round] = {
      points: s.points_total,
      breakdown: JSON.parse(s.breakdown),
    };
  }

  const rows = users.map(u => {
    const perRace = scoresBy[u.id] || {};
    const total = Object.values(perRace).reduce((sum, r) => sum + r.points, 0);
    const played = Object.keys(perRace).length;
    return { userId: u.id, displayName: u.display_name, total, played, perRace, isMe: u.id === req.user.id };
  });

  // Competition ranking: equal totals share a rank (1, 1, 3).
  rows.sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName));
  rows.forEach((r, i) => { r.rank = i > 0 && r.total === rows[i - 1].total ? rows[i - 1].rank : i + 1; });

  res.json(rows);
});

module.exports = router;
