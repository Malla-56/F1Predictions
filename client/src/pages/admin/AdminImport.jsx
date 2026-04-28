import { useState } from 'react';
import { api } from '../../api';
import Topbar from '../../components/Topbar';

const EXAMPLE = JSON.stringify([
  {
    round: 1,
    season: 2026,
    predictions: [
      {
        username: "jcoxon",
        pole: "VER",
        positions: ["VER","NOR","LEC","PIA","HAM","RUS","SAI","ALO","STR","TSU"],
        dnf: "ALB",
        sprintWinner: null
      },
      {
        username: "alice",
        pole: "NOR",
        positions: ["NOR","VER","LEC","HAM","PIA","RUS","ALO","SAI","STR","TSU"],
        dnf: "SAR",
        sprintWinner: null
      }
    ]
  },
  {
    round: 2,
    season: 2026,
    predictions: [
      {
        username: "jcoxon",
        pole: "LEC",
        positions: ["LEC","VER","NOR","HAM","PIA","RUS","SAI","ALO","STR","TSU"],
        dnf: null,
        sprintWinner: null
      }
    ]
  }
], null, 2);

export default function AdminImport({ setToast }) {
  const [json, setJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setResult(null);

    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError('Invalid JSON — check your formatting');
      return;
    }

    setLoading(true);
    try {
      const res = await api.admin.import(parsed);
      setResult(res.summary);
      const total = res.summary.reduce((s, r) => s + r.imported, 0);
      setToast(`Imported ${total} prediction(s) across ${res.summary.length} race(s)`);
      setJson('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Topbar crumbs={['Admin', 'Import']} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>Import Past Predictions</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              Paste JSON to bulk-import players' predictions from paper records. Scores are calculated automatically if race results already exist.
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          <div>
            <form onSubmit={submit}>
              <div className="fld" style={{ marginBottom: 14 }}>
                <label>JSON Data</label>
                <textarea
                  value={json}
                  onChange={e => setJson(e.target.value)}
                  placeholder="Paste your JSON array here…"
                  rows={22}
                  style={{ fontFamily: 'var(--mono)', fontSize: 12, resize: 'vertical', width: '100%' }}
                  required
                />
              </div>

              {error && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--red-2)', marginBottom: 14 }}>✗ {error}</div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn primary" disabled={loading}>
                  {loading ? 'Importing…' : 'Import →'}
                </button>
                <button type="button" className="btn" onClick={() => { setJson(EXAMPLE); setResult(null); setError(''); }}>
                  Load Example
                </button>
              </div>
            </form>

            {result && (
              <div style={{ marginTop: 20 }}>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.12em', marginBottom: 10, textTransform: 'uppercase' }}>Import Summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {result.map((r, i) => (
                    <div key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                        Round {r.round} · {r.season}
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>
                        ✓ {r.imported} prediction{r.imported !== 1 ? 's' : ''} imported
                      </div>
                      {r.scored && (
                        <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>✓ Auto-scored against existing result</div>
                      )}
                      {!r.scored && (
                        <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          ⏳ No result yet — add it in Results tab to score
                        </div>
                      )}
                      {r.skipped.length > 0 && (
                        <div className="mono" style={{ fontSize: 11, color: 'var(--red-2)', marginTop: 4 }}>
                          ✗ Unknown users: {r.skipped.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Format Guide</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
              <div>Array of race records. Each race has a <code className="mono" style={{ background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 3 }}>round</code> and a <code className="mono" style={{ background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 3 }}>predictions</code> array — one entry per player.</div>

              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 600, marginBottom: 4 }}>Per prediction</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {[
                      ['username', 'Their login username'],
                      ['pole', 'Driver abbreviation e.g. "VER"'],
                      ['positions', 'Array of 10 driver abbreviations, P1 → P10'],
                      ['dnf', 'Driver abbreviation or null'],
                      ['sprintWinner', 'Driver abbreviation or null'],
                    ].map(([field, desc]) => (
                      <tr key={field} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '6px 8px 6px 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{field}</td>
                        <td style={{ padding: '6px 0' }}>{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 600, marginBottom: 4 }}>Scoring</div>
                If a race result is already saved (via the Results tab), predictions are scored immediately on import. Otherwise add the result afterwards and use the Rescore button.
              </div>

              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 600, marginBottom: 4 }}>Driver abbreviations</div>
                Use the 3-letter codes from OpenF1: VER, NOR, LEC, PIA, HAM, RUS, SAI, ALO, STR, TSU, HUL, OCO, GAS, BEA, ANT, DOO, BOR, HAD, LAW, COL
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
