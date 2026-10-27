const pool = require('./db');
const openf1 = require('./openf1');
const { SEASON } = require('./config');

// Round numbers are pinned to OpenF1 meeting keys in race_rounds the first time a
// meeting is seen. Previously the round was just the meeting's index in date order,
// so OpenF1 adding or dropping a meeting mid-season shifted every later round onto
// the wrong race (predictions and results are stored by round).

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS race_rounds (
      season      INTEGER NOT NULL,
      round       INTEGER NOT NULL,
      meeting_key INTEGER NOT NULL,
      PRIMARY KEY (season, round),
      UNIQUE (season, meeting_key)
    )
  `);
  tableReady = true;
}

const roundCache = new Map(); // season → Map(meeting_key → round)

function isGrandPrix(m) {
  return m.meeting_key && m.circuit_short_name && !m.meeting_name?.toLowerCase().includes('testing');
}

async function loadRounds(season) {
  const { rows } = await pool.query('SELECT round, meeting_key FROM race_rounds WHERE season = $1', [season]);
  return new Map(rows.map(r => [r.meeting_key, r.round]));
}

// meetings must already be sorted by date
async function roundsFor(meetings, season) {
  const cached = roundCache.get(season);
  if (cached && meetings.every(m => cached.has(m.meeting_key))) return cached;

  await ensureTable();
  let map = await loadRounds(season);

  if (map.size === 0) {
    // First run: seed with the date-order numbering the app has always used, so rounds
    // already stored in predictions/results keep pointing at the same races.
    const params = meetings.flatMap((m, i) => [season, i + 1, m.meeting_key]);
    const values = meetings.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
    if (meetings.length) {
      await pool.query(`INSERT INTO race_rounds (season, round, meeting_key) VALUES ${values} ON CONFLICT DO NOTHING`, params);
    }
  } else {
    // Meetings added later get the next free round number instead of renumbering.
    for (const m of meetings) {
      if (map.has(m.meeting_key)) continue;
      await pool.query(`
        INSERT INTO race_rounds (season, round, meeting_key)
        SELECT $1, COALESCE(MAX(round), 0) + 1, $2 FROM race_rounds WHERE season = $1
        ON CONFLICT DO NOTHING
      `, [season, m.meeting_key]);
    }
  }

  map = await loadRounds(season);
  roundCache.set(season, map);
  return map;
}

function sessionNamed(sessions, name) {
  return sessions.find(s => s.session_name === name && !s.is_cancelled) || null;
}

// The season's Grands Prix in date order, each with its round, key sessions and lock state.
async function getCalendar(season = SEASON) {
  const [meetings, sessions, { rows: configs }] = await Promise.all([
    openf1.getMeetings(season),
    openf1.getSeasonSessions(season),
    pool.query('SELECT * FROM race_config WHERE season = $1', [season]),
  ]);

  const sorted = meetings
    .filter(isGrandPrix)
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
  const rounds = await roundsFor(sorted, season);
  const configMap = Object.fromEntries(configs.map(c => [c.race_round, c]));
  const now = new Date();

  return sorted
    .filter(m => rounds.has(m.meeting_key))
    .map(m => {
      const round = rounds.get(m.meeting_key);
      const cfg = configMap[round] || {};
      const own = sessions.filter(s => s.meeting_key === m.meeting_key);
      const race = sessionNamed(own, 'Race');
      const lockTime = cfg.lock_time ? new Date(cfg.lock_time) : new Date(m.date_start);
      return {
        round,
        meeting: m,
        cfg,
        sessions: {
          race,
          qualifying: sessionNamed(own, 'Qualifying'),
          sprint: sessionNamed(own, 'Sprint'),
        },
        weekendStart: new Date(m.date_start),
        raceEnd: new Date(race?.date_end || m.date_end || m.date_start),
        lockTime,
        isLocked: cfg.manually_locked === 1 || now >= lockTime,
        isSprint: own.some(s => s.session_name === 'Sprint') || cfg.is_sprint === 1,
        isCancelled: cfg.cancelled === 1 || !!m.is_cancelled,
      };
    });
}

async function getRace(round, season = SEASON) {
  const calendar = await getCalendar(season);
  return calendar.find(r => r.round === round) || null;
}

// Single source of truth for whether tips can still be changed. Unknown or cancelled
// rounds count as locked. If OpenF1 is unreachable, fall back to the admin-set lock.
async function isRaceLocked(round, season = SEASON) {
  try {
    const race = await getRace(round, season);
    return !race || race.isCancelled || race.isLocked;
  } catch (err) {
    console.warn(`[calendar] falling back to race_config lock for R${round}: ${err.message}`);
    const { rows: [cfg] } = await pool.query(
      'SELECT * FROM race_config WHERE race_round = $1 AND season = $2', [round, season]
    );
    if (!cfg || !cfg.lock_time) throw new Error('Race calendar is unavailable — please try again shortly');
    return cfg.manually_locked === 1 || cfg.cancelled === 1 || new Date() >= new Date(cfg.lock_time);
  }
}

module.exports = { getCalendar, getRace, isRaceLocked };
