const fetch = require('node-fetch');

const BASE = 'https://api.openf1.org/v1';
const CACHE = new Map();
const INFLIGHT = new Map();
const TTL_STATIC = 24 * 60 * 60 * 1000; // 24 hours — calendar, sessions, drivers

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

// OpenF1 rate-limits bursts (~30 requests/window) — back off and retry on 429/5xx
// instead of failing, so a cold-cache "Fetch all" doesn't need a second press.
async function get(path, tries = 3) {
  for (let i = 0; ; i++) {
    const res = await fetch(`${BASE}${path}`);
    if (res.ok) return res.json();
    if (i < tries - 1 && (res.status === 429 || res.status >= 500)) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Math.min((retryAfter > 0 ? retryAfter : 2 ** i) * 1000, 5000);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`OpenF1 ${path} → ${res.status}`);
  }
}

async function getMeetings(year) {
  return cached(`meetings_${year}`, () => get(`/meetings?year=${year}`));
}

// Note: OpenF1 marks sprints as session_type 'Race' / session_name 'Sprint', and sprint
// qualifying as session_type 'Qualifying', so sessions are matched by session_name.
async function getSeasonSessions(year) {
  return cached(`sessions_year_${year}`, () => get(`/sessions?year=${year}`));
}

// Most recent Grand Prix that has already started. The whole season's sessions are
// published in advance, so without the date check this would pick the finale.
async function getLatestSessionKey(year) {
  const races = (await getSeasonSessions(year))
    .filter(s => s.session_name === 'Race' && !s.is_cancelled)
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
  const now = new Date();
  const started = races.filter(s => new Date(s.date_start) <= now);
  // Before the first race, use the opener's entry list.
  const race = started[started.length - 1] || races[0];
  return race ? race.session_key : null;
}

async function getDrivers(sessionKey) {
  if (!sessionKey) return [];
  return cached(`drivers_${sessionKey}`, () => get(`/drivers?session_key=${sessionKey}`));
}

// Current championship standings, taken from the most recent race that has finished.
// OpenF1 only publishes standings once a race is complete (404 before that), so walk
// back through past races until one has data.
// The whole lookup is cached for an hour (empty results included) so it can't eat into
// OpenF1's rate limit, which the results fetch also depends on.
async function getStandings(kind, year) {
  return cached(`standings_${kind}_${year}`, async () => {
    const sessions = await getSeasonSessions(year);
    const finished = sessions
      .filter(s => s.session_name === 'Race' && !s.is_cancelled && new Date(s.date_end || s.date_start) < new Date())
      .sort((a, b) => new Date(b.date_start) - new Date(a.date_start))
      .slice(0, 2);
    for (const s of finished) {
      try {
        const rows = await get(`/championship_${kind}?session_key=${s.session_key}`);
        if (rows.length) return rows;
      } catch {
        // Not published yet for this race — try the one before.
      }
    }
    return [];
  }, 60 * 60 * 1000);
}

const getTeamStandings   = year => getStandings('teams', year);
const getDriverStandings = year => getStandings('drivers', year);

// Official classification, with penalties applied and DNF/DNS/DSQ flags. Not cached:
// results are fetched only a few times per race and must pick up late penalties.
async function getSessionResult(sessionKey) {
  if (!sessionKey) return [];
  return get(`/session_result?session_key=${sessionKey}`);
}

function invalidate(key) {
  CACHE.delete(key);
}

// Build a structured race result for a calendar entry (see calendar.getCalendar).
// Returns { finishOrder, pole, dnfs, sprintWinner, sprintFinishOrder, sprintDnfs } using 3-letter driver codes.
async function buildResult(race) {
  const { race: raceSession, qualifying, sprint } = race.sessions;
  if (!raceSession) throw new Error(`No race session found for round ${race.round}`);

  const drivers = await getDrivers(raceSession.session_key);
  const numToCode = {};
  for (const d of drivers) numToCode[d.driver_number] = d.name_acronym;
  const code = n => numToCode[n] || null;

  function classify(rows) {
    const finishOrder = rows
      .filter(r => r.position != null && !r.dsq)
      .sort((a, b) => a.position - b.position)
      .map(r => code(r.driver_number))
      .filter(Boolean);
    const dnfs = rows.filter(r => r.dnf || r.dns).map(r => code(r.driver_number)).filter(Boolean);
    return { finishOrder, dnfs };
  }

  const raceRows = await getSessionResult(raceSession.session_key);
  if (!raceRows.length)
    throw new Error(`Race result not available yet for round ${race.round} — try again after the race`);
  const { finishOrder, dnfs } = classify(raceRows);

  let pole = null;
  if (qualifying) {
    const p1 = (await getSessionResult(qualifying.session_key)).find(r => r.position === 1);
    pole = p1 ? code(p1.driver_number) : null;
  }

  let sprintFinishOrder = [];
  let sprintDnfs = [];
  if (sprint) {
    const sprintRows = await getSessionResult(sprint.session_key);
    if (sprintRows.length) ({ finishOrder: sprintFinishOrder, dnfs: sprintDnfs } = classify(sprintRows));
  }

  return { finishOrder, pole, dnfs, sprintWinner: sprintFinishOrder[0] || null, sprintFinishOrder, sprintDnfs };
}

module.exports = {
  getMeetings, getSeasonSessions, getLatestSessionKey, getDrivers,
  getTeamStandings, getDriverStandings, getSessionResult, buildResult, invalidate,
};
