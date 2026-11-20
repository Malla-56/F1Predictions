import { useAppData } from '../../context/AppDataContext';
import Topbar from '../../components/Topbar';
import OpenF1Status from '../../components/OpenF1Status';
import useRaceAdmin, {
  toLocalInput, fmtLocal, LOCK_LABELS, SOURCE_NOTES, lockOptions, lockStatus, raceStarted,
} from '../../components/admin/useRaceAdmin';

export default function AdminRaces({ setToast }) {
  const { races, countryFlag } = useAppData();
  const { configs, loaded, loadError, saving, setLockPoint, setLockTime, toggleLocked, setJoker, toggleFlag } =
    useRaceAdmin(setToast);

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
                const started = raceStarted(r);
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
                          onChange={() => toggleFlag(r, 'is_sprint', 'marked as sprint', 'sprint flag removed')} style={{ accentColor: 'var(--red)' }} />
                        <span className="mono" style={{ fontSize: 11 }}>
                          Sprint{r.isSprint && cfg.is_sprint !== 1 ? ' (auto)' : ''}
                        </span>
                      </label>
                    </td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={cfg.cancelled === 1} disabled={busy}
                          onChange={() => toggleFlag(r, 'cancelled', 'marked cancelled', 'restored')} style={{ accentColor: 'var(--red)' }} />
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
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: started ? 'default' : 'pointer' }}
                        title={started ? 'Tips always stay locked once the race has started' : undefined}>
                        <input type="checkbox" checked={r.isLocked} disabled={busy || started}
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
