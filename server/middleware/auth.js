const jwt = require('jsonwebtoken');
const pool = require('../db');

// Verifies the JWT, then reloads the user so deactivations and role changes take
// effect immediately instead of when the 30-day token expires.
module.exports = async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // Challenge tokens for passkeys are signed with the same secret — never accept them here.
  if (!payload.id || payload.purpose) return res.status(401).json({ error: 'Invalid or expired token' });

  const { rows: [user] } = await pool.query(
    'SELECT id, username, display_name, role, is_active FROM users WHERE id = $1',
    [payload.id]
  );
  if (!user || !user.is_active) return res.status(401).json({ error: 'Account is disabled' });

  req.user = { id: user.id, username: user.username, display_name: user.display_name, role: user.role };
  next();
};
