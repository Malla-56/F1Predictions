const webpush = require('web-push');
const pool = require('./db');

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

// Sends a notification to every device the user has subscribed. Returns the
// number of devices it was delivered to. Expired subscriptions are removed.
async function sendToUser(userId, payload) {
  if (!ensureConfigured()) throw new Error('VAPID keys are not configured');

  const { rows: subs } = await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );

  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      );
      delivered++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
      } else {
        console.warn(`[push] send to user ${userId} failed: ${err.statusCode || ''} ${err.message}`);
      }
    }
  }
  return delivered;
}

module.exports = { sendToUser, ensureConfigured };
