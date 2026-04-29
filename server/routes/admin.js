const express = require('express');
const pool = require('../db');
const openf1 = require('../openf1');
const requireAuth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { scoreRound } = require('../scorer');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// ── Users ──────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.username, u.display_name, u.role, u.is_active, u.created_at,
           COUNT(p.id)::int as prediction_count
    FROM users u
    LEFT JOIN predictions p ON p.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);
  res.json(rows);
});

router.put('/users/:id', async (req, res) => {
  const { role, is_active, display_name } = req.body;
  const { rows: [user] } = await pool.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  await pool.query(`
    UPDATE users SET
      role         = COALESCE($1, role),
      is_active    = COALESCE($2, is_active),
      display_name = COALESCE($3, display_name)
    WHERE id = $4
  `, [role ?? null, is_active ?? null, display_name ?? null, req.params.id]);

  res.json({ ok: true });
});

router.delete('/users/:id/predictions/:round', async (req, res) => {
  await pool.query(
    'DELETE FROM predictions WHERE user_id = $1 AND race_round = $2 AND season = 2026',
    [req.params.id, req.params.round]
  );
  res.json({ ok: true });
});

// ── Scoring Rules ──────────────────────────────────────────────────────────

router.get('/scoring', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM scoring_rules');
  res.json(rows);
});

