import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAppData } from '../../context/AppDataContext';
import Topbar from '../../components/Topbar';

export default function AdminRaces({ setToast }) {
  const { races, countryFlag } = useAppData();
  const [configs, setConfigs] = useState({});
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    api.admin.races().then(rows => {
      setConfigs(Object.fromEntries(rows.map(r => [r.race_round, r])));
    }).catch(() => {});
  }, []);

  async function toggleLock(race) {
    const current = configs[race.round];
    const newLocked = current?.manually_locked ? 0 : 1;
    setSaving(race.round);
    try {
      await api.admin.saveRace(race.round, { manually_locked: newLocked });
      setConfigs(prev => ({ ...prev, [race.round]: { ...prev[race.round], manually_locked: newLocked } }));
      setToast(`R${race.round} ${newLocked ? 'locked' : 'unlocked'}`);
    } finally {
      setSaving(null);
    }
  }

  async function setLockTime(race, value) {
    await api.admin.saveRace(race.round, { lock_time: value || null });
    setConfigs(prev => ({ ...prev, [race.round]: { ...prev[race.round], lock_time: value } }));
    setToast(`Lock time updated for R${race.round}`);
  }

  async function toggleSprint(race) {
    const current = configs[race.round];
    const newSprint = current?.is_sprint ? 0 : 1;
    await api.admin.saveRace(race.round, { is_sprint: newSprint });
    setConfigs(prev => ({ ...prev, [race.round]: { ...prev[race.round], is_sprint: newSprint } }));
    setToast(`R${race.round} sprint status updated`);
  }

  async function toggleCancelled(race) {
    const current = configs[race.round];
    const newVal = current?.cancelled ? 0 : 1;
    await api.admin.saveRace(race.round, { cancelled: newVal });
    setConfigs(prev => ({ ...prev, [race.round]: { ...prev[race.round], cancelled: newVal } }));
    setToast(`R${race.round} ${newVal ? 'marked cancelled' : 'restored'}`);
  }

  return (
    <>
      <Topbar crumbs={['Admin', 'Races']} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>Race Management</h2>
            <div className="muted" style={{ marginTop: 6 }}>Override lock times and manage sprint weekends</div>
          </div>
        </div>

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
                <th>Status</th>
                <th>Lock</th>
              </tr>
            </thead>
            <tbody>
              {races.map(r => {
                const cfg = configs[r.round] || {};
                const isManuallyLocked = cfg.manually_locked === 1;
                const isCancelled = cfg.cancelled === 1;
                return (
                  <tr key={r.round} style={isCancelled ? { opacity: 0.5 } : {}}>
                    <td className="mono" style={{ color: 'var(--text-3)', fontSize: 12 }}>R{String(r.round).padStart(2, '0')}</td>
                    <td style={{ fontFamily: 'var(--display)', fontWeight: 600, textDecoration: isCancelled ? 'line-through' : 'none' }}>
                      {countryFlag(r.countryCode)} {r.name}
                      {isCancelled && <span className="badge" style={{ marginLeft: 8, fontSize: 9, background: 'var(--text-3)', color: 'var(--bg)' }}>CANCELLED</span>}
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      {new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </td>
                    <td>
                      <input
                        type="datetime-local"
                        defaultValue={cfg.lock_time ? cfg.lock_time.slice(0, 16) : ''}
                        onBlur={e => setLockTime(r, e.target.value)}
                        style={{
                          background: 'var(--bg)', border: '1px solid var(--line)',
                          borderRadius: 3, color: 'var(--text)', fontFamily: 'var(--mono)',
                          fontSize: 11, padding: '4px 8px', width: '100%',
                        }}
                      />
                    </td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={cfg.is_sprint === 1} onChange={() => toggleSprint(r)} style={{ accentColor: 'var(--red)' }} />
                        <span className="mono" style={{ fontSize: 11 }}>Sprint</span>
                      </label>
                    </td>
                    <td>
                      <span className={`badge dot ${r.isLocked ? 'locked' : r.status === 'done' ? 'done' : 'pending'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`btn${isManuallyLocked ? ' danger' : ''}`}
                        style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                        disabled={saving === r.round}
                        onClick={() => toggleLock(r)}
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
