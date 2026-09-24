const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const { sendToUser } = require('../push');

const router = express.Router();

router.get('/public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push notifications are not configured' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post('/subscribe', requireAuth, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  try {
    await pool.query(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (endpoint) DO UPDATE SET
        user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
    `, [req.user.id, endpoint, keys.p256dh, keys.auth]);
    res.json({ ok: true });
  } catch (err) {
    console.error('push subscribe error', err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

router.post('/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user.id]);
  res.json({ ok: true });
});

const TEST_MESSAGES = [
  'Box, box! This is only a test.',
  'Lights out and away we go — your notifications work.',
  'Gap to the car ahead: 0.000s. Test received.',
  'Tyres are warm, notifications are working.',
  'Radio check: loud and clear.',
  'DRS enabled. Test notification delivered.',
  'Purple sector! Push notifications are go.',
  "It's hammer time — this is just a test.",
  'Safety car deployed… just kidding, only a test.',
  'Copy that, we are checking. Notifications OK.',
];

router.post('/test', requireAuth, async (req, res) => {
  try {
    const body = req.body?.random
      ? TEST_MESSAGES[Math.floor(Math.random() * TEST_MESSAGES.length)]
      : "Notifications are on — we'll remind you before tips close.";
    const delivered = await sendToUser(req.user.id, {
      title: 'Pitlane Picks',
      body,
      url: '/home',
    });
    res.json({ ok: true, delivered });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
