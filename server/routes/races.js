const express = require('express');
const openf1 = require('../openf1');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const CURRENT_SEASON = 2026;

router.get('/', requireAuth, async (req, res) => {
  try {
    const [meetings, sprintKeys] = await Promise.all([
      openf1.getMeetings(CURRENT_SEASON),
      openf1.getSprintMeetingKeys(CURRENT_SEASON),
    ]);
    const [{ rows: configs }, { rows: resultRows }] = await Promise.all([
      pool.query('SELECT * FROM race_config WHERE season = $1', [CURRENT_SEASON]),
      pool.query('SELECT race_round FROM race_results WHERE season = $1', [CURRENT_SEASON]),
    ]);
    const configMap = Object.fromEntries(configs.map(c => [c.race_round, c]));
    const roundsWithResults = new Set(resultRows.map(r => r.race_round));

    const now = new Date();
    const races = meetings
      .filter(m => m.meeting_key && m.circuit_short_name && !m.meeting_name?.toLowerCase().includes('testing'))
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start))
      .map((m, i) => {
        const round = i + 1;
        const cfg = configMap[round] || {};
        const lockTime = cfg.lock_time ? new Date(cfg.lock_time) : new Date(m.date_start);
        const isLocked = cfg.manually_locked === 1 || now >= lockTime;
        const raceDate = new Date(m.date_start);
        const hasResult = roundsWithResults.has(round);

        let status;
        if (isLocked && raceDate < now && hasResult) status = 'done';
        else if (isLocked && raceDate < now)         status = 'current';
        else if (isLocked)                           status = 'locked';
        else                                         status = 'upcoming';

        return {
          id: m.meeting_key,
          round,
          name: m.meeting_name,
          circuit: m.circuit_short_name,
          country: m.country_name,
          countryCode: m.country_code,
          date: m.date_start,
          lockTime: lockTime.toISOString(),
          isLocked,
          isSprint: sprintKeys.has(m.meeting_key) || cfg.is_sprint === 1,
          isCancelled: cfg.cancelled === 1,
          hasResult,
          status,
        };
      });

    res.json(races);
  } catch (err) {
    console.error('races error', err);
    res.status(500).json({ error: 'Failed to load race calendar' });
  }
});

module.exports = router;
