const pool = require('./db');
const openf1 = require('./openf1');
const { getCalendar } = require('./calendar');
const { scoreRound } = require('./scorer');
const { notifyRoundScored } = require('./resultsNotify');
const { SEASON } = require('./config');

const HOUR = 60 * 60 * 1000;
// Don't read a classification until the race has been over for a while…
const SETTLE_MS = 1 * HOUR;
// …and keep refreshing it for a few days to pick up stewards' penalties.
const REFRESH_WINDOW_MS = 4 * 24 * HOUR;

// Stores a round's result and scores it. The first time a round gets a result, players
// are notified of their score; later refreshes (penalties, manual fixes) stay silent.
async function saveAndScore(round, result, source = 'openf1') {
  const { rows: [{ is_new: isNew }] } = await pool.query(`
    WITH prev AS (SELECT 1 FROM race_results WHERE race_round = $1 AND season = $2)
    INSERT INTO race_results (race_round, season, result_json, source, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (race_round, season) DO UPDATE SET
      result_json = EXCLUDED.result_json,
      source      = EXCLUDED.source,
      updated_at  = EXCLUDED.updated_at
    RETURNING NOT EXISTS (SELECT 1 FROM prev) AS is_new
  `, [round, SEASON, JSON.stringify(result), source]);
  await scoreRound(round, SEASON, result);

  if (isNew) {
    try {
      await notifyRoundScored(round);
    } catch (err) {
      console.warn(`[results] R${round} notification failed: ${err.message}`);
    }
  }
}

async function fetchPendingResults() {
  console.log('[scheduler] checking for pending race results…');
  try {
    const calendar = await getCalendar(SEASON);
    const { rows } = await pool.query(
      'SELECT race_round, source FROM race_results WHERE season = $1',
      [SEASON]
    );
    const stored = new Map(rows.map(r => [r.race_round, r.source]));

    const now = Date.now();
    let fetched = 0;
    const errors = [];

    for (const race of calendar) {
      if (race.isCancelled || !race.sessions.race) continue;
      const sinceEnd = now - race.raceEnd.getTime();
      if (sinceEnd < SETTLE_MS) continue;
      // Manually entered results are never overwritten; OpenF1 ones are refreshed for a few days.
      const source = stored.get(race.round);
      if (source === 'manual') continue;
      if (source && sinceEnd > REFRESH_WINDOW_MS) continue;

      try {
        const result = await openf1.buildResult(race);
        await saveAndScore(race.round, result);
        console.log(`[scheduler] R${race.round} fetched and scored ✓`);
        fetched++;
      } catch (err) {
        console.warn(`[scheduler] R${race.round} not ready: ${err.message}`);
        errors.push({ round: race.round, error: err.message });
      }
    }

    if (fetched === 0) console.log('[scheduler] nothing new to fetch');
    return { fetched, errors };
  } catch (err) {
    console.error('[scheduler] error:', err.message);
    return { fetched: 0, errors: [{ round: null, error: err.message }] };
  }
}

module.exports = { fetchPendingResults, saveAndScore };
