const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { scoreRound, getScoringRules } = require('../scorer');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// ── Users ──────────────────────────────────────────────────────────────────

router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.role, u.is_active, u.created_at,
           COUNT(p.id) as prediction_count
    FROM users u
    LEFT JOIN predictions p ON p.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

router.put('/users/:id', (req, res) => {
  const { role, is_active, display_name } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare(`
    UPDATE users SET
      role       = COALESCE(?, role),
      is_active  = COALESCE(?, is_active),
      display_name = COALESCE(?, display_name)
    WHERE id = ?
  `).run(role ?? null, is_active ?? null, display_name ?? null, req.params.id);

  res.json({ ok: true });
});

router.delete('/users/:id/predictions/:round', (req, res) => {
  db.prepare(
    'DELETE FROM predictions WHERE user_id = ? AND race_round = ? AND season = 2026'
  ).run(req.params.id, req.params.round);
  res.json({ ok: true });
});

// ── Scoring Rules ──────────────────────────────────────────────────────────

router.get('/scoring', (req, res) => {
  res.json(db.prepare('SELECT * FROM scoring_rules').all());
});

router.put('/scoring', (req, res) => {
  const rules = req.body; // [{ id, points }]
  const update = db.prepare('UPDATE scoring_rules SET points = ? WHERE id = ?');
  const batch = db.transaction(() => {
    for (const r of rules) update.run(r.points, r.id);
  });
  batch();
  res.json({ ok: true });
});

// ── Race Config ────────────────────────────────────────────────────────────

router.get('/races', (req, res) => {
  res.json(db.prepare('SELECT * FROM race_config WHERE season = 2026 ORDER BY race_round').all());
});

router.put('/races/:round', (req, res) => {
  const round = parseInt(req.params.round);
  const { lock_time, manually_locked, is_sprint, notes } = req.body;

  db.prepare(`
    INSERT INTO race_config (race_round, season, lock_time, manually_locked, is_sprint, notes)
    VALUES (?, 2026, ?, ?, ?, ?)
    ON CONFLICT(race_round, season) DO UPDATE SET
      lock_time       = COALESCE(excluded.lock_time, lock_time),
      manually_locked = COALESCE(excluded.manually_locked, manually_locked),
      is_sprint       = COALESCE(excluded.is_sprint, is_sprint),
      notes           = COALESCE(excluded.notes, notes)
  `).run(round, lock_time ?? null, manually_locked ?? null, is_sprint ?? null, notes ?? null);

  res.json({ ok: true });
});

// ── Results ────────────────────────────────────────────────────────────────

router.get('/results', (req, res) => {
  res.json(db.prepare('SELECT * FROM race_results WHERE season = 2026 ORDER BY race_round').all().map(r => ({
    ...r,
    result: JSON.parse(r.result_json),
  })));
});

router.put('/results/:round', (req, res) => {
  const round = parseInt(req.params.round);
  const { finishOrder, pole, dnfs, sprintWinner } = req.body;
  const result = { finishOrder, pole, dnfs: dnfs || [], sprintWinner: sprintWinner || null };

  db.prepare(`
    INSERT INTO race_results (race_round, season, result_json, source, updated_at)
    VALUES (?, 2026, ?, 'manual', CURRENT_TIMESTAMP)
    ON CONFLICT(race_round, season) DO UPDATE SET
      result_json = excluded.result_json,
      source = excluded.source,
      updated_at = excluded.updated_at
  `).run(round, JSON.stringify(result));

  scoreRound(round, 2026, result);
  res.json({ ok: true });
});

router.post('/results/:round/rescore', (req, res) => {
  const round = parseInt(req.params.round);
  const row = db.prepare('SELECT * FROM race_results WHERE race_round = ? AND season = 2026').get(round);
  if (!row) return res.status(404).json({ error: 'No result stored for this round' });
  scoreRound(round, 2026, JSON.parse(row.result_json));
  res.json({ ok: true });
});

// ── Import ─────────────────────────────────────────────────────────────────

router.post('/import', (req, res) => {
  const records = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'Body must be a JSON array' });

  const upsertPred = db.prepare(`
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
  `);

  const summary = [];

  const batch = db.transaction(() => {
    for (const rec of records) {
      const { round, season = 2026, predictions } = rec;
      if (!round) throw new Error('Each record must have a round');
      if (!Array.isArray(predictions)) throw new Error(`Round ${round}: predictions must be an array`);

      const entry = { round, season, imported: 0, skipped: [], scored: false };

      for (const p of predictions) {
        const user = db.prepare('SELECT id FROM users WHERE username = ?').get((p.username || '').toLowerCase());
        if (!user) { entry.skipped.push(p.username || '?'); continue; }

        const pos = (p.positions || []).slice(0, 10);
        while (pos.length < 10) pos.push(null);

        upsertPred.run(
          user.id, round, season,
          p.pole || null,
          ...pos,
          p.dnf || null,
          p.sprintWinner || null
        );
        entry.imported++;
      }

      // Auto-score if a result already exists for this round
      const stored = db.prepare('SELECT * FROM race_results WHERE race_round = ? AND season = ?').get(round, season);
      if (stored) {
        scoreRound(round, season, JSON.parse(stored.result_json));
        entry.scored = true;
      }

      summary.push(entry);
    }
  });

  try {
    batch();
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Stats overview ─────────────────────────────────────────────────────────

router.get('/overview', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get().c;
  const predCount = db.prepare('SELECT COUNT(*) as c FROM predictions').get().c;
  const scoredRounds = db.prepare('SELECT COUNT(DISTINCT race_round) as c FROM race_scores WHERE season = 2026').get().c;
  res.json({ userCount, predCount, scoredRounds });
});

module.exports = router;
