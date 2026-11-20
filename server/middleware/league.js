const pool = require('../db');

// Resolves the league a request is about. The client sends the league the user has
// selected in the X-League-Id header; without one, their first league is used.
// Sets req.league = { id, name, role, fantasy }. Must run after requireAuth.
async function requireLeague(req, res, next) {
  const raw = req.headers['x-league-id'];
  const wanted = raw ? Number(raw) : null;
  if (raw && !Number.isInteger(wanted)) return res.status(400).json({ error: 'Invalid league' });

  const { rows: [league] } = await pool.query(`
    SELECT l.id, l.name, m.role, (l.fantasy_enabled = 1) AS fantasy
    FROM league_members m JOIN leagues l ON l.id = m.league_id
    WHERE m.user_id = $1 AND m.is_active = 1 AND ($2::int IS NULL OR l.id = $2)
    ORDER BY m.joined_at, l.id
    LIMIT 1
  `, [req.user.id, wanted]);

  if (!league) {
    return res.status(403).json({ error: wanted ? "You're not a member of this league" : "You're not in a league yet" });
  }
  req.league = league;
  next();
}

// requireLeague plus the user must be an admin of that league.
async function requireLeagueAdmin(req, res, next) {
  await requireLeague(req, res, () => {
    if (req.league.role !== 'admin') return res.status(403).json({ error: 'League admin access required' });
    next();
  });
}

module.exports = { requireLeague, requireLeagueAdmin };
