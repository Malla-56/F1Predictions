const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const openf1 = require('../openf1');
const requireAuth = require('../middleware/auth');
const requireSiteManager = require('../middleware/requireAdmin');
const { requireLeagueAdmin } = require('../middleware/league');
const { MEMBER_LIMIT, isSiteManager, canManageAccount } = require('../leagues');
const parseRound = require('../middleware/round');
const { getRace, LOCK_POINTS } = require('../calendar');
const { scoreRound, rescoreAll } = require('../scorer');
const { refreshStats: refreshFantasyStats } = require('../fantasy');
const { SEASON } = require('../config');
const { validatePrediction, UPSERT_PREDICTION, predictionParams } = require('../predictionRules');

// Two levels of admin:
//  - league admins (requireLeagueAdmin) manage the league selected in X-League-Id:
//    its members, scoring rules, joker round, score overrides and data;
//  - the site manager (requireSiteManager) runs what every league shares: race lock
//    times, results, imports of tips.
const router = express.Router();
router.use(requireAuth);
router.param('round', parseRound);

// ── Users ──────────────────────────────────────────────────────────────────

// A league's membership row for a user, or null.
async function memberOf(leagueId, userId) {
  const { rows: [m] } = await pool.query(
    'SELECT role, is_active FROM league_members WHERE league_id = $1 AND user_id = $2', [leagueId, userId]
  );
  return m || null;
}

const NOT_YOURS = "They're also in a league you don't run, so only the site manager can change their account or tips";

