const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const { requireLeague } = require('../middleware/league');
const parseRound = require('../middleware/round');
const { isRaceLocked } = require('../calendar');
const { SEASON } = require('../config');
const fantasy = require('../fantasy');

const router = express.Router();
router.param('round', parseRound);
router.use(requireAuth, requireLeague, (req, res, next) => {
  if (!req.league.fantasy) return res.status(403).json({ error: "Fantasy isn't switched on for this league" });
  next();
});

async function memberCount(leagueId) {
  const { rows: [{ c }] } = await pool.query(`
    SELECT COUNT(*)::int AS c FROM league_members m JOIN users u ON u.id = m.user_id
    WHERE m.league_id = $1 AND m.is_active = 1 AND u.is_active = 1
  `, [leagueId]);
  return c;
}

// My pick for a round (my own, or the one that will carry over), with what I have left
// to use this season and what the weekend is worth in this league.
router.get('/:round/mine', async (req, res) => {
  const { rows: [own] } = await pool.query(
    'SELECT driver, team, powerup, carried FROM fantasy_picks WHERE user_id = $1 AND race_round = $2 AND season = $3',
    [req.user.id, req.round, SEASON]
  );
  const carry = own ? null : await fantasy.carryFor(req.user.id, req.round, SEASON);
  const use = await fantasy.usage(req.user.id, SEASON, req.round);

  res.json({
    locked: await isRaceLocked(req.round, SEASON),
    pick: own
      ? { driver: own.driver, team: own.team, powerup: own.powerup, carried: own.carried === 1 }
      : carry && { driver: carry.driver, team: carry.team, powerup: null, carried: true },
    saved: !!own,
    uses: { drivers: use.drivers, teams: use.teams },
    powerups: {
      boost: Math.max(0, fantasy.RULES.boostPerSeason - use.boost),
      net: Math.max(0, fantasy.RULES.netPerSeason - use.net),
    },
    caps: { driver: fantasy.RULES.driverCap, team: fantasy.RULES.teamCap },
    payout: fantasy.payoutFor(await memberCount(req.league.id)),
  });
});

// Save my pick for a round. Locks with tips.
router.post('/:round', async (req, res) => {
  if (await isRaceLocked(req.round, SEASON)) {
    return res.status(403).json({ error: 'Fantasy picks are locked for this race' });
  }
  const body = req.body || {};
  const use = await fantasy.usage(req.user.id, SEASON, req.round);
  const error = fantasy.validatePick(body, await fantasy.currentTeams(), use);
  if (error) return res.status(400).json({ error });

  await pool.query(`
    INSERT INTO fantasy_picks (user_id, race_round, season, driver, team, powerup, carried, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, 0, NOW())
    ON CONFLICT (user_id, race_round, season) DO UPDATE SET
      driver = EXCLUDED.driver, team = EXCLUDED.team, powerup = EXCLUDED.powerup, carried = 0, updated_at = NOW()
  `, [req.user.id, req.round, SEASON, body.driver, body.team, body.powerup || null]);
  res.json({ ok: true });
});

// The league's fantasy weekend. Other people's picks stay hidden until the round locks;
// scores, ranks and scoreboard points appear once the round has been scored.
router.get('/:round', async (req, res) => {
  const locked = await isRaceLocked(req.round, SEASON);
  const { rows: members } = await pool.query(`
    SELECT u.id, u.display_name
    FROM league_members m JOIN users u ON u.id = m.user_id
    WHERE m.league_id = $1 AND m.is_active = 1 AND u.is_active = 1
  `, [req.league.id]);
  const ids = members.map(m => m.id);

  // From lock onwards a carried pick is final, so store it.
  if (locked) await fantasy.materialiseCarries(req.round, SEASON, ids);

  const { rows: picks } = await pool.query(
    'SELECT * FROM fantasy_picks WHERE race_round = $1 AND season = $2 AND user_id = ANY($3)',
    [req.round, SEASON, ids]
  );
  const { rows: scores } = await pool.query(
    'SELECT * FROM fantasy_scores WHERE league_id = $1 AND race_round = $2 AND season = $3',
    [req.league.id, req.round, SEASON]
  );
  const pickBy = new Map(picks.map(p => [p.user_id, p]));
  const scoreBy = new Map(scores.map(s => [s.user_id, s]));
  const stats = await fantasy.loadStats(req.round, SEASON);

  const entries = members.map(m => {
    const pick = pickBy.get(m.id);
    const score = scoreBy.get(m.id);
    const isMe = m.id === req.user.id;
    const reveal = pick && (locked || isMe);
    return {
      userId: m.id,
      displayName: m.display_name,
      isMe,
      hasPick: !!pick,
      ...(reveal ? { driver: pick.driver, team: pick.team, powerup: pick.powerup, carried: pick.carried === 1 } : {}),
      ...(score ? { score: score.score, rank: score.rank, bonus: score.bonus_points, breakdown: JSON.parse(score.breakdown) } : {}),
    };
  });
  // Ranked first, then people with an unscored pick, then people without one.
  entries.sort((a, b) =>
    (a.rank ?? 999) - (b.rank ?? 999) || Number(b.hasPick) - Number(a.hasPick) || a.displayName.localeCompare(b.displayName));

  res.json({
    locked,
    scored: scores.length > 0,
    payout: fantasy.payoutFor(members.length),
    entries,
    overtakes: stats.overtakes || null,
    teams: stats.teams || null,
  });
});

module.exports = router;
