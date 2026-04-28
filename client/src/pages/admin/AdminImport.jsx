import { useState } from 'react';
import Papa from 'papaparse';
import { api } from '../../api';
import Topbar from '../../components/Topbar';

// ── CSV helpers ────────────────────────────────────────────────────────────

const REQUIRED_HEADERS = ['round', 'mode', 'username'];
const VALID_MODES = ['picks', 'points'];
const PICK_COLS = ['pole', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'dnf', 'sprint_winner'];

function validateCsvRows(rows) {
  const errors = [];
  const valid = [];

  if (rows.length === 0) { errors.push('CSV has no data rows'); return { valid, errors }; }

  const missing = REQUIRED_HEADERS.filter(h => !(h in rows[0]));
  if (missing.length > 0) {
    errors.push(`Missing required columns: ${missing.join(', ')}`);
    return { valid, errors };
  }

  rows.forEach((row, i) => {
    const line = i + 2;
    row.mode = (row.mode || '').toLowerCase();
    const round = parseInt(row.round);
    if (!row.round || isNaN(round) || round < 1) { errors.push(`Row ${line}: invalid round "${row.round}"`); return; }
    if (!row.username) { errors.push(`Row ${line}: missing username`); return; }
    if (!VALID_MODES.includes(row.mode)) { errors.push(`Row ${line}: unknown mode "${row.mode}" — must be picks or points`); return; }

    if (row.mode === 'picks') {
      const hasDriver = PICK_COLS.some(k => row[k]);
      if (!hasDriver) {
        const pts = parseInt(row.points_override);
        if (!isNaN(pts)) {
          row.mode = 'points'; // auto-promote: no drivers but has a points value
        } else {
          return; // truly blank row — skip silently
        }
      }
    }

    if (row.mode === 'points') {
      const pts = parseInt(row.points_override);
      if (isNaN(pts)) { errors.push(`Row ${line}: mode=points but points_override is "${row.points_override}"`); return; }
    }

    valid.push(row);
  });

  return { valid, errors };
}

function buildPicksPayload(rows) {
  const byRound = {};
  for (const row of rows) {
    const key = `${row.round}-${row.season || 2026}`;
    if (!byRound[key]) byRound[key] = { round: +row.round, season: +(row.season || 2026), predictions: [] };
    byRound[key].predictions.push({
      username:     row.username,
      pole:         row.pole || null,
      positions:    ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10'].map(k => row[k] || null),
      dnf:          row.dnf || null,
      sprintWinner: row.sprint_winner || null,
    });
  }
  return Object.values(byRound);
}

function buildPointsPayload(rows) {
  return rows.map(row => ({
    round:    +row.round,
    season:   +(row.season || 2026),
    username: row.username,
    points:   +row.points_override,
  }));
}

async function downloadTemplate(setToast) {
  try {
    const [users, races] = await Promise.all([api.admin.users(), api.races.list()]);
    const active = users.filter(u => u.is_active);
    const header = 'round,mode,username,pole,p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,dnf,sprint_winner,points_override';
    const rows = [];
    for (const race of races)
      for (const user of active)
        rows.push(`${race.round},picks,${user.username},,,,,,,,,,,,,,`);
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `predictions_template_${new Date().getFullYear()}.csv`,
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    setToast('Failed to generate template — check server is running');
  }
}

// ── CSV Tab ────────────────────────────────────────────────────────────────

