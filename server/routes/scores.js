const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Scores for a specific round — returns per-user points + breakdown
router.get('/round/:round', requireAuth, async (req, res) => {
  const round = parseInt(req.params.round);
  const season = parseInt(req.query.season || 2026);

  const { rows } = await pool.query(
    'SELECT rs.*, u.display_name FROM race_scores rs JOIN users u ON rs.user_id = u.id WHERE rs.race_round = $1 AND rs.season = $2',
    [round, season]
  );

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
  const season = parseInt(req.query.season || 2026);

  const { rows: users } = await pool.query('SELECT id, display_name FROM users WHERE is_active = 1');
  const { rows: scores } = await pool.query('SELECT * FROM race_scores WHERE season = $1', [season]);

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

  rows.sort((a, b) => b.total - a.total);
  rows.forEach((r, i) => { r.rank = i + 1; });

  res.json(rows);
});

module.exports = router;
