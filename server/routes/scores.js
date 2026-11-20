const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const { requireLeague } = require('../middleware/league');
const parseRound = require('../middleware/round');
const { SEASON } = require('../config');

const router = express.Router();
router.param('round', parseRound);
router.use(requireAuth, requireLeague);

// The selected league's point values — readable by everyone so tip entry shows the real values
router.get('/rules', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.rule_key, COALESCE(l.points, s.points) AS points, s.description
    FROM scoring_rules s
    LEFT JOIN league_scoring_rules l ON l.rule_key = s.rule_key AND l.league_id = $1
    ORDER BY s.id
  `, [req.league.id]);
  res.json(rows);
});

// Scores for a specific round in the selected league — per-user points + breakdown
router.get('/round/:round', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT rs.*, u.display_name
    FROM race_scores rs
    JOIN users u ON rs.user_id = u.id
    JOIN league_members m ON m.user_id = rs.user_id AND m.league_id = rs.league_id AND m.is_active = 1
    WHERE rs.race_round = $1 AND rs.season = $2 AND rs.league_id = $3 AND u.is_active = 1
  `, [req.round, SEASON, req.league.id]);

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

router.get('/', async (req, res) => {
  const { rows: users } = await pool.query(`
    SELECT u.id, u.display_name
    FROM league_members m JOIN users u ON u.id = m.user_id
    WHERE m.league_id = $1 AND m.is_active = 1 AND u.is_active = 1
  `, [req.league.id]);
  const { rows: scores } = await pool.query(
    'SELECT * FROM race_scores WHERE season = $1 AND league_id = $2', [SEASON, req.league.id]
  );

  const scoresBy = {};
  for (const s of scores) {
    if (!scoresBy[s.user_id]) scoresBy[s.user_id] = {};
    scoresBy[s.user_id][s.race_round] = {
      points: s.points_total,
      breakdown: JSON.parse(s.breakdown),
    };
  }

  // With fantasy on, each round's fantasy rank adds a few points. They're kept apart
  // from the tip points (perRace[round].points stays tips only) and added into the total.
  const fantasyBy = {};
  if (req.league.fantasy) {
    const { rows: fantasy } = await pool.query(
      'SELECT user_id, race_round, score, rank, bonus_points FROM fantasy_scores WHERE season = $1 AND league_id = $2',
      [SEASON, req.league.id]
    );
    for (const f of fantasy) {
      if (!fantasyBy[f.user_id]) fantasyBy[f.user_id] = {};
      fantasyBy[f.user_id][f.race_round] = { score: f.score, rank: f.rank, bonus: f.bonus_points };
    }
  }

  const rows = users.map(u => {
    const perRace = scoresBy[u.id] || {};
    const played = Object.keys(perRace).length;
    const tipsTotal = Object.values(perRace).reduce((sum, r) => sum + r.points, 0);
    const row = { userId: u.id, displayName: u.display_name, total: tipsTotal, played, perRace, isMe: u.id === req.user.id };
    if (req.league.fantasy) {
      const perRound = fantasyBy[u.id] || {};
      row.tipsTotal = tipsTotal;
      row.fantasyTotal = Object.values(perRound).reduce((sum, f) => sum + f.bonus, 0);
      row.fantasy = perRound;
      row.total = tipsTotal + row.fantasyTotal;
    }
    return row;
  });

  // Competition ranking: equal totals share a rank (1, 1, 3).
  rows.sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName));
  rows.forEach((r, i) => { r.rank = i > 0 && r.total === rows[i - 1].total ? rows[i - 1].rank : i + 1; });

  res.json(rows);
});

module.exports = router;