// role and is_active are the league membership's; can_manage says whether this admin
// may change the account itself (see canManageAccount).
router.get('/users', requireLeagueAdmin, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.username, u.display_name, m.role, m.is_active, m.joined_at AS created_at,
           u.last_login_at, u.last_seen_at,
           (SELECT COUNT(*)::int FROM predictions p WHERE p.user_id = u.id) AS prediction_count,
           ($2 OR NOT EXISTS (
             SELECT 1 FROM league_members t
             WHERE t.user_id = u.id AND t.is_active = 1
               AND NOT EXISTS (SELECT 1 FROM league_members a
                               WHERE a.league_id = t.league_id AND a.user_id = $3
                                 AND a.role = 'admin' AND a.is_active = 1)
           )) AS can_manage
    FROM league_members m JOIN users u ON u.id = m.user_id
    WHERE m.league_id = $1
    ORDER BY m.joined_at DESC
  `, [req.league.id, isSiteManager(req.user), req.user.id]);
  res.json(rows);
});

// role / is_active change the league membership (make admin, remove from league).
// display_name / password change the account, so need canManageAccount.
router.put('/users/:id', requireLeagueAdmin, async (req, res) => {
  const { role, is_active, display_name, password } = req.body;
  const targetId = parseInt(req.params.id);

  const isSelf = targetId === req.user.id;
  if (isSelf && ((role !== undefined && role !== 'admin') || (is_active !== undefined && !is_active))) {
    return res.status(400).json({ error: "You can't remove or demote yourself" });
  }
  if (role !== undefined && !['admin', 'member', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  if (password !== undefined) {
    if (isSelf) {
      return res.status(400).json({ error: 'Cannot reset your own password this way' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
  }

  const member = await memberOf(req.league.id, targetId);
  if (!member) return res.status(404).json({ error: 'User is not in this league' });
  if ((password !== undefined || display_name !== undefined) && !(await canManageAccount(req.user, targetId))) {
    return res.status(403).json({ error: NOT_YOURS });
  }
  // Restoring someone counts toward the member limit like a new join.
  if (is_active && !member.is_active) {
    const { rows: [{ c }] } = await pool.query(
      'SELECT COUNT(*)::int AS c FROM league_members WHERE league_id = $1 AND is_active = 1', [req.league.id]
    );
    if (c >= MEMBER_LIMIT) return res.status(409).json({ error: `This league is full (${MEMBER_LIMIT} members)` });
  }

  const newHash = password ? await bcrypt.hash(password, 10) : null;
  const newRole = role === undefined ? null : role === 'admin' ? 'admin' : 'member';

  await pool.query(`
    UPDATE league_members SET
      role      = COALESCE($1, role),
      is_active = COALESCE($2, is_active)
    WHERE league_id = $3 AND user_id = $4
  `, [newRole, is_active === undefined ? null : (is_active ? 1 : 0), req.league.id, targetId]);

  if (display_name !== undefined || newHash) {
    await pool.query(`
      UPDATE users SET
        display_name  = COALESCE($1, display_name),
        password_hash = COALESCE($2, password_hash)
      WHERE id = $3
    `, [display_name ?? null, newHash, targetId]);
  }

  res.json({ ok: true });
});

// Tips are shared by every league, so editing one needs the same rights as the account.
async function checkTipAccess(req, res) {
  const userId = parseInt(req.params.id);
  if (!(await memberOf(req.league.id, userId))) {
    res.status(404).json({ error: 'User is not in this league' });
    return null;
  }
  if (!(await canManageAccount(req.user, userId))) {
    res.status(403).json({ error: NOT_YOURS });
    return null;
  }
  return userId;
}

router.delete('/users/:id/predictions/:round', requireLeagueAdmin, async (req, res) => {
  const userId = await checkTipAccess(req, res);
  if (!userId) return;
  const params = [userId, req.round, SEASON];
  // Remove the scores too (in every league), otherwise the deleted tip keeps counting.
  await pool.query('DELETE FROM race_scores WHERE user_id = $1 AND race_round = $2 AND season = $3', params);
  await pool.query('DELETE FROM predictions WHERE user_id = $1 AND race_round = $2 AND season = $3', params);
  res.json({ ok: true });
});

// Enter or correct a user's tip for any round, locked or not (e.g. a tip given in
// person after an app error). Any manual points override for that round is removed
// so the tip is scored normally, and the round is rescored if it has a result.
// Driver codes are format-checked only: past rounds may include drivers who have
// since left the grid.
router.put('/users/:id/predictions/:round', requireLeagueAdmin, async (req, res) => {
  const body = req.body || {};
  const error = validatePrediction(body, null);
  if (error) return res.status(400).json({ error });

  const userId = await checkTipAccess(req, res);
  if (!userId) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(UPSERT_PREDICTION, predictionParams(userId, req.round, SEASON, body));
    await client.query(`
      DELETE FROM race_scores
      WHERE user_id = $1 AND race_round = $2 AND season = $3 AND league_id = $4
        AND breakdown LIKE '%"override":true%'
    `, [userId, req.round, SEASON, req.league.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const { rows: [stored] } = await pool.query(
    'SELECT result_json FROM race_results WHERE race_round = $1 AND season = $2', [req.round, SEASON]
  );
  if (!stored) return res.json({ ok: true, scored: false });

  // The tip is shared, so it's rescored in every league.
  await scoreRound(req.round, SEASON, JSON.parse(stored.result_json));
  const { rows: [score] } = await pool.query(
    'SELECT points_total FROM race_scores WHERE user_id = $1 AND race_round = $2 AND season = $3 AND league_id = $4',
    [userId, req.round, SEASON, req.league.id]
  );
  res.json({ ok: true, scored: true, points: score?.points_total ?? null });
});

// ── Scoring Rules ──────────────────────────────────────────────────────────

// The selected league's values; id is the scoring_rules id the client sends back.
router.get('/scoring', requireLeagueAdmin, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.id, s.rule_key, COALESCE(l.points, s.points) AS points, s.description
    FROM scoring_rules s
    LEFT JOIN league_scoring_rules l ON l.rule_key = s.rule_key AND l.league_id = $1
    ORDER BY s.id
  `, [req.league.id]);
  res.json(rows);
});

