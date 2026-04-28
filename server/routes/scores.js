const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Full leaderboard
router.get('/', requireAuth, (req, res) => {
  const season = parseInt(req.query.season || 2026);

  const users = db.prepare(
    'SELECT id, display_name FROM users WHERE is_active = 1'
  ).all();

  const scores = db.prepare(
    'SELECT * FROM race_scores WHERE season = ?'
  ).all(season);

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
