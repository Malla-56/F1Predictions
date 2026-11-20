const express = require('express');
const pool = require('../db');
const openf1 = require('../openf1');
const requireAuth = require('../middleware/auth');
const parseRound = require('../middleware/round');
const { isRaceLocked } = require('../calendar');
const { SEASON } = require('../config');
const { validatePrediction, UPSERT_PREDICTION, predictionParams } = require('../predictionRules');

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

// Codes of the current grid, or null if OpenF1 can't be reached (format checks still apply).
async function knownDrivers() {
  try {
    const drivers = await openf1.getDrivers(await openf1.getLatestSessionKey(SEASON));
    return drivers.length ? new Set(drivers.map(d => d.name_acronym)) : null;
  } catch {
    return null;
  }
}

// Submit / update my prediction for a round
router.post('/:round', requireAuth, async (req, res) => {
  if (await isRaceLocked(req.round, SEASON)) {
    return res.status(403).json({ error: 'Predictions are locked for this race' });
  }

  const error = validatePrediction(req.body || {}, await knownDrivers());
  if (error) return res.status(400).json({ error });

  await pool.query(UPSERT_PREDICTION, predictionParams(req.user.id, req.round, SEASON, req.body));

  res.json({ ok: true });
});

module.exports = router;
