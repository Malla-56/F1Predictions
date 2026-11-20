import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAppData } from '../../context/AppDataContext';
import Topbar from '../../components/Topbar';
import OpenF1Status from '../../components/OpenF1Status';

// <input type="datetime-local"> works in the browser's local time with no zone, so
// convert to/from UTC ISO here rather than letting the server guess.
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const LOCK_LABELS = {
  weekend: 'Weekend start',
  sprint: 'Sprint',
  qualifying: 'Qualifying',
  race: 'Race start',
};

const SOURCE_NOTES = {
  weekend: 'weekend start',
  sprint: 'sprint start',
  qualifying: 'qualifying start',
  race: 'race start',
  custom: 'custom time',
  capped: 'custom time, capped at race start',
};

function fmtLocal(iso) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminRaces({ setToast }) {
  const { races, reloadRaces, countryFlag } = useAppData();
  const [configs, setConfigs] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    api.admin.races()
      .then(rows => setConfigs(Object.fromEntries(rows.map(r => [r.race_round, r]))))
      .catch(e => setLoadError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  async function save(race, patch, message) {
    setSaving(race.round);
    try {
      await api.admin.saveRace(race.round, patch);
      setConfigs(prev => ({ ...prev, [race.round]: { ...prev[race.round], ...patch } }));
      setToast(message);
      // Effective lock time and locked state are computed server-side.
      await reloadRaces();
    } catch (err) {
      setToast(`Error: ${err.message}`);
    } finally {
      setSaving(null);
    }
  }

  // Lock at a session (follows OpenF1 schedule changes). Clears any custom time.
  function setLockPoint(race, point) {
    save(race, { lock_at: point, lock_time: null },
      `R${race.round} now locks at ${LOCK_LABELS[point].toLowerCase()}`);
  }

  // Custom lock time. The input always shows the effective lock time, so leaving it
  // unchanged is a no-op; clearing it goes back to the default.
  function setLockTime(race, value) {
    if (value === toLocalInput(race.lockTime)) return;
    if (!value) return setLockPoint(race, 'weekend');
    save(race, { lock_time: new Date(value).toISOString(), lock_at: null }, `Lock time updated for R${race.round}`);
  }

  // Ticked whenever tips are actually locked (manual lock or lock time passed).
  // Unticking reopens tips until race start; once the race has started it stays locked.
  function toggleLocked(race) {
    if (!race.isLocked) {
      return save(race, { manually_locked: 1 }, `R${race.round} locked`);
    }
    const patch = { manually_locked: 0 };
    const timePassed = new Date() >= new Date(race.lockTime);
    if (timePassed && race.raceStart) Object.assign(patch, { lock_at: 'race', lock_time: null });
    save(race, patch, timePassed
      ? `R${race.round} unlocked — tips open until race start`
      : `R${race.round} unlocked`);
  }

  function lockStatus(r, cfg) {
    const raceStarted = r.raceStart && new Date() >= new Date(r.raceStart);
    if (raceStarted) return 'Race started';
    if (cfg.manually_locked === 1) return 'Locked manually';
    if (r.isLocked) return `Auto-locked ${fmtLocal(r.lockTime)}`;
    return `Open · locks ${fmtLocal(r.lockTime)}`;
  }

  // Lock points available for a race, with their session times.
  function lockOptions(r) {
    return [
      ['weekend', r.date],
      ['sprint', r.sprintStart],
      ['qualifying', r.qualifyingStart],
      ['race', r.raceStart],
    ].filter(([, time]) => time);
  }

  // Only one joker round per season — the server clears the previous one, so mirror that here.
  async function setJoker(race) {
    const on = configs[race.round]?.is_joker ? 0 : 1;
    setSaving(race.round);
    try {
      await api.admin.saveRace(race.round, { is_joker: on });
      setConfigs(prev => {
        const next = {};
        for (const [round, cfg] of Object.entries(prev)) next[round] = on ? { ...cfg, is_joker: 0 } : cfg;
        next[race.round] = { ...prev[race.round], is_joker: on };
        return next;
      });
      await reloadRaces();
      setToast(on ? `R${race.round} is now the joker round (double points)` : `Joker removed from R${race.round}`);
    } catch (err) {
      setToast(`Error: ${err.message}`);
    } finally {
      setSaving(null);
    }
  }

  const toggle = (race, key, on, off) => {
    const next = configs[race.round]?.[key] ? 0 : 1;
    save(race, { [key]: next }, `R${race.round} ${next ? on : off}`);
  };

  return (
    <>
      <Topbar crumbs={['Admin', 'Races']} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 className="page-title">Race Management</h2>
            <div className="page-sub">
              Choose when tips lock and manage sprint weekends · tips always lock by race start · times are in your local time zone
            </div>
          </div>
        </div>

        <OpenF1Status />
        {loadError && <div className="results-empty">Couldn't load race settings: {loadError}</div>}
        {!loaded && <div className="loading">Loading race settings…</div>}

        <div className="score-table">
          <table className="admin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Round</th>
                <th>Race</th>
                <th>Date</th>
                <th>Lock Time</th>
                <th>Sprint</th>
                <th>Cancelled</th>
                <th title="Every score for this round counts double. One round per season.">Joker ×2</th>
                <th title="Ticked whenever tips are locked, manually or because the lock time has passed">Locked</th>
              </tr>
            </thead>
            <tbody>
              {races.map(r => {
                const cfg = configs[r.round] || {};
                const raceStarted = !!r.raceStart && new Date() >= new Date(r.raceStart);
                const busy = saving === r.round || !loaded;
                return (
                  <tr key={r.round} style={r.isCancelled ? { opacity: 0.5 } : {}}>
                    <td className="mono" style={{ color: 'var(--text-3)', fontSize: 12 }}>R{String(r.round).padStart(2, '0')}</td>
                    <td style={{ fontFamily: 'var(--display)', fontWeight: 600, textDecoration: r.isCancelled ? 'line-through' : 'none' }}>
                      {countryFlag(r.countryCode)} {r.name}
                      {r.isCancelled && <span className="badge" style={{ marginLeft: 8, fontSize: 9, background: 'var(--text-3)', color: 'var(--bg)' }}>CANCELLED</span>}
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      {new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </td>
                    <td>
                      <select
                        aria-label={`Lock point for round ${r.round}`}
                        value={r.lockSource === 'capped' ? 'custom' : r.lockSource}
                        disabled={busy}
                        onChange={e => setLockPoint(r, e.target.value)}
                        style={{
                          background: 'var(--bg)', border: '1px solid var(--line)',
                          borderRadius: 3, color: 'var(--text)', fontFamily: 'var(--mono)',
                          fontSize: 11, padding: '4px 8px', width: '100%', marginBottom: 6,
                        }}
                      >
                        {lockOptions(r).map(([point, time]) => (
                          <option key={point} value={point}>{LOCK_LABELS[point]} · {fmtLocal(time)}</option>
                        ))}
                        {['custom', 'capped'].includes(r.lockSource) && <option value="custom" disabled>Custom time</option>}
                      </select>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          // Remount when the stored value changes so the uncontrolled input shows it.
                          key={`${r.round}-${r.lockTime}`}
                          type="datetime-local"
                          aria-label={`Lock time for round ${r.round}`}
                          defaultValue={toLocalInput(r.lockTime)}
                          disabled={busy}
                          onBlur={e => setLockTime(r, e.target.value)}
                          style={{
                            background: 'var(--bg)', border: '1px solid var(--line)',
                            borderRadius: 3, color: 'var(--text)', fontFamily: 'var(--mono)',
                            fontSize: 11, padding: '4px 8px', width: '100%',
                          }}
                        />
                        {r.lockSource !== 'weekend' && (
                          <button className="btn ghost" style={{ height: 26, padding: '0 8px', fontSize: 11 }}
                            disabled={busy} onClick={() => setLockPoint(r, 'weekend')} title="Back to the default: lock at weekend start">
                            Reset
                          </button>
                        )}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                        Locks {fmtLocal(r.lockTime)} ({SOURCE_NOTES[r.lockSource] || 'weekend start'})
                      </div>
                    </td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={cfg.is_sprint === 1} disabled={busy}
                          onChange={() => toggle(r, 'is_sprint', 'marked as sprint', 'sprint flag removed')} style={{ accentColor: 'var(--red)' }} />
                        <span className="mono" style={{ fontSize: 11 }}>
                          Sprint{r.isSprint && cfg.is_sprint !== 1 ? ' (auto)' : ''}
                        </span>
                      </label>
                    </td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={cfg.cancelled === 1} disabled={busy}
                          onChange={() => toggle(r, 'cancelled', 'marked cancelled', 'restored')} style={{ accentColor: 'var(--red)' }} />
                        <span className="mono" style={{ fontSize: 11 }}>
                          Cancelled{r.isCancelled && cfg.cancelled !== 1 ? ' (auto)' : ''}
                        </span>
                      </label>
                    </td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={cfg.is_joker === 1} disabled={busy || r.isCancelled}
                          onChange={() => setJoker(r)} style={{ accentColor: 'var(--red)' }} />
                        <span className="mono" style={{ fontSize: 11 }}>Joker</span>
                      </label>
                    </td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: raceStarted ? 'default' : 'pointer' }}
                        title={raceStarted ? 'Tips always stay locked once the race has started' : undefined}>
                        <input type="checkbox" checked={r.isLocked} disabled={busy || raceStarted}
                          onChange={() => toggleLocked(r)} style={{ accentColor: 'var(--red)' }} />
                        <span className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{lockStatus(r, cfg)}</span>
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
