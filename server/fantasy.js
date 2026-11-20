const pool = require('./db');
const openf1 = require('./openf1');
const { SEASON } = require('./config');

// ── The rules, in one place ──────────────────────────────────────────────────

const RACE_POINTS   = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

const RULES = {
  driverCap: 3,        // times one driver can be picked in a season
  teamCap: 4,          // times one team can be picked in a season
  boostPerSeason: 2,
  netPerSeason: 1,
  pole: 5,
  fastestLap: 5,
  dnf: -10,
  bothInPoints: 5,
  fastestPit: 5,
};

const POWERUPS = ['boost', 'net'];

// Scoreboard points for 1st, 2nd, … in the league's weekend ranking. Small leagues pay
// fewer places so that not almost everyone scores.
function payoutFor(memberCount) {
  return memberCount >= 8 ? [5, 4, 3, 2, 1] : [3, 2, 1];
}

// ── Scoring one pick ─────────────────────────────────────────────────────────

// pick: { driver, team, powerup }. result: the stored race result. stats: the round's
// fantasy_race_stats (any part of it may be missing if OpenF1 didn't have it).
// Returns { score, breakdown } where breakdown lists each line that scored.
function scoreFantasyPick(pick, result, stats = {}) {
  const finish = result.finishOrder || [];
  const dnfs = result.dnfs || [];
  const net = pick.powerup === 'net';
  const lines = [];
  // The safety net turns a negative line into zero but keeps it visible.
  const add = (side, key, pts, extra = {}) => {
    const saved = net && pts < 0;
    lines.push({ side, key, pts: saved ? 0 : pts, ...(saved ? { saved: pts } : {}), ...extra });
  };
  const racePoints = code => {
    const i = finish.indexOf(code);
    return i === -1 || dnfs.includes(code) ? 0 : (RACE_POINTS[i] || 0);
  };

  // Driver
  const d = pick.driver;
  const pos = finish.indexOf(d) + 1; // 0 = not classified
  if (dnfs.includes(d)) {
    add('driver', 'dnf', RULES.dnf);
  } else if (pos) {
    add('driver', 'race_finish', RACE_POINTS[pos - 1] || 0, { pos });
    const grid = stats.grid?.[d];
    if (grid && grid !== pos) add('driver', 'grid_delta', grid - pos, { from: grid, to: pos });
  }
  const sprintPos = (result.sprintFinishOrder || []).indexOf(d) + 1;
  if (sprintPos && SPRINT_POINTS[sprintPos - 1] && !(result.sprintDnfs || []).includes(d)) {
    add('driver', 'sprint_finish', SPRINT_POINTS[sprintPos - 1], { pos: sprintPos });
  }
  if (result.pole === d) add('driver', 'pole', RULES.pole);
  if (stats.fastestLap === d) add('driver', 'fastest_lap', RULES.fastestLap);

  // Team: needs to know who drove for it that weekend.
  const cars = Object.keys(stats.teams || {}).filter(code => stats.teams[code] === pick.team);
  if (cars.length) {
    const raw = cars.reduce((sum, code) => sum + racePoints(code), 0);
    const positions = cars.map(code => finish.indexOf(code) + 1).filter(Boolean).sort((a, b) => a - b);
    add('team', 'team_points', Math.ceil(raw / 2), { raw, positions });
    if (cars.length >= 2 && cars.every(code => racePoints(code) > 0)) add('team', 'both_in_points', RULES.bothInPoints);
    if (stats.fastestPit?.team === pick.team) add('team', 'fastest_pit', RULES.fastestPit, { seconds: stats.fastestPit.seconds });
  }

  const sum = side => lines.filter(l => l.side === side).reduce((s, l) => s + l.pts, 0);
  const boosted = pick.powerup === 'boost';
  const driver = sum('driver') * (boosted ? 2 : 1);
  const team = sum('team');
  return {
    score: driver + team,
    breakdown: { lines, driver, team, powerup: pick.powerup || null, teamKnown: cars.length > 0 },
  };
}

