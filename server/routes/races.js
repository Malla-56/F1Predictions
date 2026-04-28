const express = require('express');
const openf1 = require('../openf1');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const CURRENT_SEASON = 2026;

router.get('/', requireAuth, async (req, res) => {
  try {
    const [meetings, sprintKeys] = await Promise.all([
      openf1.getMeetings(CURRENT_SEASON),
      openf1.getSprintMeetingKeys(CURRENT_SEASON),
    ]);
    const configs = db.prepare('SELECT * FROM race_config WHERE season = ?').all(CURRENT_SEASON);
    const configMap = Object.fromEntries(configs.map(c => [c.race_round, c]));

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
        let status = 'future';
        if (raceDate < now && isLocked) status = 'done';
        else if (isLocked) status = 'locked';
        else status = 'upcoming';

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
