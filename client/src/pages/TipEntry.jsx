import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAppData } from '../context/AppDataContext';
import Topbar from '../components/Topbar';
import DriverChip from '../components/DriverChip';
import DriverDropdown from '../components/DriverDropdown';

function DragRow({ position, driverId, onSwap, dragState, setDragState }) {
  const onDragStart = e => { setDragState({ from: position }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(position)); };
  const onDragOver  = e => { e.preventDefault(); setDragState(s => ({ ...s, over: position })); };
  const onDrop      = e => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); if (from !== position) onSwap(from, position); setDragState({}); };
  const onDragEnd   = () => setDragState({});

  const cls = ['dragrow', dragState.from === position ? 'dragging' : '', dragState.over === position && dragState.from !== position ? 'over' : ''].filter(Boolean).join(' ');
  const pill = position === 0 ? 'gold' : position < 3 ? 'silver' : '';

  return (
    <div className={cls} draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}>
      <div className={`pos-pill${pill ? ' ' + pill : ''}`}>P{position + 1}</div>
      {driverId ? <DriverChip driverId={driverId} showName /> : <span className="muted">empty slot</span>}
      <div className="grip">⋮⋮</div>
    </div>
  );
}

export default function TipEntry({ setToast }) {
  const { round } = useParams();
  const navigate = useNavigate();
  const { races, countryFlag } = useAppData();
  const race = races.find(r => r.round === parseInt(round));

  const [top10, setTop10] = useState(Array(10).fill(null));
  const [pole, setPole] = useState(null);
  const [dnf, setDnf] = useState(null);
  const [sprintWinner, setSprintWinner] = useState(null);
  const [dragState, setDragState] = useState({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scoringRules, setScoringRules] = useState([]);

  useEffect(() => {
    if (!round) return;
    api.predictions.mine(parseInt(round)).then(pred => {
      if (pred) {
        setTop10(pred.positions || Array(10).fill(null));
        setPole(pred.pole || null);
        setDnf(pred.dnf || null);
        setSprintWinner(pred.sprintWinner || null);
      }
    }).catch(() => {});
    api.admin.scoring().then(setScoringRules).catch(() => {});
  }, [round]);

  function swap(from, to) {
    setTop10(arr => {
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function setSlot(i, driverId) {
    setTop10(arr => {
      const next = [...arr];
      const existing = arr.indexOf(driverId);
      if (existing > -1) next[existing] = arr[i];
      next[i] = driverId;
      return next;
    });
  }

  const valid = top10.every(Boolean) && pole && dnf;
  const isLocked = race?.isLocked;

  async function lockIn() {
    setSaving(true);
    try {
      await api.predictions.save(parseInt(round), { pole, positions: top10, dnf, sprintWinner });
      setToast(`Tips locked in for ${race?.name}`);
      setShowConfirm(false);
      navigate('/home');
    } catch (err) {
      setToast(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    try {
      await api.predictions.save(parseInt(round), { pole, positions: top10, dnf, sprintWinner });
      setToast('Draft saved');
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
  }

  const crumbs = ['Pulse League', 'Tip Entry', race ? `R${String(race.round).padStart(2,'0')} · ${race.name}` : '…'];

  return (
    <>
      <Topbar crumbs={crumbs} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>
              R{String(parseInt(round)).padStart(2,'0')} · Tip Entry
            </div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 }}>
              {race?.name || 'Loading…'}{' '}
              <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>· {race ? countryFlag(race.countryCode) : ''}</span>
            </h2>
            <div className="muted" style={{ marginTop: 6 }}>{race?.circuit}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn ghost" onClick={() => navigate('/home')}>← Back</button>
          </div>
        </div>

        {isLocked && (
          <div className="card" style={{ padding: '14px 18px', marginBottom: 18, borderColor: 'rgba(225,6,0,0.4)', background: 'var(--red-dim)' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--red-2)', letterSpacing: '0.08em' }}>
              ✗ TIPS ARE LOCKED FOR THIS RACE — READ ONLY VIEW
            </span>
          </div>
        )}

        <div className="entry-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="entry-card">
              <div>
                <h3>Pole Position</h3>
                <div className="hint" style={{ marginTop: 6 }}>Single driver · +{scoringRules.find(r => r.rule_key === 'pole_correct')?.points ?? 2} pts if correct</div>
              </div>
              {isLocked
                ? <DriverChip driverId={pole} showName />
                : <DriverDropdown value={pole} onChange={setPole} placeholder="Select pole driver" />
              }
            </div>

            <div className="entry-card">
              <div>
                <h3>Did Not Finish</h3>
                <div className="hint" style={{ marginTop: 6 }}>Pick the most likely retirement · +{scoringRules.find(r => r.rule_key === 'dnf_correct')?.points ?? 1} pts</div>
              </div>
              {isLocked
                ? <DriverChip driverId={dnf} showName />
                : <DriverDropdown value={dnf} onChange={setDnf} placeholder="Select DNF driver" />
              }
            </div>

            {race?.isSprint && (
              <div className="entry-card">
                <div>
                  <h3>Sprint Winner</h3>
                  <div className="hint" style={{ marginTop: 6 }}>Sprint race winner · +{scoringRules.find(r => r.rule_key === 'sprint_winner_correct')?.points ?? 2} pts</div>
                </div>
                {isLocked
                  ? <DriverChip driverId={sprintWinner} showName />
                  : <DriverDropdown value={sprintWinner} onChange={setSprintWinner} placeholder="Select sprint winner" />
                }
              </div>
            )}

            <div className="entry-card" style={{ background: 'var(--surface-2)', borderStyle: 'dashed' }}>
              <h3>Scoring Guide</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px' }} className="mono">
                {scoringRules.map(r => (
                  <span key={r.rule_key} style={{ display: 'contents' }}>
                    <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{r.description.split('·')[0]}</span>
                    <span style={{ fontSize: 11 }}>+{r.points} pts</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="entry-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Race Finish · P1 → P10</h3>
              {!isLocked && <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.06em' }}>Drag rows to reorder</span>}
            </div>

            <div className="draglist">
              {top10.map((id, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: isLocked ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <DragRow position={i} driverId={id} onSwap={swap} dragState={dragState} setDragState={setDragState} />
                  {!isLocked && (
                    <DriverDropdown value={id} onChange={d => setSlot(i, d)} exclude={top10} />
                  )}
                </div>
              ))}
            </div>

            {!isLocked && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <div className="mono" style={{ fontSize: 11, color: valid ? 'var(--green)' : 'var(--text-3)', letterSpacing: '0.08em' }}>
                  {valid ? '✓ ALL PICKS COMPLETE' : '✗ INCOMPLETE PICKS'}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn ghost" onClick={saveDraft}>Save draft</button>
                  <button className="btn primary" disabled={!valid} onClick={() => setShowConfirm(true)}>
                    Lock in tips →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showConfirm && (
        <div className="modal-bg" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Lock in your tips?</h3>
            <p className="muted">Once locked, picks for {race?.name} can't be changed.</p>
            <div className="modal-summary">
              <div className="item">
                <span className="lbl">Pole</span>
                <DriverChip driverId={pole} showName />
              </div>
              <div className="item">
                <span className="lbl">Winner</span>
                <DriverChip driverId={top10[0]} showName />
              </div>
              <div className="item">
                <span className="lbl">DNF</span>
                <DriverChip driverId={dnf} showName />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn primary" onClick={lockIn} disabled={saving}>
                {saving ? 'Saving…' : 'Confirm lock →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