function CsvTab({ setToast }) {
  const [csvErrors, setCsvErrors] = useState([]);
  const [csvParsed, setCsvParsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files[0];
    setCsvErrors([]); setCsvParsed(null); setResult(null);
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      trimHeaders: true,
      transform: val => val.trim(),
      complete: ({ data, errors }) => {
        if (errors.length > 0) {
          setCsvErrors(errors.map(err => `Row ${err.row}: ${err.message}`));
          return;
        }
        const { valid, errors: valErrors } = validateCsvRows(data);
        const shown = valErrors.length > 10
          ? [...valErrors.slice(0, 10), `…and ${valErrors.length - 10} more`]
          : valErrors;
        setCsvErrors(shown);
        if (valErrors.length === 0) {
          setCsvParsed({
            picks:  valid.filter(r => r.mode === 'picks'),
            points: valid.filter(r => r.mode === 'points'),
          });
        }
      },
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!csvParsed) return;
    setLoading(true); setResult(null);

    const out = { picks: null, points: null, errors: [] };
    const calls = [];

    if (csvParsed.picks.length > 0)
      calls.push(
        api.admin.import(buildPicksPayload(csvParsed.picks))
          .then(r => { out.picks = r.summary; })
          .catch(err => out.errors.push(`Picks: ${err.message}`))
      );

    if (csvParsed.points.length > 0)
      calls.push(
        api.admin.overrideScores(buildPointsPayload(csvParsed.points))
          .then(r => { out.points = r.summary; })
          .catch(err => out.errors.push(`Score override: ${err.message}`))
      );

    await Promise.all(calls);
    setLoading(false);
    setResult(out);

    const picksCount  = (out.picks  || []).reduce((s, r) => s + r.imported, 0);
    const pointsCount = (out.points || []).reduce((s, r) => s + r.written,  0);
    setToast(out.errors.length === 0
      ? `Imported ${picksCount} pick(s) · ${pointsCount} score override(s)`
      : 'Import finished with errors — see summary below'
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680 }}>
      <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Step 1 — Download template</div>
          <div className="muted" style={{ fontSize: 12 }}>Pre-filled with all active users × all rounds. Fill in driver codes, then upload.</div>
        </div>
        <button className="btn" onClick={() => downloadTemplate(setToast)}>Download CSV →</button>
      </div>

      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Step 2 — Upload filled CSV</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>
          <strong>mode=picks</strong>: fill pole, p1–p10, dnf, sprint_winner — server calculates points.<br />
          <strong>mode=points</strong>: fill points_override only — writes total directly (use for Australian GP).
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-2)' }}
          />
          {csvErrors.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {csvErrors.map((err, i) => (
                <div key={i} className="mono" style={{ fontSize: 11, color: 'var(--red-2)' }}>✗ {err}</div>
              ))}
            </div>
          )}
          {csvParsed && csvErrors.length === 0 && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--green)' }}>
              ✓ {csvParsed.picks.length} picks row(s) · {csvParsed.points.length} points override row(s) ready
            </div>
          )}
          <div>
            <button className="btn primary" type="submit" disabled={!csvParsed || loading}>
              {loading ? 'Importing…' : 'Import CSV →'}
            </button>
          </div>
        </form>
      </div>

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Import Summary</div>

          {result.errors.map((err, i) => (
            <div key={i} className="mono" style={{ fontSize: 11, color: 'var(--red-2)' }}>✗ {err}</div>
          ))}

          {(result.picks || []).map((r, i) => (
            <div key={`p-${i}`} className="card" style={{ padding: '10px 14px' }}>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                Round {r.round} · {r.season} — Picks
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>✓ {r.imported} prediction{r.imported !== 1 ? 's' : ''} imported</div>
              {r.scored
                ? <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>✓ Auto-scored</div>
                : <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>⏳ No result yet — add result to score</div>
              }
              {r.skipped.length > 0 && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--red-2)', marginTop: 4 }}>✗ Unknown: {r.skipped.join(', ')}</div>
              )}
            </div>
          ))}

          {(result.points || []).map((r, i) => (
            <div key={`o-${i}`} className="card" style={{ padding: '10px 14px' }}>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                Round {r.round} · {r.season} — Score Overrides
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>✓ {r.written} score{r.written !== 1 ? 's' : ''} written</div>
              {r.skipped.length > 0 && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--red-2)', marginTop: 4 }}>✗ Unknown: {r.skipped.join(', ')}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── JSON Tab (legacy) ──────────────────────────────────────────────────────

const EXAMPLE = JSON.stringify([
  {
    round: 1,
    season: 2026,
    predictions: [
      {
        username: 'jcoxon',
        pole: 'VER',
        positions: ['VER','NOR','LEC','PIA','HAM','RUS','SAI','ALO','STR','TSU'],
        dnf: 'ALB',
        sprintWinner: null,
      },
    ],
  },
], null, 2);

function JsonTab({ setToast }) {
  const [json, setJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError(''); setResult(null);
    let parsed;
    try { parsed = JSON.parse(json); }
    catch { setError('Invalid JSON — check your formatting'); return; }

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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start', maxWidth: 1000 }}>
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
                  <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Round {r.round} · {r.season}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>✓ {r.imported} prediction{r.imported !== 1 ? 's' : ''} imported</div>
                  {r.scored
                    ? <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>✓ Auto-scored against existing result</div>
                    : <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>⏳ No result yet — add it in Results tab to score</div>
                  }
                  {r.skipped.length > 0 && (
                    <div className="mono" style={{ fontSize: 11, color: 'var(--red-2)', marginTop: 4 }}>✗ Unknown users: {r.skipped.join(', ')}</div>
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
            <div style={{ fontFamily: 'var(--display)', fontWeight: 600, marginBottom: 4 }}>Driver abbreviations</div>
            VER, NOR, LEC, PIA, HAM, RUS, SAI, ALO, STR, TSU, HUL, OCO, GAS, BEA, ANT, DOO, BOR, HAD, LAW, COL
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminImport({ setToast }) {
  const [tab, setTab] = useState('csv');

  return (
    <>
      <Topbar crumbs={['Admin', 'Import']} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>Import Predictions</h2>
            <div className="muted" style={{ marginTop: 6 }}>Bulk-import historical picks via CSV, or paste raw JSON</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <button className={`btn${tab === 'csv' ? ' primary' : ''}`} onClick={() => setTab('csv')}>CSV Import</button>
          <button className={`btn${tab === 'json' ? ' primary' : ''}`} onClick={() => setTab('json')}>JSON (Legacy)</button>
        </div>

        {tab === 'csv'  && <CsvTab  setToast={setToast} />}
        {tab === 'json' && <JsonTab setToast={setToast} />}
      </div>
    </>
  );
}
