# Home Screen Changes — Implementation Plan

## Change 1: Keep current GP on home screen until results are in

### Problem

`server/routes/races.js` sets `status = 'done'` as soon as a race is locked **and** its `date_start` has passed:

```js
if (raceDate < now && isLocked) status = 'done';
```

`Home.jsx` only shows `status === 'upcoming'` races. So the moment qualifying locks and the race weekend begins, the home screen jumps forward to the next round — even though the current race is still running.

### Fix

**Concept:** a race is only truly `done` once results have been entered. Until then, a locked race whose date has passed should have a new status: `'current'`. The home screen shows the `'current'` race first, falling back to the next `'upcoming'` one if none is live.

---

#### `server/routes/races.js`

1. After fetching meetings and configs, also query `race_results` to get the set of rounds that already have a result stored:

```js
const { rows: resultRows } = await pool.query(
  'SELECT race_round FROM race_results WHERE season = $1',
  [CURRENT_SEASON]
);
const roundsWithResults = new Set(resultRows.map(r => r.race_round));
```

2. Update the status logic inside `.map()`:

```js
const hasResult = roundsWithResults.has(round);

let status;
if (isLocked && raceDate < now && hasResult) status = 'done';
else if (isLocked && raceDate < now)         status = 'current';  // race weekend in progress
else if (isLocked)                           status = 'locked';
else                                         status = 'upcoming';
```

3. Include `hasResult` in the returned object so the frontend can use it:

```js
return {
  ...
  hasResult,
  status,
};
```

---

#### `client/src/pages/Home.jsx`

1. Update the race selection logic to prefer the `'current'` race:

```js
const current  = races.find(r => r.status === 'current'  && !r.isCancelled);
const upcoming = races.find(r => r.status === 'upcoming' && !r.isCancelled)
              || races.find(r => r.status === 'future'   && !r.isCancelled);
const displayed = current || upcoming;
```

Replace all references to `upcoming` in the JSX with `displayed`.

2. Update the hero badge to reflect which state we're in:

```jsx
// was: <span>Next Race</span>
<span>{current ? 'Race Weekend' : 'Next Race'}</span>
```

3. Hide the "Enter your tips" button when the race is `'current'` (predictions are locked):

```jsx
{!current && (
  <div className="hero-actions">
    <button className="btn primary" onClick={() => navigate(`/predict/${displayed.round}`)}>
      Enter your tips <span className="arrow">→</span>
    </button>
  </div>
)}
```

4. Update the topbar badge:

```jsx
// was: Open
{current ? 'Race Day' : 'Open'}
```

---

## Change 2: Show tips as soon as someone submits

### Problem

`server/routes/predictions.js` only reveals a user's picks to others after the race locks:

```js
const reveal = locked || isOwn;
```

Before the lock, other users see "Hidden" on every card even if the person has already submitted.

### Fix

**Concept:** once a prediction is in the database it has been submitted — there is no "saved draft" state. So always reveal picks for predictions that exist. The only "hidden" state is when a user hasn't submitted at all yet (their card shows "Pending", which is unchanged).

---

#### `server/routes/predictions.js`

One line change in `GET /:round`:

```js
// Before
const reveal = locked || isOwn;

// After
const reveal = true;  // submitted = always visible; unsubmitted users have no row
```

The `locked` field in the response stays (it drives the TipCard UI), but it will now always be `true` for any prediction that exists.

No frontend changes needed — TipCard already handles `p.locked === true` correctly, showing the full picks and "Submitted" badge. The "Enter your tips" / edit button visibility is controlled separately by `raceIsLocked`, which is unaffected.

---

## Files Changed

| File | Change |
|------|--------|
| `server/routes/races.js` | Query `race_results` for `hasResult`; add `'current'` status; include `hasResult` in response |
| `client/src/pages/Home.jsx` | Prefer `'current'` race; update hero badge + tip entry button visibility |
| `server/routes/predictions.js` | `reveal = true` always (one line) |

---

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Race weekend started, no result yet | `status = 'current'`, shown on home screen with "Race Weekend" badge, no tip entry button |
| Admin enters result mid-weekend | `hasResult` becomes true → `status = 'done'` → next upcoming race shows on home screen |
| Two consecutive race weekends overlap (rare) | First `'current'` found wins; once its result is entered it drops to `'done'` |
| No upcoming race and no current race | Existing fallback message "No upcoming races found" unchanged |
| Cancelled race | Filtered out by `!r.isCancelled` in all three find() calls, unchanged |
