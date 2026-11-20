const pool = require('./db');
const { getRace } = require('./calendar');
const { sendToUser, ensureConfigured } = require('./push');
const { SEASON } = require('./config');

// Only notify for a race that has just happened, never for an old round being back-filled.
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

const shortName = name => (name || '').replace(/Grand Prix/i, 'GP').trim();
const pts = n => `${n} pt${n === 1 ? '' : 's'}`;

// Pushes "🏁 Mexico City GP scored: you got 21 pts" to everyone who tipped the round.
// Someone in several leagues gets one message listing each league's score.
// Call once, when a round gets its first result.
async function notifyRoundScored(round) {
  if (!ensureConfigured()) return 0;
  const race = await getRace(round, SEASON);
  if (!race || Date.now() - race.raceEnd.getTime() > RECENT_MS) return 0;

  const { rows: scores } = await pool.query(`
    SELECT rs.user_id, rs.points_total, l.name AS league_name
    FROM race_scores rs
    JOIN users u ON u.id = rs.user_id
    JOIN leagues l ON l.id = rs.league_id
    JOIN league_members m ON m.user_id = rs.user_id AND m.league_id = rs.league_id AND m.is_active = 1
    WHERE rs.race_round = $1 AND rs.season = $2 AND u.is_active = 1
    ORDER BY m.joined_at, l.id
  `, [round, SEASON]);

  const byUser = new Map();
  for (const s of scores) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id).push(s);
  }

  let notified = 0;
  for (const [userId, leagues] of byUser) {
    const summary = leagues.length === 1
      ? `you got ${pts(leagues[0].points_total)}`
      : leagues.map(l => `${l.league_name} ${pts(l.points_total)}`).join(' · ');
    const delivered = await sendToUser(userId, {
      title: `🏁 ${shortName(race.meeting.meeting_name)} scored: ${summary}`,
      url: '/results',
      tag: `results-${SEASON}-${round}`,
    });
    if (delivered > 0) notified++;
  }
  console.log(`[results] R${round}: notified ${notified} of ${byUser.size} player(s)`);
  return notified;
}

module.exports = { notifyRoundScored };
