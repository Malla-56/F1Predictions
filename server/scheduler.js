const pool = require('./db');
const openf1 = require('./openf1');
const { scoreRound } = require('./scorer');

const SEASON = 2026;

async function saveAndScore(round, result) {
  await pool.query(`
    INSERT INTO race_results (race_round, season, result_json, source, updated_at)
    VALUES ($1, $2, $3, 'openf1', NOW())
    ON CONFLICT (race_round, season) DO UPDATE SET
      result_json = EXCLUDED.result_json,
      source      = EXCLUDED.source,
      updated_at  = EXCLUDED.updated_at
  `, [round, SEASON, JSON.stringify(result)]);
  await scoreRound(round, SEASON, result);
}

async function fetchPendingResults() {
  console.log('[scheduler] checking for pending race results…');
  try {
    const meetings = await openf1.getMeetings(SEASON);
    const sorted = meetings
      .filter(m => m.meeting_key && m.circuit_short_name && !m.meeting_name?.toLowerCase().includes('testing'))
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

    const { rows } = await pool.query(
      'SELECT race_round FROM race_results WHERE season = $1',
      [SEASON]
    );
    const stored = new Set(rows.map(r => r.race_round));

    const now = Date.now();
    let fetched = 0;
    const errors = [];

    for (let i = 0; i < sorted.length; i++) {
      const round = i + 1;
      if (stored.has(round)) continue;
      if (new Date(sorted[i].date_start).getTime() > now) break;
      // Skip (don't filter) cancelled meetings so stored round numbers stay aligned.
      if (sorted[i].is_cancelled) continue;

      try {
        const result = await openf1.fetchAndBuildResult(round, SEASON);
        await saveAndScore(round, result);
        console.log(`[scheduler] R${round} fetched and scored ✓`);
        fetched++;
      } catch (err) {
        console.warn(`[scheduler] R${round} not ready: ${err.message}`);
        errors.push({ round, error: err.message });
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
