import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAppData } from '../../context/AppDataContext';
import Topbar from '../../components/Topbar';

// <input type="datetime-local"> works in the browser's local time with no zone, so
// convert to/from UTC ISO here rather than letting the server guess.
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtLocal(iso) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AdminRaces({ setToast }) {
  const { races, countryFlag } = useAppData();
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
    } catch (err) {
      setToast(`Error: ${err.message}`);
    } finally {
      setSaving(null);
    }
  }

  function setLockTime(race, value) {
    const lockTime = value ? new Date(value).toISOString() : null;
    const current = configs[race.round]?.lock_time ?? null;
    if ((current && new Date(current).toISOString()) === lockTime) return;
    save(race, { lock_time: lockTime },
      lockTime ? `Lock time updated for R${race.round}` : `R${race.round} lock time reset to default`);
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
              Override lock times and manage sprint weekends · times are in your local time zone
            </div>
          </div>
        </div>

        {loadError && <div className="results-empty">Couldn't load race settings: {loadError}</div>}
        {!loaded && <div className="loading">Loading race settings…</div>}

        <div className="score-table">
          <table className="admin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Round</th>
                <th>Race</th>
                <th>Date</th>
                <th>Lock Time Override</th>
                <th>Sprint</th>
                <th>Cancelled</th>
                <th>Manual Lock</th>
              </tr>
            </thead>
            <tbody>
              {races.map(r => {
                const cfg = configs[r.round] || {};
                const isManuallyLocked = cfg.manually_locked === 1;
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
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          // Remount when the stored value changes so the uncontrolled input shows it.
                          key={`${r.round}-${cfg.lock_time ?? ''}`}
                          type="datetime-local"
                          aria-label={`Lock time override for round ${r.round}`}
                          defaultValue={toLocalInput(cfg.lock_time)}
                          disabled={busy}
                          onBlur={e => setLockTime(r, e.target.value)}
                          style={{
                            background: 'var(--bg)', border: '1px solid var(--line)',
                            borderRadius: 3, color: 'var(--text)', fontFamily: 'var(--mono)',
                            fontSize: 11, padding: '4px 8px', width: '100%',
                          }}
                        />
                        {cfg.lock_time && (
                          <button className="btn ghost" style={{ height: 26, padding: '0 8px', fontSize: 11 }}
                            disabled={busy} onClick={() => setLockTime(r, '')} title="Reset to default lock time">
                            Reset
                          </button>
                        )}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                        Locks {fmtLocal(r.lockTime)}{cfg.lock_time ? '' : ' (weekend start)'}
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
                      <button
                        className={`btn${isManuallyLocked ? ' danger' : ''}`}
                        style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                        disabled={busy}
                        onClick={() => toggle(r, 'manually_locked', 'locked', 'unlocked')}
                      >
                        {isManuallyLocked ? 'Unlock' : 'Lock'}
                      </button>
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