// Competition ranking with the payout: equal scores share a place and the next place
// is skipped (1, 2, 2, 4). entries: [{ score, … }] → same objects with rank and bonus.
function rankEntries(entries, payout) {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  sorted.forEach((e, i) => {
    e.rank = i > 0 && e.score === sorted[i - 1].score ? sorted[i - 1].rank : i + 1;
    e.bonus = payout[e.rank - 1] || 0;
  });
  return sorted;
}

// ── Usage, validation, carry-over ────────────────────────────────────────────

// How often a person has used each driver, team and powerup this season, not counting
// one round (the one being edited).
async function usage(userId, season, exceptRound, db = pool) {
  const { rows } = await db.query(
    'SELECT driver, team, powerup FROM fantasy_picks WHERE user_id = $1 AND season = $2 AND race_round <> $3',
    [userId, season, exceptRound]
  );
  const use = { drivers: {}, teams: {}, boost: 0, net: 0 };
  for (const r of rows) {
    use.drivers[r.driver] = (use.drivers[r.driver] || 0) + 1;
    use.teams[r.team] = (use.teams[r.team] || 0) + 1;
    if (r.powerup) use[r.powerup]++;
  }
  return use;
}

// Driver code → team name for the current grid, or null if OpenF1 can't be reached.
async function currentTeams() {
  try {
    const drivers = await openf1.getDrivers(await openf1.getLatestSessionKey(SEASON));
    return drivers.length ? Object.fromEntries(drivers.map(d => [d.name_acronym, d.team_name])) : null;
  } catch {
    return null;
  }
}

// Returns an error message, or null if the pick is allowed. teams is currentTeams()
// (null skips the checks that need the grid).
function validatePick(body, teams, use) {
  const { driver, team, powerup } = body;
  if (typeof driver !== 'string' || !/^[A-Z]{3}$/.test(driver)) return 'Pick a driver';
  if (typeof team !== 'string' || !team.trim() || team.length > 80) return 'Pick a team';
  if (powerup != null && !POWERUPS.includes(powerup)) return 'Unknown powerup';
  if (teams) {
    if (!teams[driver]) return 'Unknown driver';
    if (!Object.values(teams).includes(team)) return 'Unknown team';
    if (teams[driver] === team) return "Your driver can't be from the team you picked";
  }
  if ((use.drivers[driver] || 0) >= RULES.driverCap) return `You've already used ${driver} ${RULES.driverCap} times this season`;
  if ((use.teams[team] || 0) >= RULES.teamCap) return `You've already used ${team} ${RULES.teamCap} times this season`;
  if (powerup === 'boost' && use.boost >= RULES.boostPerSeason) return 'No Boosts left this season';
  if (powerup === 'net' && use.net >= RULES.netPerSeason) return 'No Safety net left this season';
  return null;
}

// The pick that carries into a round when the person hasn't chosen one: their most
// recent earlier pick, as long as the season caps still allow it. Powerups don't carry.
async function carryFor(userId, round, season, db = pool) {
  const { rows: [prev] } = await db.query(`
    SELECT driver, team, race_round FROM fantasy_picks
    WHERE user_id = $1 AND season = $2 AND race_round < $3
    ORDER BY race_round DESC LIMIT 1
  `, [userId, season, round]);
  if (!prev) return null;
  const use = await usage(userId, season, round, db);
  if ((use.drivers[prev.driver] || 0) >= RULES.driverCap) return null;
  if ((use.teams[prev.team] || 0) >= RULES.teamCap) return null;
  return { driver: prev.driver, team: prev.team, powerup: null, carried: true, from: prev.race_round };
}

// Once a round is locked, carried picks become real rows so they count towards the caps.
async function materialiseCarries(round, season, userIds, db = pool) {
  if (!userIds.length) return;
  const { rows } = await db.query(
    'SELECT user_id FROM fantasy_picks WHERE race_round = $1 AND season = $2 AND user_id = ANY($3)',
    [round, season, userIds]
  );
  const has = new Set(rows.map(r => r.user_id));
  for (const userId of userIds) {
    if (has.has(userId)) continue;
    const carry = await carryFor(userId, round, season, db);
    if (!carry) continue;
    await db.query(`
      INSERT INTO fantasy_picks (user_id, race_round, season, driver, team, carried)
      VALUES ($1, $2, $3, $4, $5, 1) ON CONFLICT DO NOTHING
    `, [userId, round, season, carry.driver, carry.team]);
  }
}

