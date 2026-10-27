const pool = require('./db');
const { getRace } = require('./calendar');
const { sendToUser, ensureConfigured } = require('./push');
const { SEASON } = require('./config');

// Only notify for a race that has just happened, never for an old round being back-filled.
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

const shortName = name => (name || '').replace(/Grand Prix/i, 'GP').trim();

// Pushes "🏁 Mexico City GP scored: you got 21 pts" to everyone who tipped the round.
// Call once, when a round gets its first result.
async function notifyRoundScored(round) {
  if (!ensureConfigured()) return 0;
  const race = await getRace(round, SEASON);
  if (!race || Date.now() - race.raceEnd.getTime() > RECENT_MS) return 0;

  const { rows: scores } = await pool.query(`
    SELECT rs.user_id, rs.points_total
    FROM race_scores rs JOIN users u ON u.id = rs.user_id
    WHERE rs.race_round = $1 AND rs.season = $2 AND u.is_active = 1
  `, [round, SEASON]);

  let notified = 0;
  for (const s of scores) {
    const pts = s.points_total;
    const delivered = await sendToUser(s.user_id, {
      title: `🏁 ${shortName(race.meeting.meeting_name)} scored: you got ${pts} pt${pts === 1 ? '' : 's'}`,
      url: '/results',
      tag: `results-${SEASON}-${round}`,
    });
    if (delivered > 0) notified++;
  }
  console.log(`[results] R${round}: notified ${notified} of ${scores.length} player(s)`);
  return notified;
}

module.exports = { notifyRoundScored };
