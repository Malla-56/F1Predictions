const cron = require('node-cron');
const db = require('./db');
const openf1 = require('./openf1');
const { scoreRound } = require('./scorer');

const SEASON = 2026;

// Upsert a result and score it.
function saveAndScore(round, result) {
  db.prepare(`
    INSERT INTO race_results (race_round, season, result_json, source, updated_at)
    VALUES (?, ?, ?, 'openf1', CURRENT_TIMESTAMP)
    ON CONFLICT(race_round, season) DO UPDATE SET
      result_json = excluded.result_json,
      source      = excluded.source,
      updated_at  = excluded.updated_at
  `).run(round, SEASON, JSON.stringify(result));
  scoreRound(round, SEASON, result);
}

// Fetch results for all past rounds that don't yet have a stored result.
async function fetchPendingResults() {
  console.log('[scheduler] checking for pending race results…');
  try {
    const meetings = await openf1.getMeetings(SEASON);
    const sorted = meetings
      .filter(m => m.meeting_key && m.circuit_short_name && !m.meeting_name?.toLowerCase().includes('testing'))
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

    const stored = new Set(
      db.prepare('SELECT race_round FROM race_results WHERE season = ?').all(SEASON).map(r => r.race_round)
    );

    const now = Date.now();
    let fetched = 0;

    for (let i = 0; i < sorted.length; i++) {
      const round = i + 1;
      if (stored.has(round)) continue;                          // already have it
      if (new Date(sorted[i].date_start).getTime() > now) break; // future rounds

      try {
        const result = await openf1.fetchAndBuildResult(round, SEASON);
        saveAndScore(round, result);
        console.log(`[scheduler] R${round} fetched and scored ✓`);
        fetched++;
      } catch (err) {
        // Result not available yet (race in progress or data lag) — try next run
        console.warn(`[scheduler] R${round} not ready: ${err.message}`);
      }
    }

    if (fetched === 0) console.log('[scheduler] nothing new to fetch');
    return fetched;
  } catch (err) {
    console.error('[scheduler] error:', err.message);
    return 0;
  }
}

// Run daily at 14:00 UTC — covers Sunday races that typically finish by ~13:00 UTC
cron.schedule('0 14 * * *', fetchPendingResults);

// Also attempt once on startup to catch up if the server was restarted
setTimeout(fetchPendingResults, 5000);

module.exports = { fetchPendingResults, saveAndScore };