// ── Race stats ───────────────────────────────────────────────────────────────

async function loadStats(round, season, db = pool) {
  const { rows: [row] } = await db.query(
    'SELECT stats_json FROM fantasy_race_stats WHERE race_round = $1 AND season = $2', [round, season]
  );
  return row ? JSON.parse(row.stats_json) : {};
}

async function anyLeagueEnabled() {
  const { rows: [row] } = await pool.query('SELECT 1 FROM leagues WHERE fantasy_enabled = 1 LIMIT 1');
  return !!row;
}

// Fetches a round's stats from OpenF1 and saves them. Parts OpenF1 couldn't supply keep
// their previously saved value. Never throws: fantasy then scores on what it has.
async function refreshStats(race, season = SEASON) {
  try {
    if (!(await anyLeagueEnabled())) return;
    const fresh = await openf1.buildFantasyStats(race);
    const stats = { ...(await loadStats(race.round, season)), ...fresh };
    await pool.query(`
      INSERT INTO fantasy_race_stats (race_round, season, stats_json, updated_at) VALUES ($1, $2, $3, NOW())
      ON CONFLICT (race_round, season) DO UPDATE SET stats_json = EXCLUDED.stats_json, updated_at = NOW()
    `, [race.round, season, JSON.stringify(stats)]);
  } catch (err) {
    console.warn(`[fantasy] R${race.round} stats not saved: ${err.message}`);
  }
}

// ── Scoring a round ──────────────────────────────────────────────────────────

// Scores a round's picks in every league with fantasy on (or just one). Each league
// ranks its own active members who have a pick.
async function scoreFantasyRound(round, season, result, leagueId = null) {
  if (!result || !result.finishOrder) return;
  const { rows: members } = await pool.query(`
    SELECT m.league_id, m.user_id
    FROM league_members m
    JOIN leagues l ON l.id = m.league_id AND l.fantasy_enabled = 1
    JOIN users u ON u.id = m.user_id AND u.is_active = 1
    WHERE m.is_active = 1 AND ($1::int IS NULL OR m.league_id = $1)
  `, [leagueId]);
  if (!members.length) return;

  const stats = await loadStats(round, season);
  const userIds = [...new Set(members.map(m => m.user_id))];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await materialiseCarries(round, season, userIds, client);
    const { rows: picks } = await client.query(
      'SELECT * FROM fantasy_picks WHERE race_round = $1 AND season = $2 AND user_id = ANY($3)',
      [round, season, userIds]
    );
    const scored = new Map(picks.map(p => [p.user_id, scoreFantasyPick(p, result, stats)]));

    const byLeague = new Map();
    for (const m of members) {
      if (!byLeague.has(m.league_id)) byLeague.set(m.league_id, []);
      byLeague.get(m.league_id).push(m.user_id);
    }
    for (const [league, ids] of byLeague) {
      const entries = ids.filter(id => scored.has(id)).map(id => ({ userId: id, ...scored.get(id) }));
      rankEntries(entries, payoutFor(ids.length));
      for (const e of entries) {
        await client.query(`
          INSERT INTO fantasy_scores (league_id, user_id, race_round, season, score, rank, bonus_points, breakdown, scored_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (league_id, user_id, race_round, season) DO UPDATE SET
            score = EXCLUDED.score, rank = EXCLUDED.rank, bonus_points = EXCLUDED.bonus_points,
            breakdown = EXCLUDED.breakdown, scored_at = EXCLUDED.scored_at
        `, [league, e.userId, round, season, e.score, e.rank, e.bonus, JSON.stringify(e.breakdown)]);
      }
      // Drop scores for people who no longer count (left the league, pick removed).
      await client.query(`
        DELETE FROM fantasy_scores
        WHERE league_id = $1 AND race_round = $2 AND season = $3 AND NOT (user_id = ANY($4))
      `, [league, round, season, entries.map(e => e.userId)]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  RULES, RACE_POINTS, SPRINT_POINTS, POWERUPS, payoutFor,
  scoreFantasyPick, rankEntries, usage, currentTeams, validatePick, carryFor,
  materialiseCarries, loadStats, refreshStats, scoreFantasyRound,
};
