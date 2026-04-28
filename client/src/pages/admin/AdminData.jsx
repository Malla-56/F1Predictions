import { useState, useEffect, Fragment } from 'react';
import Papa from 'papaparse';
import { api } from '../../api';
import { useAppData } from '../../context/AppDataContext';
import Topbar from '../../components/Topbar';

// ── Data helpers ───────────────────────────────────────────────────────────

function buildPredMap(flat) {
  const map = {};
  for (const p of flat) {
    if (!map[p.round]) map[p.round] = {};
    map[p.round][p.username] = p;
  }
  return map;
}

function buildScoreMap(leaderboard, users) {
  const byId = {};
  users.forEach(u => { byId[u.id] = u.username; });
  const map = {};
  for (const row of leaderboard) {
    const uname = byId[row.userId];
    if (!uname) continue;
    for (const [round, data] of Object.entries(row.perRace || {})) {
      if (!map[+round]) map[+round] = {};
      map[+round][uname] = data.points;
    }
  }
  return map;
}

function downloadBlob(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generatePredCsv(predMap, users, races) {
  const header = 'round,mode,username,pole,p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,dnf,sprint_winner,points_override';
  const rows = [];
  for (const race of races) {
    for (const user of users) {
      const p = (predMap[race.round] || {})[user.username];
      if (p) {
        rows.push([
          race.round, 'picks', user.username,
          p.pole || '', p.pos_1 || '', p.pos_2 || '', p.pos_3 || '',
          p.pos_4 || '', p.pos_5 || '', p.pos_6 || '', p.pos_7 || '',
          p.pos_8 || '', p.pos_9 || '', p.pos_10 || '',
          p.dnf || '', p.sprint_winner || '', '',
        ].join(','));
      }
    }
  }
  return [header, ...rows].join('\n');
}

function generateScoresCsv(leaderboard, races) {
  const roundNums = races.map(r => r.round);
  const header = ['Rank', 'Player', 'Total', ...roundNums.map(r => `R${String(r).padStart(2, '0')}`)].join(',');
  const rows = leaderboard.map(u => {
    const cells = [u.rank, `"${u.displayName}"`, u.total];
    for (const r of roundNums) cells.push(u.perRace?.[r]?.points ?? '');
    return cells.join(',');
  });
  return [header, ...rows].join('\n');
}

// ── CSV import helpers (same logic as AdminImport) ─────────────────────────

const REQUIRED_HEADERS = ['round', 'mode', 'username'];
const VALID_MODES = ['picks', 'points'];
const PICK_COLS = ['pole', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'dnf', 'sprint_winner'];

function validateCsvRows(rows) {
  const errors = [], valid = [];
  if (!rows.length) { errors.push('CSV has no data rows'); return { valid, errors }; }
  const missing = REQUIRED_HEADERS.filter(h => !(h in rows[0]));
  if (missing.length) { errors.push(`Missing required columns: ${missing.join(', ')}`); return { valid, errors }; }
  rows.forEach((row, i) => {
    const line = i + 2;
    row.mode = (row.mode || '').toLowerCase(); // normalise case — Excel may capitalise
    const round = parseInt(row.round);
    if (!row.round || isNaN(round) || round < 1) { errors.push(`Row ${line}: invalid round "${row.round}"`); return; }
    if (!row.username) { errors.push(`Row ${line}: missing username`); return; }
    if (!VALID_MODES.includes(row.mode)) { errors.push(`Row ${line}: unknown mode "${row.mode}" — must be picks or points`); return; }
    if (row.mode === 'picks' && !PICK_COLS.some(k => row[k])) {
      const pts = parseInt(row.points_override);
      if (!isNaN(pts)) row.mode = 'points'; // auto-promote: no drivers but has a points value
      else return; // truly blank — skip silently
    }
    if (row.mode === 'points' && isNaN(parseInt(row.points_override))) {
      errors.push(`Row ${line}: mode=points but points_override is "${row.points_override}"`); return;
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
      username: row.username, pole: row.pole || null,
      positions: ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10'].map(k => row[k] || null),
      dnf: row.dnf || null, sprintWinner: row.sprint_winner || null,
    });
  }
  return Object.values(byRound);
}

function buildPointsPayload(rows) {
  return rows.map(row => ({ round: +row.round, season: +(row.season || 2026), username: row.username, points: +row.points_override }));
}

// ── Coverage section ───────────────────────────────────────────────────────

const POS_KEYS = ['pos_1','pos_2','pos_3','pos_4','pos_5','pos_6','pos_7','pos_8','pos_9','pos_10'];

function CoverageSection({ races, users, predMap, scoreMap, setToast, onDataChange }) {
  const [expanded, setExpanded] = useState(null);
  const [overrides, setOverrides] = useState({});  // { username: string }
  const [saving, setSaving] = useState(false);

  function openRound(round) {
    setExpanded(prev => prev === round ? null : round);
    setOverrides({});
  }

  async function saveOverrides(round) {
    const payload = Object.entries(overrides)
      .filter(([, v]) => v !== '' && !isNaN(parseInt(v)))
      .map(([username, points]) => ({ round, season: 2026, username, points: parseInt(points) }));
    if (!payload.length) return;
    setSaving(true);
    try {
      await api.admin.overrideScores(payload);
      setToast(`Scores saved for R${round}`);
      setOverrides({});
      onDataChange();
    } catch (err) {
      setToast(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!races.length || !users.length) return <div className="muted" style={{ fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {races.map(race => {
        const roundPreds = predMap[race.round] || {};
        const roundScores = scoreMap[race.round] || {};
        const covered = users.filter(u => roundPreds[u.username]).length;
        const pct = Math.round((covered / users.length) * 100);
        const isOpen = expanded === race.round;
        const hasUnsaved = isOpen && Object.values(overrides).some(v => v !== '');

        return (
          <div key={race.round} style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            <div
              onClick={() => openRound(race.round)}
              style={{ display: 'grid', gridTemplateColumns: '48px 1fr 120px 80px 32px', gap: 12, alignItems: 'center', padding: '10px 14px', cursor: 'pointer', background: isOpen ? 'var(--surface-2)' : 'transparent' }}
            >
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>R{String(race.round).padStart(2,'0')}</div>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13 }}>{race.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 2 }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: pct === 100 ? 'var(--green)' : pct > 50 ? '#f5a623' : 'var(--red)' }} />
                </div>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{covered}/{users.length}</span>
              </div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {users.map(u => {
                  const hasPred = !!roundPreds[u.username];
                  const hasScore = roundScores[u.username] != null;
                  const color = !hasPred ? 'var(--red)' : hasScore ? 'var(--green)' : '#f5a623';
                  return <div key={u.username} title={`${u.display_name}: ${!hasPred ? 'missing' : hasScore ? `${roundScores[u.username]}pts` : 'no score'}`} style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />;
                })}
              </div>
              <div style={{ color: 'var(--text-3)', fontSize: 12, textAlign: 'right' }}>{isOpen ? '▲' : '▼'}</div>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--line)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <th style={thStyle}>User</th>
                        <th style={thStyle}>Pole</th>
                        {POS_KEYS.map((_, i) => <th key={i} style={thStyle}>P{i+1}</th>)}
                        <th style={thStyle}>DNF</th>
                        <th style={thStyle}>Sprint</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => {
                        const p = roundPreds[u.username];
                        const pts = roundScores[u.username];

                        if (!p) {
                          // No picks — show a direct score input instead of a wall of dashes
                          const val = overrides[u.username] ?? (pts != null ? String(pts) : '');
                          return (
                            <tr key={u.username} style={{ background: 'rgba(225,6,0,0.06)', borderTop: '1px solid var(--line)' }}>
                              <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--red-2)' }}>
                                {u.display_name}
                                <span className="mono" style={{ fontSize: 10, marginLeft: 6 }}>
                                  {pts != null ? 'override' : 'missing'}
                                </span>
                              </td>
                              <td colSpan={POS_KEYS.length + 2} style={{ ...tdStyle, color: 'var(--text-3)', fontStyle: 'italic' }}>
                                no picks — enter total score:
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>
                                <input
                                  type="number"
                                  min="0"
                                  max="200"
                                  placeholder="pts"
                                  value={val}
                                  onChange={e => setOverrides(prev => ({ ...prev, [u.username]: e.target.value }))}
                                  onClick={e => e.stopPropagation()}
                                  style={{ width: 60, height: 28, textAlign: 'center', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 3, color: 'var(--text)', fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13 }}
                                />
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={u.username} style={{ borderTop: '1px solid var(--line)' }}>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{u.display_name}</td>
                            <td style={{ ...tdStyle, fontFamily: 'var(--mono)' }}>{p.pole || '—'}</td>
                            {POS_KEYS.map(k => <td key={k} style={{ ...tdStyle, fontFamily: 'var(--mono)' }}>{p[k] || '—'}</td>)}
                            <td style={{ ...tdStyle, fontFamily: 'var(--mono)' }}>{p.dnf || '—'}</td>
                            <td style={{ ...tdStyle, fontFamily: 'var(--mono)' }}>{p.sprint_winner || '—'}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--display)', fontWeight: 700, color: pts != null ? 'var(--green)' : 'var(--text-3)' }}>
                              {pts != null ? pts : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {hasUnsaved && (
                  <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn primary" onClick={() => saveOverrides(race.round)} disabled={saving}>
                      {saving ? 'Saving…' : 'Save score overrides →'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const thStyle = { padding: '7px 10px', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', fontWeight: 400, letterSpacing: '0.06em', whiteSpace: 'nowrap' };
const tdStyle = { padding: '7px 10px', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-2)' };

// ── Import section ─────────────────────────────────────────────────────────

function ImportSection({ setToast, onSuccess }) {
  const [csvErrors, setCsvErrors] = useState([]);
  const [csvParsed, setCsvParsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  function handleFile(e) {
    const file = e.target.files[0];
    setCsvErrors([]); setCsvParsed(null); setResult(null);
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true, trimHeaders: true,
      transform: val => val.trim(),
      complete: ({ data, errors }) => {
        if (errors.length) { setCsvErrors(errors.map(e => `Row ${e.row}: ${e.message}`)); return; }
        const { valid, errors: ve } = validateCsvRows(data);
        const shown = ve.length > 10 ? [...ve.slice(0, 10), `…and ${ve.length - 10} more`] : ve;
        setCsvErrors(shown);
        if (!ve.length) setCsvParsed({ picks: valid.filter(r => r.mode === 'picks'), points: valid.filter(r => r.mode === 'points') });
      },
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!csvParsed) return;
    setLoading(true); setResult(null);
    const out = { picks: null, points: null, errors: [] };
    const calls = [];
    if (csvParsed.picks.length) calls.push(api.admin.import(buildPicksPayload(csvParsed.picks)).then(r => { out.picks = r.summary; }).catch(err => out.errors.push(`Picks: ${err.message}`)));
    if (csvParsed.points.length) calls.push(api.admin.overrideScores(buildPointsPayload(csvParsed.points)).then(r => { out.points = r.summary; }).catch(err => out.errors.push(`Override: ${err.message}`)));
    await Promise.all(calls);
    setLoading(false);
    setResult(out);
    const pc = (out.picks || []).reduce((s, r) => s + r.imported, 0);
    const sc = (out.points || []).reduce((s, r) => s + r.written, 0);
    setToast(out.errors.length ? 'Import finished with errors' : `Imported ${pc} pick(s) · ${sc} score override(s)`);
    if (!out.errors.length) onSuccess();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="file" accept=".csv" onChange={handleFile} style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-2)' }} />
        {csvErrors.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {csvErrors.map((err, i) => <div key={i} className="mono" style={{ fontSize: 11, color: 'var(--red-2)' }}>✗ {err}</div>)}
          </div>
        )}
        {csvParsed && !csvErrors.length && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--green)' }}>✓ {csvParsed.picks.length} picks row(s) · {csvParsed.points.length} override row(s) ready</div>
        )}
        <div><button className="btn primary" type="submit" disabled={!csvParsed || loading}>{loading ? 'Importing…' : 'Import CSV →'}</button></div>
      </form>

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {result.errors.map((e, i) => <div key={i} className="mono" style={{ fontSize: 11, color: 'var(--red-2)' }}>✗ {e}</div>)}
          {(result.picks || []).map((r, i) => (
            <div key={`pk-${i}`} className="card" style={{ padding: '10px 14px' }}>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Round {r.round} · Picks</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>✓ {r.imported} imported{r.scored ? ' · auto-scored' : ' · no result yet'}</div>
              {r.skipped.length > 0 && <div className="mono" style={{ fontSize: 11, color: 'var(--red-2)' }}>✗ Unknown: {r.skipped.join(', ')}</div>}
            </div>
          ))}
          {(result.points || []).map((r, i) => (
            <div key={`ov-${i}`} className="card" style={{ padding: '10px 14px' }}>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Round {r.round} · Score Overrides</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>✓ {r.written} score(s) written</div>
              {r.skipped.length > 0 && <div className="mono" style={{ fontSize: 11, color: 'var(--red-2)' }}>✗ Unknown: {r.skipped.join(', ')}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminData({ setToast }) {
  const { races } = useAppData();
  const [users, setUsers]         = useState([]);
  const [predMap, setPredMap]     = useState({});
  const [scoreMap, setScoreMap]   = useState({});
  const [rawPreds, setRawPreds]   = useState([]);
  const [leaderboard, setLb]      = useState([]);
  const [loading, setLoading]     = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const [u, p, lb] = await Promise.all([api.admin.users(), api.admin.exportData(), api.scores.leaderboard()]);
      const active = u.filter(x => x.is_active);
      setUsers(active);
      setRawPreds(p);
      setPredMap(buildPredMap(p));
      setLb(lb);
      setScoreMap(buildScoreMap(lb, active));
    } catch { setToast('Failed to load data'); }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const totalPossible = users.length * races.length;
  const totalFilled   = rawPreds.length;
  const scoredCount   = Object.keys(scoreMap).length;
  const missingCount  = totalPossible - totalFilled;

  function exportPreds() {
    const csv = generatePredCsv(predMap, users, races);
    downloadBlob(csv, `predictions_export_${new Date().toISOString().slice(0,10)}.csv`);
  }

  function exportScores() {
    const csv = generateScoresCsv(leaderboard, races);
    downloadBlob(csv, `scores_export_${new Date().toISOString().slice(0,10)}.csv`);
  }

  return (
    <>
      <Topbar crumbs={['Admin', 'Data Manager']} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>Data Manager</h2>
            <div className="muted" style={{ marginTop: 6 }}>View, export, and fix prediction data across all rounds</div>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            ['Predictions', totalFilled],
            ['Missing', missingCount < 0 ? 0 : missingCount],
            ['Scored rounds', scoredCount],
            ['Active users', users.length],
          ].map(([label, val]) => (
            <div key={label} className="card" style={{ padding: '14px 18px' }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 26 }}>{loading ? '…' : val}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 28, alignItems: 'start' }}>
          {/* Left: coverage + import */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Coverage */}
            <div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                Round Coverage
                <span style={{ marginLeft: 12, color: 'var(--green)' }}>● scored</span>
                <span style={{ marginLeft: 8, color: '#f5a623' }}>● picks only</span>
                <span style={{ marginLeft: 8, color: 'var(--red)' }}>● missing</span>
              </div>
              {loading
                ? <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
                : <CoverageSection races={races} users={users} predMap={predMap} scoreMap={scoreMap} />
              }
            </div>

            {/* Import */}
            <div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Import & Fix</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>
                Upload a filled CSV to add or correct data. Use <strong>mode=picks</strong> for driver selections or <strong>mode=points</strong> to write a score directly. Re-importing existing rows updates them.
              </div>
              <ImportSection setToast={setToast} onSuccess={loadData} />
            </div>
          </div>

          {/* Right: export */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 24 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Export</div>

            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Predictions CSV</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                All existing picks in editable format. Download → fix in Excel → re-import to apply corrections.
              </div>
              <button className="btn primary" onClick={exportPreds} disabled={loading || !rawPreds.length}>
                Download predictions →
              </button>
            </div>

            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Scores CSV</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                Current leaderboard with per-round point breakdown for all players.
              </div>
              <button className="btn" onClick={exportScores} disabled={loading || !leaderboard.length}>
                Download scores →
              </button>
            </div>

            <div className="card" style={{ padding: '16px 18px', borderStyle: 'dashed' }}>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Blank Template</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                Download an empty template pre-filled with all users and rounds ready to fill in.
              </div>
              <button className="btn" onClick={async () => {
                try {
                  const header = 'round,mode,username,pole,p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,dnf,sprint_winner,points_override';
                  const rows = [];
                  for (const race of races)
                    for (const user of users)
                      rows.push(`${race.round},picks,${user.username},,,,,,,,,,,,,,`);
                  downloadBlob([header, ...rows].join('\n'), `template_${new Date().getFullYear()}.csv`);
                } catch { setToast('Failed to generate template'); }
              }} disabled={loading}>
                Download template →
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
