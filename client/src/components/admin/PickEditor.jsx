import { useState } from 'react';
import { api } from '../../api';

// Enter or correct one user's tip for any round (admin only), then rescore.
// Used by the desktop Data page and the mobile admin page.

const POS_KEYS = ['pos_1','pos_2','pos_3','pos_4','pos_5','pos_6','pos_7','pos_8','pos_9','pos_10'];

// large: 16px controls, so iOS doesn't zoom the page when a dropdown is tapped.
export default function PickEditor({ race, user, pred, drivers, onSaved, onCancel, setToast, large = false }) {
  const [pole, setPole] = useState(pred?.pole || '');
  const [positions, setPositions] = useState(POS_KEYS.map(k => pred?.[k] || ''));
  const [dnf, setDnf] = useState(pred?.dnf || '');
  const [sprint, setSprint] = useState(pred?.sprint_winner || '');
  const [saving, setSaving] = useState(false);

  // Current grid, plus any code already in this tip (a driver may have left since).
  const existing = [pred?.pole, ...POS_KEYS.map(k => pred?.[k]), pred?.dnf, pred?.sprint_winner].filter(Boolean);
  const codes = [...new Set([...drivers.map(d => d.id), ...existing])];
  const label = code => {
    const d = drivers.find(x => x.id === code);
    return d ? `${code} · ${d.lastName}` : code;
  };

  const placed = positions.filter(Boolean);
  const dupes = new Set(placed.filter((c, i) => placed.indexOf(c) !== i));
  const showSprint = race.isSprint || !!pred?.sprint_winner;

  async function save() {
    setSaving(true);
    try {
      const res = await api.admin.savePred(user.id, race.round, {
        pole: pole || null,
        positions: positions.map(p => p || null),
        dnf: dnf || null,
        sprintWinner: showSprint ? (sprint || null) : null,
      });
      setToast(res.scored
        ? `R${race.round} tip saved for ${user.display_name} — rescored: ${res.points} pts`
        : `R${race.round} tip saved for ${user.display_name} (no result yet to score)`);
      onSaved();
    } catch (err) {
      setToast(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  const pick = (value, onChange, aria, invalid) => (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={aria} disabled={saving}
      style={{ width: '100%', background: 'var(--bg)', border: `1px solid ${invalid ? 'var(--red)' : 'var(--line)'}`, borderRadius: 3,
        color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: large ? 16 : 11, padding: large ? '8px 6px' : '4px 6px' }}>
      <option value="">—</option>
      {codes.map(c => <option key={c} value={c}>{label(c)}</option>)}
    </select>
  );

  const field = (name, control) => (
    <label key={name} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{name}</span>
      {control}
    </label>
  );

  return (
    <div style={{ padding: '12px 14px', background: 'var(--surface-2)' }}>
      <div style={{ fontSize: 12, marginBottom: 10 }}>
        <strong>{pred ? 'Edit' : 'Enter'} {user.display_name}'s tip for R{race.round}</strong>
        <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>
          Saving replaces any manual points override and rescores the round if it has a result.
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${large ? 140 : 120}px, 1fr))`, gap: 8 }}>
        {field('Pole', pick(pole, setPole, 'Pole'))}
        {positions.map((v, i) => field(`P${i + 1}`, pick(v,
          val => setPositions(prev => prev.map((p, j) => (j === i ? val : p))), `P${i + 1}`, v && dupes.has(v))))}
        {field('DNF', pick(dnf, setDnf, 'DNF'))}
        {showSprint && field('Sprint winner', pick(sprint, setSprint, 'Sprint winner'))}
      </div>
      {dupes.size > 0 && (
        <div style={{ color: 'var(--red-2)', fontSize: 11, marginTop: 8 }}>
          A driver can only be picked once in the top 10: {[...dupes].join(', ')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={saving || dupes.size > 0}>
          {saving ? 'Saving…' : 'Save tip & rescore →'}
        </button>
      </div>
    </div>
  );
}

