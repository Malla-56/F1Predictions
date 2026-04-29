const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

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
});

router.post('/login', async (req, res) => {
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
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows: [user] } = await pool.query(
    'SELECT id, username, display_name, role, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
