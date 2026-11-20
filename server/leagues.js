const crypto = require('crypto');
const pool = require('./db');

const MEMBER_LIMIT = 20;
const INVITE_TTL_MINUTES = 15;
// No 0/O or 1/I/L so codes read out loud or typed from a screenshot don't get mixed up.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const isSiteManager = user => user?.role === 'site_manager';

// Active leagues the user belongs to, oldest membership first.
async function leaguesForUser(userId, db = pool) {
  const { rows } = await db.query(`
    SELECT l.id, l.name, m.role, (l.fantasy_enabled = 1) AS fantasy
    FROM league_members m JOIN leagues l ON l.id = m.league_id
    WHERE m.user_id = $1 AND m.is_active = 1
    ORDER BY m.joined_at, l.id
  `, [userId]);
  return rows;
}

// League admins and the site manager can start new leagues.
async function canCreateLeague(user) {
  if (isSiteManager(user)) return true;
  const { rows: [row] } = await pool.query(
    `SELECT 1 FROM league_members WHERE user_id = $1 AND role = 'admin' AND is_active = 1 LIMIT 1`,
    [user.id]
  );
  return !!row;
}

// Changing an account (password, display name) or a shared tip affects every league
// the person is in, so a league admin may only do it when they admin all of them.
async function canManageAccount(actor, targetId) {
  if (isSiteManager(actor)) return true;
  const { rows: [{ ok }] } = await pool.query(`
    SELECT NOT EXISTS (
      SELECT 1 FROM league_members t
      WHERE t.user_id = $2 AND t.is_active = 1
        AND NOT EXISTS (SELECT 1 FROM league_members a
                        WHERE a.league_id = t.league_id AND a.user_id = $1
                          AND a.role = 'admin' AND a.is_active = 1)
    ) AS ok
  `, [actor.id, targetId]);
  return ok;
}

function normaliseCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// A valid, unexpired invite with its league's name, or null.
async function findInvite(code, db = pool) {
  const clean = normaliseCode(code);
  if (clean.length !== CODE_LENGTH) return null;
  const { rows: [invite] } = await db.query(`
    SELECT i.code, i.league_id, i.expires_at, l.name AS league_name
    FROM league_invites i JOIN leagues l ON l.id = i.league_id
    WHERE i.code = $1 AND i.expires_at > NOW()
  `, [clean]);
  return invite || null;
}

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

async function createInvite(leagueId, userId) {
  await pool.query('DELETE FROM league_invites WHERE expires_at < NOW()');
  for (let attempt = 0; attempt < 5; attempt++) {
    const { rows: [invite] } = await pool.query(`
      INSERT INTO league_invites (code, league_id, created_by, expires_at)
      VALUES ($1, $2, $3, NOW() + make_interval(mins => $4))
      ON CONFLICT (code) DO NOTHING
      RETURNING code, expires_at
    `, [randomCode(), leagueId, userId, INVITE_TTL_MINUTES]);
    if (invite) return invite;
  }
  throw new Error('Could not generate an invite code, please try again');
}

// The newest invite for a league that's still valid, or null.
async function currentInvite(leagueId) {
  const { rows: [invite] } = await pool.query(`
    SELECT code, expires_at FROM league_invites
    WHERE league_id = $1 AND expires_at > NOW()
    ORDER BY expires_at DESC LIMIT 1
  `, [leagueId]);
  return invite || null;
}

class LeagueError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// Adds a user to a league inside the caller's transaction. Locks the league row so two
// people joining at once can't push it past the member limit.
async function addMember(client, leagueId, userId, role = 'member') {
  await client.query('SELECT id FROM leagues WHERE id = $1 FOR UPDATE', [leagueId]);

  const { rows: [existing] } = await client.query(
    'SELECT is_active FROM league_members WHERE league_id = $1 AND user_id = $2', [leagueId, userId]
  );
  if (existing?.is_active) throw new LeagueError("You're already in this league", 409);
  if (existing) throw new LeagueError('You were removed from this league — ask a league admin to restore you', 403);

  const { rows: [{ c }] } = await client.query(
    'SELECT COUNT(*)::int AS c FROM league_members WHERE league_id = $1 AND is_active = 1', [leagueId]
  );
  if (c >= MEMBER_LIMIT) throw new LeagueError(`This league is full (${MEMBER_LIMIT} members)`, 409);

  await client.query(
    'INSERT INTO league_members (league_id, user_id, role) VALUES ($1, $2, $3)', [leagueId, userId, role]
  );
}

// Creates a league with the default scoring rules and makes its creator the admin.
async function createLeague(name, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [league] } = await client.query(
      'INSERT INTO leagues (name, created_by) VALUES ($1, $2) RETURNING id, name', [name, userId]
    );
    await client.query(
      `INSERT INTO league_members (league_id, user_id, role) VALUES ($1, $2, 'admin')`, [league.id, userId]
    );
    await client.query(`
      INSERT INTO league_scoring_rules (league_id, rule_key, points)
      SELECT $1, rule_key, points FROM scoring_rules
    `, [league.id]);
    await client.query('COMMIT');
    return { ...league, role: 'admin' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  MEMBER_LIMIT, INVITE_TTL_MINUTES, LeagueError, isSiteManager,
  leaguesForUser, canCreateLeague, canManageAccount, normaliseCode,
  findInvite, createInvite, currentInvite, addMember, createLeague,
};
