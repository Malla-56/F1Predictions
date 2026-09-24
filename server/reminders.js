const pool = require('./db');
const openf1 = require('./openf1');
const { sendToUser } = require('./push');

const SEASON = 2026;
const HOUR = 60 * 60 * 1000;

// Finds races whose tips close within the next 48h and pushes a reminder to
// every user who hasn't tipped yet: once in the 24–48h window ("2 days") and
// once in the 0–24h window ("1 day"). Designed to run from a once-daily cron.
async function sendTipReminders() {
  const meetings = await openf1.getMeetings(SEASON);
  const sorted = meetings
    .filter(m => m.meeting_key && m.circuit_short_name && !m.meeting_name?.toLowerCase().includes('testing'))
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

  const { rows: configs } = await pool.query('SELECT * FROM race_config WHERE season = $1', [SEASON]);
  const configMap = Object.fromEntries(configs.map(c => [c.race_round, c]));

  const now = Date.now();
  let sent = 0;

  for (let i = 0; i < sorted.length; i++) {
    const round = i + 1;
    const m = sorted[i];
    const cfg = configMap[round] || {};
    if (cfg.cancelled === 1 || cfg.manually_locked === 1) continue;

    const lockTime = new Date(cfg.lock_time || m.date_start).getTime();
    const hoursLeft = (lockTime - now) / HOUR;
    if (hoursLeft <= 0 || hoursLeft > 48) continue;
    const daysBefore = hoursLeft <= 24 ? 1 : 2;

    const { rows: users } = await pool.query(`
      SELECT DISTINCT u.id
      FROM users u
      JOIN push_subscriptions ps ON ps.user_id = u.id
      WHERE u.is_active = 1
        AND NOT EXISTS (SELECT 1 FROM predictions p
                        WHERE p.user_id = u.id AND p.race_round = $1 AND p.season = $2)
        AND NOT EXISTS (SELECT 1 FROM tip_reminders_sent r
                        WHERE r.user_id = u.id AND r.race_round = $1 AND r.season = $2 AND r.days_before = $3)
    `, [round, SEASON, daysBefore]);

    const hours = Math.round(hoursLeft);
    const payload = {
      title: `${m.meeting_name} — tips close ${daysBefore === 1 ? 'tomorrow' : 'in 2 days'}`,
      body: `You haven't entered your tips yet. About ${hours}h left before they lock.`,
      url: `/predict/${round}`,
      tag: `tip-reminder-${SEASON}-${round}`,
    };

    for (const u of users) {
      const delivered = await sendToUser(u.id, payload);
      if (delivered > 0) {
        await pool.query(`
          INSERT INTO tip_reminders_sent (user_id, race_round, season, days_before)
          VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
        `, [u.id, round, SEASON, daysBefore]);
        sent++;
      }
    }
    console.log(`[reminders] R${round} (${daysBefore}d): notified ${users.length} user(s)`);
  }

  return sent;
}

module.exports = { sendTipReminders };
