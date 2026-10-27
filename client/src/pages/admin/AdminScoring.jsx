import { useState, useEffect } from 'react';
import { api } from '../../api';
import Topbar from '../../components/Topbar';

export default function AdminScoring({ setToast }) {
  const [rules, setRules] = useState([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.admin.scoring().then(setRules).catch(err => setToast(`Error loading rules: ${err.message}`));
  }, []);

  function update(id, points) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, points: parseInt(points) || 0 } : r));
    setDirty(true);
  }

  async function save() {
    try {
      await api.admin.saveScoring(rules.map(r => ({ id: r.id, points: r.points })));
      setDirty(false);
      setToast('Scoring rules saved and all scored rounds recalculated');
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
  }

  return (
    <>
      <Topbar crumbs={['Admin', 'Scoring Rules']} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 className="page-title">Scoring Rules</h2>
            <div className="page-sub">Edit point values — changes apply to all future score calculations</div>
          </div>
          <button className="btn primary" disabled={!dirty} onClick={save}>Save changes →</button>
        </div>

        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.rule_key}</td>
                  <td style={{ fontSize: 13 }}>{r.description}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={r.points}
                      aria-label={`Points for ${r.rule_key}`}
                      onChange={e => update(r.id, e.target.value)}
                      style={{
                        width: 64, height: 34, textAlign: 'center',
                        background: 'var(--bg)', border: '1px solid var(--line)',
                        borderRadius: 3, color: 'var(--text)',
                        fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 16, lineHeight: 1.7, maxWidth: '90ch' }}>
          Note: changing point values does not automatically rescore past races. Use the Results page to trigger a rescore for individual rounds.
        </div>
      </div>
    </>
  );
}
