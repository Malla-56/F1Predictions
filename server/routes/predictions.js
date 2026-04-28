const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

function isRaceLocked(round, season = 2026) {
  const cfg = db.prepare('SELECT * FROM race_config WHERE race_round = ? AND season = ?').get(round, season);
  if (!cfg) return false;
  if (cfg.manually_locked) return true;
  if (cfg.lock_time && new Date() >= new Date(cfg.lock_time)) return true;
  return false;
}

// Get all predictions for a round (hides picks before lock unless it's your own)
router.get('/:round', requireAuth, (req, res) => {
  const round = parseInt(req.params.round);
  const season = parseInt(req.query.season || 2026);
  const locked = isRaceLocked(round, season);

  const rows = db.prepare(`
    SELECT p.*, u.display_name, u.id as uid
    FROM predictions p
    JOIN users u ON p.user_id = u.id
    WHERE p.race_round = ? AND p.season = ? AND u.is_active = 1
  `).all(round, season);

  const result = rows.map(p => {
    const isOwn = p.user_id === req.user.id;
    const reveal = locked || isOwn;
    return {
      userId: p.user_id,
      displayName: p.display_name,
      submittedAt: p.submitted_at,
      locked: reveal,
      ...(reveal ? {
        pole: p.pole,
        positions: [p.pos_1, p.pos_2, p.pos_3, p.pos_4, p.pos_5, p.pos_6, p.pos_7, p.pos_8, p.pos_9, p.pos_10],
        dnf: p.dnf,
        sprintWinner: p.sprint_winner,
      } : {}),
    };
  });

  res.json(result);
});

// Get my prediction for a round
router.get('/:round/mine', requireAuth, (req, res) => {
  const round = parseInt(req.params.round);
  const season = parseInt(req.query.season || 2026);
  const pred = db.prepare(
    'SELECT * FROM predictions WHERE user_id = ? AND race_round = ? AND season = ?'
  ).get(req.user.id, round, season);

  if (!pred) return res.json(null);
  res.json({
    pole: pred.pole,
    positions: [pred.pos_1, pred.pos_2, pred.pos_3, pred.pos_4, pred.pos_5, pred.pos_6, pred.pos_7, pred.pos_8, pred.pos_9, pred.pos_10],
    dnf: pred.dnf,
    sprintWinner: pred.sprint_winner,
    submittedAt: pred.submitted_at,
    updatedAt: pred.updated_at,
  });
});

// Get all my predictions (for My Tips page)
router.get('/', requireAuth, (req, res) => {
  const season = parseInt(req.query.season || 2026);
  const preds = db.prepare(
    'SELECT * FROM predictions WHERE user_id = ? AND season = ? ORDER BY race_round'
  ).all(req.user.id, season);

  res.json(preds.map(p => ({
    round: p.race_round,
    pole: p.pole,
    positions: [p.pos_1, p.pos_2, p.pos_3, p.pos_4, p.pos_5, p.pos_6, p.pos_7, p.pos_8, p.pos_9, p.pos_10],
    dnf: p.dnf,
    sprintWinner: p.sprint_winner,
    submittedAt: p.submitted_at,
  })));
});

// Submit / update my prediction for a round
router.post('/:round', requireAuth, (req, res) => {
  const round = parseInt(req.params.round);
  const season = parseInt(req.query.season || 2026);

  if (isRaceLocked(round, season)) {
    return res.status(403).json({ error: 'Predictions are locked for this race' });
  }

  const { pole, positions, dnf, sprintWinner } = req.body;
  if (!positions || positions.length !== 10) {
    return res.status(400).json({ error: 'positions must have exactly 10 drivers' });
  }

  db.prepare(`
    INSERT INTO predictions
      (user_id, race_round, season, pole, pos_1, pos_2, pos_3, pos_4, pos_5, pos_6, pos_7, pos_8, pos_9, pos_10, dnf, sprint_winner, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, race_round, season) DO UPDATE SET
      pole = excluded.pole,
      pos_1 = excluded.pos_1, pos_2 = excluded.pos_2, pos_3 = excluded.pos_3,
      pos_4 = excluded.pos_4, pos_5 = excluded.pos_5, pos_6 = excluded.pos_6,
      pos_7 = excluded.pos_7, pos_8 = excluded.pos_8, pos_9 = excluded.pos_9,
      pos_10 = excluded.pos_10,
      dnf = excluded.dnf,
      sprint_winner = excluded.sprint_winner,
      updated_at = excluded.updated_at
  `).run(
    req.user.id, round, season, pole,
    ...positions,
    dnf, sprintWinner || null
  );

  res.json({ ok: true });
});

module.exports = router;
