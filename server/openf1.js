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

// Build a structured race result for a given round by querying OpenF1.
// Returns { finishOrder, pole, dnfs, sprintPole, sprintFinishOrder, sprintDnfs } using 3-letter driver codes.
async function fetchAndBuildResult(round, season = 2026) {
  const meetings = await getMeetings(season);
  const sorted = meetings
    .filter(m => m.meeting_key && m.circuit_short_name && !m.meeting_name?.toLowerCase().includes('testing'))
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

  if (round < 1 || round > sorted.length) throw new Error(`Round ${round} not found in calendar`);
  const meeting = sorted[round - 1];

  const sessions = await getSessions(meeting.meeting_key);

  // Get the last Race session (actual race, not sprint race)
  const raceSessions = sessions.filter(s => s.session_type === 'Race' && !s.is_cancelled);
  const raceSession = raceSessions.length > 0 ? raceSessions[raceSessions.length - 1] : null;
  const qualiSession = sessions.find(s => s.session_type === 'Qualifying'  && !s.is_cancelled);
  const sprintSession = sessions.find(s => s.session_type === 'Sprint'     && !s.is_cancelled);

  if (!raceSession) throw new Error(`No race session found for round ${round}`);

  const drivers = await getDrivers(raceSession.session_key);
  const numToCode = {};
  for (const d of drivers) numToCode[d.driver_number] = d.name_acronym;

  const raceResult = await getRaceResult(raceSession.session_key);
  if (!raceResult || raceResult.length === 0)
    throw new Error(`Race result not available yet for round ${round} — try again after the race`);

  const finishOrder = raceResult.map(p => numToCode[p.driver_number]).filter(Boolean);

  // Drivers in the session roster but absent from the final classification are DNFs
  const classifiedNums = new Set(raceResult.map(p => p.driver_number));
  const dnfs = drivers
    .filter(d => !classifiedNums.has(d.driver_number))
    .map(d => d.name_acronym)
    .filter(Boolean);

  // Pole from qualifying P1
  let pole = null;
  if (qualiSession) {
    const qualiResult = await getRaceResult(qualiSession.session_key);
    if (qualiResult && qualiResult.length > 0)
      pole = numToCode[qualiResult[0].driver_number] || null;
  }

  // Sprint results (if sprint race exists)
  let sprintPole = null;
  let sprintFinishOrder = [];
  let sprintDnfs = [];
  if (sprintSession) {
    const sprintResult = await getRaceResult(sprintSession.session_key);
    if (sprintResult && sprintResult.length > 0) {
      sprintFinishOrder = sprintResult.map(p => numToCode[p.driver_number]).filter(Boolean);
      sprintPole = sprintFinishOrder[0] || null;
      const sprintClassifiedNums = new Set(sprintResult.map(p => p.driver_number));
      sprintDnfs = drivers
        .filter(d => !sprintClassifiedNums.has(d.driver_number))
        .map(d => d.name_acronym)
        .filter(Boolean);
    }
  }

  return { finishOrder, pole, dnfs, sprintPole, sprintFinishOrder, sprintDnfs };
}

module.exports = { getMeetings, getSessions, getLatestSessionKey, getSprintMeetingKeys, getDrivers, getPosition, getRaceResult, fetchAndBuildResult, invalidate };
