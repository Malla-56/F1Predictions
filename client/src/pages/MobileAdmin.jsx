import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useAppData } from '../context/AppDataContext';
import OpenF1Status from '../components/OpenF1Status';
import PickEditor from '../components/admin/PickEditor';
import useRaceAdmin, {
  toLocalInput, fmtLocal, LOCK_LABELS, SOURCE_NOTES, lockOptions, lockStatus, raceStarted,
} from '../components/admin/useRaceAdmin';

// Mobile admin: only the jobs needed on a race weekend — lock times, the joker round,
// and entering/correcting tips. Everything else stays on the desktop admin pages.

// 16px text so iOS doesn't zoom the page when a control is focused.
const control = {
  width: '100%', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 4,
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 16, padding: '8px 10px',
};
const label = { fontSize: 11, color: 'var(--text-3)', marginBottom: 4, display: 'block' };
const checkRow = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' };

function RacesTab({ setToast }) {
  const { races, countryFlag } = useAppData();
  const { configs, loaded, loadError, saving, setLockPoint, setLockTime, toggleLocked, setJoker } = useRaceAdmin(setToast);

  // Open the next race that hasn't started by default.
  const next = races.find(r => !raceStarted(r) && !r.isCancelled);
  const [open, setOpen] = useState(null);
  const openRound = open ?? next?.round ?? null;

  if (loadError) return <div className="results-empty">Couldn't load race settings: {loadError}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {races.map(r => {
        const cfg = configs[r.round] || {};
        const busy = saving === r.round || !loaded;
        const started = raceStarted(r);
        const isOpen = openRound === r.round;
        return (
          <div key={r.round} className="card" style={{ opacity: r.isCancelled ? 0.5 : 1 }}>
            <button
              onClick={() => setOpen(isOpen ? -1 : r.round)}
              aria-expanded={isOpen}
              style={{ width: '100%', background: 'none', border: 0, color: 'inherit', textAlign: 'left', padding: '12px 14px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>R{String(r.round).padStart(2, '0')}</span>
                <span style={{ fontFamily: 'var(--display)', fontWeight: 600, flex: 1 }}>{countryFlag(r.countryCode)} {r.name}</span>
                {r.isJoker && <span className="badge" style={{ fontSize: 9 }}>JOKER ×2</span>}
                <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
              </div>
              <div className="mono" style={{ fontSize: 11, color: r.isLocked ? 'var(--red-2)' : 'var(--green)', marginTop: 4 }}>
                {r.isLocked ? '🔒 ' : '🔓 '}{lockStatus(r, cfg)}
              </div>
            </button>

            {isOpen && (
              <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <div>
                  <label style={label} htmlFor={`lock-at-${r.round}`}>Tips lock at</label>
                  <select id={`lock-at-${r.round}`} style={control} disabled={busy || started}
                    value={r.lockSource === 'capped' ? 'custom' : r.lockSource}
                    onChange={e => setLockPoint(r, e.target.value)}>
                    {lockOptions(r).map(([point, time]) => (
                      <option key={point} value={point}>{LOCK_LABELS[point]} · {fmtLocal(time)}</option>
                    ))}
                    {['custom', 'capped'].includes(r.lockSource) && <option value="custom" disabled>Custom time</option>}
                  </select>
                </div>

                <div>
                  <label style={label} htmlFor={`lock-time-${r.round}`}>Or a custom time</label>
                  <input id={`lock-time-${r.round}`} type="datetime-local" style={control}
                    key={`${r.round}-${r.lockTime}`} defaultValue={toLocalInput(r.lockTime)}
                    disabled={busy || started} onBlur={e => setLockTime(r, e.target.value)} />
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                    Locks {fmtLocal(r.lockTime)} ({SOURCE_NOTES[r.lockSource] || 'weekend start'}) · always by race start
                  </div>
                </div>

                <label style={{ ...checkRow, cursor: started ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={r.isLocked} disabled={busy || started}
                    onChange={() => toggleLocked(r)} style={{ width: 22, height: 22, accentColor: 'var(--red)' }} />
                  <span>
                    Locked
                    <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                      {started ? 'Race has started — stays locked' : r.isLocked ? 'Untick to reopen tips until race start' : 'Tick to lock tips now'}
                    </span>
                  </span>
                </label>

                <label style={{ ...checkRow, cursor: r.isCancelled ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={cfg.is_joker === 1} disabled={busy || r.isCancelled}
                    onChange={() => setJoker(r)} style={{ width: 22, height: 22, accentColor: 'var(--red)' }} />
                  <span>
                    Joker round
                    <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                      Double points · one per season, replaces any other joker round
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TipsTab({ setToast }) {
  const { races, drivers } = useAppData();
  const [users, setUsers] = useState([]);
  const [preds, setPreds] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  // Default to the most recent race that's locked (the one most likely to need fixing).
  const lockedRaces = races.filter(r => r.isLocked && !r.isCancelled);
  const [round, setRound] = useState(null);
  const selected = round ?? lockedRaces[lockedRaces.length - 1]?.round ?? races[0]?.round ?? null;
  const race = races.find(r => r.round === selected);

  async function load() {
    try {
      const [u, p, lb] = await Promise.all([api.admin.users(), api.admin.exportData(), api.scores.leaderboard()]);
      setUsers(u.filter(x => x.is_active).sort((a, b) => a.display_name.localeCompare(b.display_name)));
      setPreds(p);
      setLeaderboard(lb);
    } catch {
      setToast('Failed to load tips');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const roundPreds = useMemo(
    () => Object.fromEntries(preds.filter(p => p.round === selected).map(p => [p.username, p])),
    [preds, selected]
  );
  const points = useMemo(
    () => Object.fromEntries(leaderboard.map(row => [row.userId, row.perRace?.[selected]?.points])),
    [leaderboard, selected]
  );

  if (!race) return <div className="loading">Loading…</div>;
  const tipped = users.filter(u => roundPreds[u.username]).length;

  return (
    <div>
      <label style={label} htmlFor="tips-round">Round</label>
      <select id="tips-round" style={{ ...control, marginBottom: 6 }} value={selected}
        onChange={e => { setRound(+e.target.value); setEditing(null); }}>
        {races.map(r => (
          <option key={r.round} value={r.round}>R{String(r.round).padStart(2, '0')} · {r.name}</option>
        ))}
      </select>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
        {loading ? 'Loading…' : `${tipped}/${users.length} tipped · ${race.hasResult ? 'saving rescores the round' : 'no result yet'}`}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {users.map(u => {
          const p = roundPreds[u.username];
          const pts = points[u.id];
          const isEditing = editing === u.username;
          return (
            <div key={u.username} className="card" style={{ overflow: 'hidden' }}>
              <button
                onClick={() => setEditing(isEditing ? null : u.username)}
                aria-expanded={isEditing}
                style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 0, color: 'inherit', textAlign: 'left', padding: '10px 14px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: !p ? 'var(--red)' : pts != null ? 'var(--green)' : 'var(--amber)' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{u.display_name}</span>
                  <span className="mono" style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p ? [p.pos_1, p.pos_2, p.pos_3].filter(Boolean).join(' · ') + (p.pos_4 ? ' …' : '') : 'No tip'}
                  </span>
                </span>
                <span style={{ fontFamily: 'var(--display)', fontWeight: 700, color: pts != null ? 'var(--green)' : 'var(--text-3)' }}>
                  {pts != null ? `${pts}` : '—'}
                </span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{isEditing ? 'Close' : p ? 'Edit' : 'Add'}</span>
              </button>
              {isEditing && (
                <PickEditor large race={race} user={u} pred={p} drivers={drivers} setToast={setToast}
                  onCancel={() => setEditing(null)}
                  onSaved={() => { setEditing(null); load(); }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MobileAdmin({ setToast }) {
  const [tab, setTab] = useState('races');
  const tabBtn = (key, text) => (
    <button key={key} onClick={() => setTab(key)} className={`btn${tab === key ? ' primary' : ' ghost'}`}
      aria-pressed={tab === key} style={{ flex: 1, height: 40 }}>
      {text}
    </button>
  );

  return (
    <div className="content">
      <h2 className="page-title" style={{ marginBottom: 12 }}>Admin</h2>
      <OpenF1Status />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabBtn('races', 'Races & locks')}
        {tabBtn('tips', 'Fix tips')}
      </div>
      {tab === 'races' ? <RacesTab setToast={setToast} /> : <TipsTab setToast={setToast} />}
    </div>
  );
}
