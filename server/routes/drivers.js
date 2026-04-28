const express = require('express');
const openf1 = require('../openf1');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// 2025 team colours by constructor name fragment
const TEAM_COLORS = {
  'red bull':     '#3671C6',
  'ferrari':      '#E8002D',
  'mclaren':      '#FF8000',
  'mercedes':     '#27F4D2',
  'aston':        '#229971',
  'alpine':       '#FF87BC',
  'williams':     '#64C4FF',
  'rb ':          '#6692FF',
  'visa':         '#6692FF',
  'haas':         '#B6BABD',
  'kick':         '#52E252',
  'sauber':       '#52E252',
};

function teamColor(teamName) {
  if (!teamName) return '#888';
  const lower = teamName.toLowerCase();
  for (const [key, color] of Object.entries(TEAM_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#888';
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const sessionKey = await openf1.getLatestSessionKey(2026);
    const drivers = await openf1.getDrivers(sessionKey);

    const seen = new Set();
    const unique = drivers
      .filter(d => {
        if (seen.has(d.driver_number)) return false;
        seen.add(d.driver_number);
        return true;
      })
      .map(d => ({
        id: d.name_acronym,
        num: d.driver_number,
        firstName: d.first_name,
        lastName: d.last_name,
        team: d.team_name,
        teamColor: d.team_colour ? '#' + d.team_colour : teamColor(d.team_name),
      }))
      .sort((a, b) => a.num - b.num);

    res.json(unique);
  } catch (err) {
    console.error('drivers error', err);
    res.status(500).json({ error: 'Failed to load drivers' });
  }
});

module.exports = router;
