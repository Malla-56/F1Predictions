const fetch = require('node-fetch');

const BASE = 'https://api.openf1.org/v1';
const CACHE = new Map();
const INFLIGHT = new Map();
const TTL_STATIC = 24 * 60 * 60 * 1000; // 24 hours — calendar, sessions, drivers
const TTL_LIVE   =  5 * 60 * 1000;       // 5 minutes — live race positions

async function cached(key, fetcher, ttl = TTL_STATIC) {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.ts < ttl) return hit.data;

  // Deduplicate concurrent requests for the same key
  if (INFLIGHT.has(key)) return INFLIGHT.get(key);

  const promise = (async () => {
    try {
      const data = await fetcher();
      CACHE.set(key, { data, ts: Date.now() });
      return data;
    } catch (err) {
      // On rate-limit or transient error, serve stale data if available
      if (hit) {
        console.warn(`OpenF1 fetch failed (${err.message}), serving stale cache for ${key}`);
        return hit.data;
      }
      throw err;
    } finally {
      INFLIGHT.delete(key);
    }
  })();

  INFLIGHT.set(key, promise);
  return promise;
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`OpenF1 ${path} → ${res.status}`);
  return res.json();
}

async function getMeetings(year = 2026) {
  return cached(`meetings_${year}`, () => get(`/meetings?year=${year}`));
}

async function getSprintMeetingKeys(year = 2026) {
  const sessions = await cached(`sessions_year_${year}`, () => get(`/sessions?year=${year}`));
  return new Set(sessions.filter(s => s.session_type === 'Sprint').map(s => s.meeting_key));
}

async function getSessions(meetingKey) {
  return cached(`sessions_${meetingKey}`, () => get(`/sessions?meeting_key=${meetingKey}`));
}

async function getLatestSessionKey(year = 2026) {
  const sessions = await cached(`sessions_year_${year}`, () => get(`/sessions?year=${year}`));
  const race = sessions
    .filter(s => s.session_type === 'Race' && !s.is_cancelled)
    .sort((a, b) => new Date(b.date_start) - new Date(a.date_start))[0];
  return race ? race.session_key : null;
}

async function getDrivers(sessionKey) {
  if (!sessionKey) return [];
  return cached(`drivers_${sessionKey}`, () => get(`/drivers?session_key=${sessionKey}`));
}

async function getPosition(sessionKey) {
  if (!sessionKey) return [];
  return cached(`position_${sessionKey}`, () => get(`/position?session_key=${sessionKey}`), TTL_LIVE);
}

async function getRaceResult(sessionKey) {
  const positions = await getPosition(sessionKey);
  if (!positions || positions.length === 0) return null;
  // Group by driver, take their final position
  const finalPos = {};
  for (const p of positions) {
    finalPos[p.driver_number] = p;
  }
  return Object.values(finalPos)
    .sort((a, b) => a.position - b.position)
    .slice(0, 20);
}

function invalidate(key) {
  CACHE.delete(key);
}

module.exports = { getMeetings, getSessions, getLatestSessionKey, getSprintMeetingKeys, getDrivers, getPosition, getRaceResult, invalidate };
