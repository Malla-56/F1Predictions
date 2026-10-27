const express = require('express');
const pool = require('../db');
const openf1 = require('../openf1');
const requireAuth = require('../middleware/auth');
const parseRound = require('../middleware/round');
const { isRaceLocked } = require('../calendar');
const { SEASON } = require('../config');

const router = express.Router();
router.param('round', parseRound);

function positionsOf(p) {
  return [p.pos_1, p.pos_2, p.pos_3, p.pos_4, p.pos_5, p.pos_6, p.pos_7, p.pos_8, p.pos_9, p.pos_10];
}

// Get all predictions for a round (hides picks before lock unless it's your own)
router.get('/:round', requireAuth, async (req, res) => {
  const locked = await isRaceLocked(req.round, SEASON);

  const { rows } = await pool.query(`
    SELECT p.*, u.display_name
    FROM predictions p
    JOIN users u ON p.user_id = u.id
    WHERE p.race_round = $1 AND p.season = $2 AND u.is_active = 1
  `, [req.round, SEASON]);

  res.json(rows.map(p => {
    const reveal = locked || p.user_id === req.user.id;
    return {
      userId: p.user_id,
      displayName: p.display_name,
      submittedAt: p.submitted_at,
      locked,
      ...(reveal ? {
        pole: p.pole,
        positions: positionsOf(p),
        dnf: p.dnf,
        sprintWinner: p.sprint_winner,
      } : {}),
    };
  }));
});

// Get my prediction for a round
router.get('/:round/mine', requireAuth, async (req, res) => {
  const { rows: [pred] } = await pool.query(
    'SELECT * FROM predictions WHERE user_id = $1 AND race_round = $2 AND season = $3',
    [req.user.id, req.round, SEASON]
  );

  if (!pred) return res.json(null);
  res.json({
    pole: pred.pole,
    positions: positionsOf(pred),
    dnf: pred.dnf,
    sprintWinner: pred.sprint_winner,
    submittedAt: pred.submitted_at,
    updatedAt: pred.updated_at,
  });
});

// Get all my predictions (for My Tips page)
router.get('/', requireAuth, async (req, res) => {
  const { rows: preds } = await pool.query(
    'SELECT * FROM predictions WHERE user_id = $1 AND season = $2 ORDER BY race_round',
    [req.user.id, SEASON]
  );

  res.json(preds.map(p => ({
    round: p.race_round,
    pole: p.pole,
    positions: positionsOf(p),
    dnf: p.dnf,
    sprintWinner: p.sprint_winner,
    submittedAt: p.submitted_at,
  })));
});

const isPick = v => v === null || v === undefined || (typeof v === 'string' && /^[A-Z]{3}$/.test(v));

// Codes of the current grid, or null if OpenF1 can't be reached (format checks still apply).
async function knownDrivers() {
  try {
    const drivers = await openf1.getDrivers(await openf1.getLatestSessionKey(SEASON));
    return drivers.length ? new Set(drivers.map(d => d.name_acronym)) : null;
  } catch {
    return null;
  }
}

function validatePrediction({ pole, positions, dnf, sprintWinner }, known) {
  if (!Array.isArray(positions) || positions.length !== 10) return 'positions must have exactly 10 entries';
  const picks = [...positions, pole, dnf, sprintWinner];
  if (!picks.every(isPick)) return 'Invalid driver code';
  const placed = positions.filter(Boolean);
  if (new Set(placed).size !== placed.length) return 'A driver can only be picked once in the top 10';
  if (known && !picks.filter(Boolean).every(code => known.has(code))) return 'Unknown driver';
  return null;
}

// Submit / update my prediction for a round
router.post('/:round', requireAuth, async (req, res) => {
  if (await isRaceLocked(req.round, SEASON)) {
    return res.status(403).json({ error: 'Predictions are locked for this race' });
  }

  const error = validatePrediction(req.body || {}, await knownDrivers());
  if (error) return res.status(400).json({ error });

  const { pole, positions, dnf, sprintWinner } = req.body;
  await pool.query(`
    INSERT INTO predictions
      (user_id, race_round, season, pole, pos_1, pos_2, pos_3, pos_4, pos_5, pos_6, pos_7, pos_8, pos_9, pos_10, dnf, sprint_winner, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
    ON CONFLICT (user_id, race_round, season) DO UPDATE SET
      pole = EXCLUDED.pole,
      pos_1 = EXCLUDED.pos_1, pos_2 = EXCLUDED.pos_2, pos_3 = EXCLUDED.pos_3,
      pos_4 = EXCLUDED.pos_4, pos_5 = EXCLUDED.pos_5, pos_6 = EXCLUDED.pos_6,
      pos_7 = EXCLUDED.pos_7, pos_8 = EXCLUDED.pos_8, pos_9 = EXCLUDED.pos_9,
      pos_10 = EXCLUDED.pos_10,
      dnf = EXCLUDED.dnf,
      sprint_winner = EXCLUDED.sprint_winner,
      updated_at = EXCLUDED.updated_at
  `, [req.user.id, req.round, SEASON, pole || null, ...positions.map(p => p || null), dnf || null, sprintWinner || null]);

  res.json({ ok: true });
});

module.exports = router;