router.put('/scoring', async (req, res) => {
  const rules = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rules) {
      await client.query('UPDATE scoring_rules SET points = $1 WHERE id = $2', [r.points, r.id]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── Race Config ────────────────────────────────────────────────────────────

router.get('/races', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM race_config WHERE season = 2026 ORDER BY race_round');
  res.json(rows);
});

router.put('/races/:round', async (req, res) => {
  const round = parseInt(req.params.round);
  const { lock_time, manually_locked, is_sprint, cancelled, notes } = req.body;

  await pool.query(`
    INSERT INTO race_config (race_round, season, lock_time, manually_locked, is_sprint, cancelled, notes)
    VALUES ($1, 2026, $2, $3, $4, $5, $6)
    ON CONFLICT (race_round, season) DO UPDATE SET
      lock_time       = COALESCE(EXCLUDED.lock_time, race_config.lock_time),
      manually_locked = COALESCE(EXCLUDED.manually_locked, race_config.manually_locked),
      is_sprint       = COALESCE(EXCLUDED.is_sprint, race_config.is_sprint),
      cancelled       = COALESCE(EXCLUDED.cancelled, race_config.cancelled),
      notes           = COALESCE(EXCLUDED.notes, race_config.notes)
  `, [round, lock_time ?? null, manually_locked ?? 0, is_sprint ?? 0, cancelled ?? 0, notes ?? null]);

  res.json({ ok: true });
});

// ── Results ────────────────────────────────────────────────────────────────

router.get('/results', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM race_results WHERE season = 2026 ORDER BY race_round');
  res.json(rows.map(r => ({ ...r, result: JSON.parse(r.result_json) })));
});

router.put('/results/:round', async (req, res) => {
  const round = parseInt(req.params.round);
  const { finishOrder, pole, dnfs, sprintPole, sprintFinishOrder, sprintDnfs } = req.body;
  const result = {
    finishOrder,
    pole,
    dnfs: dnfs || [],
    sprintPole: sprintPole || null,
    sprintFinishOrder: sprintFinishOrder || [],
    sprintDnfs: sprintDnfs || []
  };

  await pool.query(`
    INSERT INTO race_results (race_round, season, result_json, source, updated_at)
    VALUES ($1, 2026, $2, 'manual', NOW())
    ON CONFLICT (race_round, season) DO UPDATE SET
      result_json = EXCLUDED.result_json,
      source      = EXCLUDED.source,
      updated_at  = EXCLUDED.updated_at
  `, [round, JSON.stringify(result)]);

  await scoreRound(round, 2026, result);
  res.json({ ok: true });
});

// Fetch all pending results from OpenF1 (manual trigger)
router.post('/results/fetch-all', async (req, res) => {
  const { fetchPendingResults } = require('../scheduler');
  try {
    const fetched = await fetchPendingResults();
    res.json({ ok: true, fetched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch a single round's result from OpenF1, save, and score
router.post('/results/:round/fetch', async (req, res) => {
  const round = parseInt(req.params.round);
  const { saveAndScore } = require('../scheduler');
  try {
    const result = await openf1.fetchAndBuildResult(round, 2026);
    await saveAndScore(round, result);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/results/:round/rescore', async (req, res) => {
  const round = parseInt(req.params.round);
  const { rows: [row] } = await pool.query(
    'SELECT * FROM race_results WHERE race_round = $1 AND season = 2026',
    [round]
  );
  if (!row) return res.status(404).json({ error: 'No result stored for this round' });
  await scoreRound(round, 2026, JSON.parse(row.result_json));
  res.json({ ok: true });
});

// ── Import ─────────────────────────────────────────────────────────────────

router.post('/import', async (req, res) => {
  const records = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'Body must be a JSON array' });

  const summary = [];
  const toScore = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const rec of records) {
      const { round, season = 2026, predictions } = rec;
      if (!round) throw new Error('Each record must have a round');
      if (!Array.isArray(predictions)) throw new Error(`Round ${round}: predictions must be an array`);

      const entry = { round, season, imported: 0, skipped: [], scored: false };

      for (const p of predictions) {
        const { rows: [user] } = await client.query(
          'SELECT id FROM users WHERE username = $1',
          [(p.username || '').toLowerCase()]
        );
        if (!user) { entry.skipped.push(p.username || '?'); continue; }

        const pos = (p.positions || []).slice(0, 10);
        while (pos.length < 10) pos.push(null);

        await client.query(`
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
        `, [user.id, round, season, p.pole || null, ...pos, p.dnf || null, p.sprintWinner || null]);
        entry.imported++;
      }

      const { rows: [stored] } = await client.query(
        'SELECT * FROM race_results WHERE race_round = $1 AND season = $2',
        [round, season]
      );
      if (stored) toScore.push({ round, season, result: JSON.parse(stored.result_json), entry });

      summary.push(entry);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }

  // Score after the import transaction has committed so predictions are visible
  for (const { round, season, result, entry } of toScore) {
    await scoreRound(round, season, result);
    entry.scored = true;
  }

  res.json({ ok: true, summary });
});

// ── Export (all predictions + scores for data manager) ─────────────────────

router.get('/export', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      u.id as user_id, u.username, u.display_name,
      p.race_round as round, p.season,
      p.pole, p.pos_1, p.pos_2, p.pos_3, p.pos_4, p.pos_5,
      p.pos_6, p.pos_7, p.pos_8, p.pos_9, p.pos_10,
      p.dnf, p.sprint_winner,
      s.points_total
    FROM predictions p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN race_scores s
      ON s.user_id = p.user_id AND s.race_round = p.race_round AND s.season = p.season
    WHERE p.season = 2026
    ORDER BY p.race_round, u.username
  `);
  res.json(rows);
});

// ── Score Override ──────────────────────────────────────────────────────────

router.post('/scores/override', async (req, res) => {
  const records = req.body;
  if (!Array.isArray(records) || records.length === 0)
    return res.status(400).json({ error: 'Body must be a non-empty JSON array' });

  const summary = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const rec of records) {
      const round  = parseInt(rec.round);
      const season = parseInt(rec.season || 2026);
      const points = parseInt(rec.points);
      if (!round || isNaN(round)) throw new Error(`Invalid round: ${rec.round}`);
      if (isNaN(points)) throw new Error(`Round ${round}: invalid points for "${rec.username}"`);

      let entry = summary.find(s => s.round === round && s.season === season);
      if (!entry) { entry = { round, season, written: 0, skipped: [] }; summary.push(entry); }

      const { rows: [user] } = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [(rec.username || '').toLowerCase()]
      );
      if (!user) { entry.skipped.push(rec.username || '?'); continue; }

      await client.query(`
        INSERT INTO race_scores (user_id, race_round, season, points_total, breakdown, scored_at)
        VALUES ($1, $2, $3, $4, '{"override":true}', NOW())
        ON CONFLICT (user_id, race_round, season) DO UPDATE SET
          points_total = EXCLUDED.points_total,
          breakdown    = EXCLUDED.breakdown,
          scored_at    = EXCLUDED.scored_at
      `, [user.id, round, season, points]);
      entry.written++;
    }

    await client.query('COMMIT');
    res.json({ ok: true, summary });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── Stats overview ─────────────────────────────────────────────────────────

router.get('/overview', async (req, res) => {
  const [r1, r2, r3] = await Promise.all([
    pool.query('SELECT COUNT(*)::int as c FROM users WHERE is_active = 1'),
    pool.query('SELECT COUNT(*)::int as c FROM predictions'),
    pool.query('SELECT COUNT(DISTINCT race_round)::int as c FROM race_scores WHERE season = 2026'),
  ]);
  res.json({
    userCount:    r1.rows[0].c,
    predCount:    r2.rows[0].c,
    scoredRounds: r3.rows[0].c,
  });
});

module.exports = router;
