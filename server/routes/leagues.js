const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const { rescoreAll } = require('../scorer');
const {
  MEMBER_LIMIT, LeagueError, leaguesForUser, canCreateLeague, findInvite, createInvite,
  currentInvite, addMember, createLeague,
} = require('../leagues');

const router = express.Router();
router.use(requireAuth);

const cleanName = name => (typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '');

// Loads :id and checks the caller is an active admin of it.
async function leagueAdminOf(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid league' });
  const { rows: [league] } = await pool.query(`
    SELECT l.id, l.name, m.role,
           (SELECT COUNT(*)::int FROM league_members x WHERE x.league_id = l.id AND x.is_active = 1) AS member_count
    FROM leagues l JOIN league_members m ON m.league_id = l.id
    WHERE l.id = $1 AND m.user_id = $2 AND m.is_active = 1
  `, [id, req.user.id]);
  if (!league || league.role !== 'admin') return res.status(403).json({ error: 'League admin access required' });
  req.league = league;
  next();
}

// My leagues, plus whether I can start a new one.
router.get('/', async (req, res) => {
  res.json({
    leagues: await leaguesForUser(req.user.id),
    canCreateLeague: await canCreateLeague(req.user),
    memberLimit: MEMBER_LIMIT,
  });
});

router.post('/', async (req, res) => {
  if (!(await canCreateLeague(req.user))) {
    return res.status(403).json({ error: 'Only league admins can create a league' });
  }
  const name = cleanName(req.body?.name);
  if (name.length < 2 || name.length > 40) {
    return res.status(400).json({ error: 'League name must be 2–40 characters' });
  }
  res.json(await createLeague(name, req.user.id));
});

// Join another league with an invite code (for people who already have an account).
router.post('/join', async (req, res) => {
  const client = await pool.connect();
  let invite;
  try {
    await client.query('BEGIN');
    invite = await findInvite(req.body?.code, client);
    if (!invite) throw new LeagueError('That invite code is invalid or has expired');
    await addMember(client, invite.league_id, req.user.id);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof LeagueError) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }

  // Tips are shared, so any rounds already tipped count in the new league straight away.
  await rescoreAll(invite.league_id);
  res.json({ id: invite.league_id, name: invite.league_name, role: 'member' });
});

// The league's current invite code, if one is still valid.
router.get('/:id/invite', leagueAdminOf, async (req, res) => {
  res.json({ invite: await currentInvite(req.league.id), memberCount: req.league.member_count, memberLimit: MEMBER_LIMIT });
});

// A fresh 15-minute invite code.
router.post('/:id/invite', leagueAdminOf, async (req, res) => {
  if (req.league.member_count >= MEMBER_LIMIT) {
    return res.status(409).json({ error: `This league is full (${MEMBER_LIMIT} members)` });
  }
  res.json({ invite: await createInvite(req.league.id, req.user.id), memberCount: req.league.member_count, memberLimit: MEMBER_LIMIT });
});

router.put('/:id', leagueAdminOf, async (req, res) => {
  const name = cleanName(req.body?.name);
  if (name.length < 2 || name.length > 40) {
    return res.status(400).json({ error: 'League name must be 2–40 characters' });
  }
  await pool.query('UPDATE leagues SET name = $1 WHERE id = $2', [name, req.league.id]);
  res.json({ ok: true });
});

module.exports = router;