router.put('/scoring', requireLeagueAdmin, async (req, res) => {
  const rules = req.body;
  if (!Array.isArray(rules) || !rules.every(r => Number.isInteger(r.points) && r.points >= 0)) {
    return res.status(400).json({ error: 'Points must be whole numbers of 0 or more' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rules) {
      await client.query(`
        INSERT INTO league_scoring_rules (league_id, rule_key, points)
        SELECT $1, rule_key, $2 FROM scoring_rules WHERE id = $3
        ON CONFLICT (league_id, rule_key) DO UPDATE SET points = EXCLUDED.points
      `, [req.league.id, r.points, r.id]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
  // Apply the new values to every round in this league that already has a result.
  await rescoreAll(req.league.id);
  res.json({ ok: true });
});

// ── Fantasy ────────────────────────────────────────────────────────────────

// Switches the fantasy side game on or off for the selected league. Scores already
// earned are kept while it's off, and count again if it's switched back on.
router.put('/fantasy', requireLeagueAdmin, async (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true or false' });
  await pool.query('UPDATE leagues SET fantasy_enabled = $1 WHERE id = $2', [enabled ? 1 : 0, req.league.id]);

  if (enabled) {
    // Rounds scored before now have no saved race stats yet; fetch what's missing, then score.
    const { rows } = await pool.query(`
      SELECT r.race_round FROM race_results r
      WHERE r.season = $1 AND EXISTS (SELECT 1 FROM fantasy_picks p WHERE p.race_round = r.race_round AND p.season = r.season)
        AND NOT EXISTS (SELECT 1 FROM fantasy_race_stats s WHERE s.race_round = r.race_round AND s.season = r.season)
    `, [SEASON]);
    for (const { race_round: round } of rows) {
      const race = await getRace(round, SEASON).catch(() => null);
      if (race) await refreshFantasyStats(race);
    }
    await rescoreAll(req.league.id);
  }
  res.json({ ok: true, enabled });
});

// ── OpenF1 status ──────────────────────────────────────────────────────────

router.get('/openf1-status', requireLeagueAdmin, async (req, res) => {
  res.json(await openf1.status(SEASON));
});

// ── Race Config ────────────────────────────────────────────────────────────

// Shared race settings plus this league's joker round.
router.get('/races', requireLeagueAdmin, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT COALESCE(c.race_round, j.race_round) AS race_round,
           c.lock_time, c.manually_locked, c.is_sprint, c.cancelled, c.notes, c.lock_at,
           COALESCE(j.is_joker, 0) AS is_joker
    FROM (SELECT * FROM race_config WHERE season = $1) c
    FULL JOIN (SELECT * FROM league_race_settings WHERE season = $1 AND league_id = $2) j
      ON j.race_round = c.race_round
    ORDER BY 1
  `, [SEASON, req.league.id]);
  res.json(rows);
});

const RACE_FLAGS = ['manually_locked', 'is_sprint', 'cancelled'];

// Partial update: only the fields present in the body change. is_joker is the selected
// league's; everything else is shared by all leagues and needs the site manager.
// lock_time: null clears the override (back to the default lock at the start of the
// race weekend). An override later than the race start is capped to it in
// calendar.getCalendar.
router.put('/races/:round', requireLeagueAdmin, async (req, res) => {
  const body = req.body || {};
  const fields = {};
  for (const key of RACE_FLAGS) {
    if (key in body) fields[key] = body[key] ? 1 : 0;
  }
  if ('lock_time' in body) {
    if (body.lock_time !== null && isNaN(new Date(body.lock_time))) {
      return res.status(400).json({ error: 'Invalid lock time' });
    }
    fields.lock_time = body.lock_time === null ? null : new Date(body.lock_time).toISOString();
  }
  // Session tips lock at; null or 'weekend' means the default (weekend start).
  if ('lock_at' in body) {
    const lockAt = body.lock_at === 'weekend' ? null : body.lock_at;
    if (lockAt !== null && !LOCK_POINTS.includes(lockAt)) {
      return res.status(400).json({ error: 'Invalid lock point' });
    }
    fields.lock_at = lockAt;
  }
  if ('notes' in body) fields.notes = body.notes ?? null;

  const keys = Object.keys(fields);
  const joker = 'is_joker' in body ? (body.is_joker ? 1 : 0) : null;
  if (!keys.length && joker === null) return res.status(400).json({ error: 'Nothing to update' });
  if (keys.length && !isSiteManager(req.user)) {
    return res.status(403).json({ error: 'Lock times and race status are shared by every league, so only the site manager can change them' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (keys.length) {
      const placeholders = keys.map((_, i) => `$${i + 3}`).join(', ');
      const updates = keys.map(k => `${k} = EXCLUDED.${k}`).join(', ');
      await client.query(`
        INSERT INTO race_config (race_round, season, ${keys.join(', ')})
        VALUES ($1, $2, ${placeholders})
        ON CONFLICT (race_round, season) DO UPDATE SET ${updates}
      `, [req.round, SEASON, ...keys.map(k => fields[k])]);
    }
    if (joker !== null) {
      // Only one joker round per season: choosing a new one clears the old one.
      if (joker === 1) {
        await client.query(
          'UPDATE league_race_settings SET is_joker = 0 WHERE league_id = $1 AND season = $2 AND race_round <> $3',
          [req.league.id, SEASON, req.round]
        );
      }
      await client.query(`
        INSERT INTO league_race_settings (league_id, season, race_round, is_joker)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (league_id, season, race_round) DO UPDATE SET is_joker = EXCLUDED.is_joker
      `, [req.league.id, SEASON, req.round, joker]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Doubling (or un-doubling) applies to any round that already has a result.
  if (joker !== null) await rescoreAll(req.league.id);

  res.json({ ok: true });
});

// ── Results ────────────────────────────────────────────────────────────────

router.get('/results', requireLeagueAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM race_results WHERE season = $1 ORDER BY race_round', [SEASON]);
  res.json(rows.map(r => {
    const result = JSON.parse(r.result_json);
    // Older stored results called the sprint winner "sprintPole".
    if (!result.sprintWinner) result.sprintWinner = result.sprintFinishOrder?.[0] || result.sprintPole || null;
    return { ...r, result };
  }));
});

router.put('/results/:round', requireSiteManager, async (req, res) => {
  const round = req.round;
  const { finishOrder, pole, dnfs, sprintWinner, sprintFinishOrder, sprintDnfs } = req.body;
  if (!Array.isArray(finishOrder) || !finishOrder.some(Boolean)) {
    return res.status(400).json({ error: 'finishOrder must list at least one driver' });
  }
  const placed = finishOrder.filter(Boolean);
  if (new Set(placed).size !== placed.length) {
    return res.status(400).json({ error: 'A driver appears more than once in the finishing order' });
  }
  const result = {
    finishOrder,
    pole: pole || null,
    dnfs: dnfs || [],
    sprintWinner: sprintWinner || sprintFinishOrder?.[0] || null,
    sprintFinishOrder: sprintFinishOrder || [],
    sprintDnfs: sprintDnfs || []
  };

  const { saveAndScore } = require('../scheduler');
  await saveAndScore(round, result, 'manual');
  res.json({ ok: true });
});

// Fetch all pending results from OpenF1 (manual trigger)
router.post('/results/fetch-all', requireSiteManager, async (req, res) => {
  const { fetchPendingResults } = require('../scheduler');
  try {
    const { fetched, errors } = await fetchPendingResults();
    res.json({ ok: true, fetched, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch a single round's result from OpenF1, save, and score
router.post('/results/:round/fetch', requireSiteManager, async (req, res) => {
  const round = req.round;
  const { saveAndScore } = require('../scheduler');
  try {
    const race = await getRace(round, SEASON);
    if (!race) throw new Error(`Round ${round} not found in calendar`);
    if (race.raceEnd > new Date()) throw new Error(`Round ${round} hasn't finished yet`);
    const result = await openf1.buildResult(race);
    await saveAndScore(round, result);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/results/:round/rescore', requireSiteManager, async (req, res) => {
  const round = req.round;
  const { rows: [row] } = await pool.query(
    'SELECT * FROM race_results WHERE race_round = $1 AND season = $2',
    [round, SEASON]
  );
  if (!row) return res.status(404).json({ error: 'No result stored for this round' });
  const race = await getRace(round, SEASON).catch(() => null);
  if (race) await refreshFantasyStats(race);
  await scoreRound(round, SEASON, JSON.parse(row.result_json));
  res.json({ ok: true });
});

// ── Import ─────────────────────────────────────────────────────────────────

// Tips are shared by every league, so importing them is the site manager's job.
router.post('/import', requireSiteManager, async (req, res) => {
  const records = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'Body must be a JSON array' });

  const summary = [];
  const toScore = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const rec of records) {
      const { round, season = SEASON, predictions } = rec;
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

router.get('/export', requireLeagueAdmin, async (req, res) => {
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
    JOIN league_members m ON m.user_id = p.user_id AND m.league_id = $2
    LEFT JOIN race_scores s
      ON s.user_id = p.user_id AND s.race_round = p.race_round AND s.season = p.season AND s.league_id = $2
    WHERE p.season = $1
    ORDER BY p.race_round, u.username
  `, [SEASON, req.league.id]);
  res.json(rows);
});

// ── Score Override ──────────────────────────────────────────────────────────

router.post('/scores/override', requireLeagueAdmin, async (req, res) => {
  const records = req.body;
  if (!Array.isArray(records) || records.length === 0)
    return res.status(400).json({ error: 'Body must be a non-empty JSON array' });

  const summary = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const rec of records) {
      const round  = parseInt(rec.round);
      const season = parseInt(rec.season || SEASON);
      const points = parseInt(rec.points);
      if (!round || isNaN(round)) throw new Error(`Invalid round: ${rec.round}`);
      if (isNaN(points)) throw new Error(`Round ${round}: invalid points for "${rec.username}"`);

      let entry = summary.find(s => s.round === round && s.season === season);
      if (!entry) { entry = { round, season, written: 0, skipped: [] }; summary.push(entry); }

      // Only members of this league can be given points in it.
      const { rows: [user] } = await client.query(`
        SELECT u.id FROM users u JOIN league_members m ON m.user_id = u.id AND m.league_id = $2
        WHERE u.username = $1
      `, [(rec.username || '').toLowerCase(), req.league.id]);
      if (!user) { entry.skipped.push(rec.username || '?'); continue; }

      await client.query(`
        INSERT INTO race_scores (league_id, user_id, race_round, season, points_total, breakdown, scored_at)
        VALUES ($5, $1, $2, $3, $4, '{"override":true}', NOW())
        ON CONFLICT (league_id, user_id, race_round, season) DO UPDATE SET
          points_total = EXCLUDED.points_total,
          breakdown    = EXCLUDED.breakdown,
          scored_at    = EXCLUDED.scored_at
      `, [user.id, round, season, points, req.league.id]);
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

router.get('/overview', requireLeagueAdmin, async (req, res) => {
  const [r1, r2, r3] = await Promise.all([
    pool.query('SELECT COUNT(*)::int as c FROM league_members WHERE league_id = $1 AND is_active = 1', [req.league.id]),
    pool.query(`
      SELECT COUNT(*)::int as c FROM predictions p
      JOIN league_members m ON m.user_id = p.user_id AND m.league_id = $2 AND m.is_active = 1
      WHERE p.season = $1
    `, [SEASON, req.league.id]),
    pool.query(
      'SELECT COUNT(DISTINCT race_round)::int as c FROM race_scores WHERE season = $1 AND league_id = $2',
      [SEASON, req.league.id]
    ),
  ]);
  res.json({
    userCount:    r1.rows[0].c,
    predCount:    r2.rows[0].c,
    scoredRounds: r3.rows[0].c,
  });
});

module.exports = router;
