const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const router = express.Router();

function makeToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, display_name: user.display_name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function userShape(user) {
  return { id: user.id, username: user.username, display_name: user.display_name, role: user.role };
}

router.post('/register', async (req, res) => {
  try {
    const { username, password, display_name } = req.body;
    if (!username || !password || !display_name) {
      return res.status(400).json({ error: 'username, password and display_name required' });
    }
    const { rows: [existing] } = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username.toLowerCase()]
    );
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    const { rows: [user] } = await pool.query(
      'INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING *',
      [username.toLowerCase(), hash, display_name]
    );
    res.json({ token: makeToken(user), user: userShape(user) });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ error: 'Registration failed, please try again' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const { rows: [user] } = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username.toLowerCase()]
    );
    if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({ token: makeToken(user), user: userShape(user) });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Login failed, please try again' });
  }
});

// ── Passkeys (Face ID / Touch ID / fingerprint) ──────────────────────────────
// Challenges travel as short-lived signed tokens so serverless instances don't
// need shared state between the "options" and "verify" calls.

const PASSKEY_TABLE_MISSING = '42P01';

// The passkey is bound to the domain the user is on (rpID), so derive it from the
// browser's Origin and make sure it matches the host this request was served from.
function relyingParty(req) {
  const origin = req.headers.origin;
  if (!origin) throw new Error('Missing Origin header');
  const { hostname } = new URL(origin);
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
  if (hostname !== host && hostname !== 'localhost') throw new Error('Origin does not match host');
  return { rpID: hostname, origin };
}

function challengeToken(challenge, purpose, uid) {
  return jwt.sign({ challenge, purpose, uid }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function readChallenge(token, purpose) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.purpose !== purpose) throw new Error('Wrong challenge purpose');
  return payload;
}

function passkeyError(res, err, fallback) {
  if (err.code === PASSKEY_TABLE_MISSING) {
    return res.status(503).json({ error: 'Face ID sign-in is not set up on the server yet' });
  }
  console.error(fallback, err);
  res.status(400).json({ error: fallback });
}

router.post('/passkey/register-options', requireAuth, async (req, res) => {
  try {
    const { rpID } = relyingParty(req);
    const { rows: existing } = await pool.query(
      'SELECT id, transports FROM user_passkeys WHERE user_id = $1',
      [req.user.id]
    );
    const options = await generateRegistrationOptions({
      rpName: 'Pulse Pitlane Picks',
      rpID,
      userID: Buffer.from(`user-${req.user.id}`),
      userName: req.user.username,
      userDisplayName: req.user.display_name,
      attestationType: 'none',
      excludeCredentials: existing.map(c => ({ id: c.id, transports: c.transports ? c.transports.split(',') : undefined })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required', authenticatorAttachment: 'platform' },
    });
    res.json({ options, challengeToken: challengeToken(options.challenge, 'register', req.user.id) });
  } catch (err) {
    passkeyError(res, err, 'Could not start Face ID setup');
  }
});

router.post('/passkey/register', requireAuth, async (req, res) => {
  try {
    const { rpID, origin } = relyingParty(req);
    const { challenge, uid } = readChallenge(req.body.challengeToken, 'register');
    if (uid !== req.user.id) throw new Error('Challenge issued to another user');

    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response: req.body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verified) return res.status(400).json({ error: 'Face ID setup could not be verified' });

    const { credential } = registrationInfo;
    await pool.query(
      `INSERT INTO user_passkeys (id, user_id, public_key, counter, transports)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [credential.id, req.user.id, Buffer.from(credential.publicKey).toString('base64url'),
       credential.counter, (credential.transports || []).join(',') || null]
    );
    res.json({ ok: true });
  } catch (err) {
    passkeyError(res, err, 'Face ID setup failed');
  }
});

router.post('/passkey/login-options', async (req, res) => {
  try {
    const { rpID } = relyingParty(req);
    // No allowCredentials: the device offers whichever passkey it holds for this site.
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    res.json({ options, challengeToken: challengeToken(options.challenge, 'login') });
  } catch (err) {
    passkeyError(res, err, 'Could not start Face ID sign-in');
  }
});

router.post('/passkey/login', async (req, res) => {
  try {
    const { rpID, origin } = relyingParty(req);
    const { challenge } = readChallenge(req.body.challengeToken, 'login');
    const response = req.body.response;

    const { rows: [passkey] } = await pool.query(
      'SELECT * FROM user_passkeys WHERE id = $1',
      [response?.id]
    );
    if (!passkey) return res.status(401).json({ error: 'This passkey is not registered — sign in with your password' });

    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(Buffer.from(passkey.public_key, 'base64url')),
        counter: Number(passkey.counter),
        transports: passkey.transports ? passkey.transports.split(',') : undefined,
      },
    });
    if (!verified) return res.status(401).json({ error: 'Face ID sign-in could not be verified' });

    const { rows: [user] } = await pool.query('SELECT * FROM users WHERE id = $1', [passkey.user_id]);
    if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid credentials' });

    await pool.query(
      'UPDATE user_passkeys SET counter = $1, last_used_at = NOW() WHERE id = $2',
      [authenticationInfo.newCounter, passkey.id]
    );
    res.json({ token: makeToken(user), user: userShape(user) });
  } catch (err) {
    passkeyError(res, err, 'Face ID sign-in failed');
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows: [user] } = await pool.query(
      'SELECT id, username, display_name, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('me error', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

module.exports = router;
