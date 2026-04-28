const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Ensure results table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS race_results (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    race_round  INTEGER NOT NULL,
    season      INTEGER NOT NULL DEFAULT 2025,
    result_json TEXT    NOT NULL,
    source      TEXT    NOT NULL DEFAULT 'openf1',
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(race_round, season)
  );
`);

router.get('/:round', requireAuth, (req, res) => {
  const round = parseInt(req.params.round);
  const season = parseInt(req.query.season || 2026);
  const row = db.prepare('SELECT * FROM race_results WHERE race_round = ? AND season = ?').get(round, season);
  if (!row) return res.json(null);
  res.json(JSON.parse(row.result_json));
});

module.exports = router;
