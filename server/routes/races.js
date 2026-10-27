const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const { getCalendar } = require('../calendar');
const { SEASON } = require('../config');

const router = express.Router();

// A race stays "current" (race weekend) until this long after the chequered flag;
// after that a race with no stored result is "awaiting" so it can't block the next one.
const RACE_DAY_WINDOW_MS = 36 * 60 * 60 * 1000;

router.get('/', requireAuth, async (req, res) => {
  try {
    const [calendar, { rows: resultRows }] = await Promise.all([
      getCalendar(SEASON),
      pool.query('SELECT race_round FROM race_results WHERE season = $1', [SEASON]),
    ]);
    const roundsWithResults = new Set(resultRows.map(r => r.race_round));
    const now = new Date();

    res.json(calendar.map(r => {
      const hasResult = roundsWithResults.has(r.round);

      let status;
      if (hasResult)                                     status = 'done';
      else if (r.isLocked && now >= r.weekendStart)
        status = now - r.raceEnd < RACE_DAY_WINDOW_MS ? 'current' : 'awaiting';
      else if (r.isLocked)                               status = 'locked';
      else                                               status = 'upcoming';

      return {
        id: r.meeting.meeting_key,
        round: r.round,
        name: r.meeting.meeting_name,
        circuit: r.meeting.circuit_short_name,
        country: r.meeting.country_name,
        countryCode: r.meeting.country_code,
        date: r.meeting.date_start,
        lockTime: r.lockTime.toISOString(),
        isLocked: r.isLocked,
        isSprint: r.isSprint,
        isCancelled: r.isCancelled,
        hasResult,
        status,
      };
    }));
  } catch (err) {
    console.error('races error', err);
    res.status(500).json({ error: 'Failed to load race calendar' });
  }
});

module.exports = router;
