import { useState, useEffect, Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAppData } from '../context/AppDataContext';
import Topbar from '../components/Topbar';
import DriverChip from '../components/DriverChip';
import DriverPicker from '../components/DriverPicker';
import Icon from '../components/Icon';
import Modal from '../components/Modal';

function SlotRow({ label, tone, driverId, hint, locked, onOpen, onClear }) {
  return (
    <div className={`slot-row${locked ? ' locked' : ''}${driverId ? ' filled' : ''}`}>
      <button type="button" className="slot-main" onClick={onOpen} disabled={locked}>
        <span className={`pos-pill${tone ? ' ' + tone : ''}`}>{label}</span>
        <span className="slot-driver">
          {driverId ? <DriverChip driverId={driverId} showName /> : <span className="slot-empty">Tap to pick</span>}
        </span>
        {hint && <span className="slot-hint">{hint}</span>}
      </button>
      {!locked && driverId && (
        <button type="button" className="slot-clear" onClick={onClear} aria-label={`Clear ${label}`}>
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

export default function TipEntry({ setToast }) {
  const { round } = useParams();
  const navigate = useNavigate();
  const { races, countryFlag, loading: racesLoading } = useAppData();
  const race = races.find(r => r.round === parseInt(round));
  const notFound = !racesLoading && races.length > 0 && !race;

  const [top10, setTop10] = useState(Array(10).fill(null));
  const [pole, setPole] = useState(null);
  const [dnf, setDnf] = useState(null);
  const [sprintWinner, setSprintWinner] = useState(null);
  const [activeSlot, setActiveSlot] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scoringRules, setScoringRules] = useState([]);
  // Saving is blocked until the existing tip has loaded, so a failed load can't
  // overwrite saved picks with an empty form.
  const [loadState, setLoadState] = useState('loading');

  useEffect(() => {
    if (!round) return;
    let stale = false;
    setLoadState('loading');
    api.predictions.mine(parseInt(round)).then(pred => {
      if (stale) return;
      setTop10(pred?.positions || Array(10).fill(null));
      setPole(pred?.pole || null);
      setDnf(pred?.dnf || null);
      setSprintWinner(pred?.sprintWinner || null);
      setLoadState('ready');
    }).catch(() => { if (!stale) setLoadState('error'); });
    api.scores.rules().then(rules => { if (!stale) setScoringRules(rules); }).catch(() => {});
    return () => { stale = true; };
  }, [round]);

  const pts = (key, fallback) => scoringRules.find(r => r.rule_key === key)?.points ?? fallback;

  // Every pick in the order the picker walks through them.
  const slots = [
    ...top10.map((_, i) => ({ key: i, label: `P${i + 1}`, title: `P${i + 1}`, subtitle: 'Race finish' })),
    { key: 'pole', label: 'POLE', title: 'Pole position', subtitle: `+${pts('pole_correct', 2)} pts if correct` },
    ...(race?.isSprint
      ? [{ key: 'sprint', label: 'SPR', title: 'Sprint winner', subtitle: `+${pts('sprint_winner_correct', 2)} pts if correct` }]
      : []),
    { key: 'dnf', label: 'DNF', title: 'Did not finish', subtitle: `Most likely retirement · +${pts('dnf_correct', 1)} pts` },
  ];

  function valueOf(key, order = top10) {
    if (typeof key === 'number') return order[key];
    return { pole, dnf, sprint: sprintWinner }[key];
  }

  // Picking a driver already placed elsewhere in the finishing order swaps the two positions.
  function withDriverAt(order, i, driverId) {
    const next = [...order];
    const existing = driverId ? order.indexOf(driverId) : -1;
    if (existing > -1) next[existing] = order[i];
    next[i] = driverId;
    return next;
  }

  function assign(key, driverId) {
    if (typeof key === 'number') setTop10(order => withDriverAt(order, key, driverId));
    else ({ pole: setPole, dnf: setDnf, sprint: setSprintWinner })[key](driverId);
  }

  function pick(driverId) {
    const key = activeSlot;
    assign(key, driverId);
    // Jump to the next empty slot after this one (wrapping), or close when everything is filled.
    const order = typeof key === 'number' ? withDriverAt(top10, key, driverId) : top10;
    const idx = slots.findIndex(s => s.key === key);
    const after = [...slots.slice(idx + 1), ...slots.slice(0, idx)];
    const nextEmpty = after.find(s => !valueOf(s.key, order));
    setActiveSlot(nextEmpty ? nextEmpty.key : null);
  }

  const filledCount = slots.filter(s => valueOf(s.key)).length;
  const valid = filledCount === slots.length;
  const isLocked = race?.isLocked || loadState !== 'ready';

  async function lockIn() {
    setSaving(true);
    try {
      await api.predictions.save(parseInt(round), { pole, positions: top10, dnf, sprintWinner });
      setToast(`Tips submitted for ${race?.name}`);
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
  const isCancelled = race?.isCancelled;

  if (notFound) {
    return (
      <>
        <Topbar crumbs={crumbs} />
        <div className="content">
          <div className="results-empty">Round {round} isn't on this season's calendar.</div>
          <button className="btn ghost" onClick={() => navigate('/home')}>Back to home →</button>
        </div>
      </>
    );
  }

  if (isCancelled) {
    return (
      <>
        <Topbar crumbs={crumbs} />
        <div className="content">
          <div className="sec-head" style={{ marginTop: 0 }}>
            <div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>
                R{String(parseInt(round)).padStart(2,'0')} · Cancelled
              </div>
              <h2 className="page-title">
                {race?.name || 'Loading…'}{' '}
                <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>· {race ? countryFlag(race.countryCode) : ''}</span>
              </h2>
              <div className="page-sub">{race?.circuit}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn ghost" onClick={() => navigate('/home')}>← Back</button>
            </div>
          </div>

          <div className="card" style={{ padding: '14px 18px', marginBottom: 18, borderColor: 'var(--red-line)', background: 'var(--red-dim)' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--red-2)', letterSpacing: '0.08em' }}>
              ✗ THIS RACE HAS BEEN CANCELLED — NO TIPS REQUIRED
            </span>
          </div>

          <div className="card" style={{ padding: '28px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 16px 0', color: 'var(--text-2)' }}>This race will not take place.</p>
            <button className="btn ghost" onClick={() => navigate('/home')}>Back to home →</button>
          </div>
        </div>
      </>
    );
  }

  const active = activeSlot !== null ? slots.find(s => s.key === activeSlot) : null;
  const activeIdx = active ? slots.indexOf(active) : -1;
  // In the finishing order, show where other drivers already sit so a tap clearly means "swap".
  const taken = typeof activeSlot === 'number'
    ? Object.fromEntries(top10.map((id, i) => [id, i !== activeSlot && id ? `P${i + 1}` : null]).filter(([id, b]) => id && b))
    : {};

  const row = s => (
    <SlotRow
      key={s.key}
      label={s.label}
      tone={s.key === 0 ? 'gold' : s.key === 1 || s.key === 2 ? 'silver' : typeof s.key === 'string' ? 'bonus' : ''}
      driverId={valueOf(s.key)}
      hint={typeof s.key === 'string' ? s.subtitle : null}
      locked={isLocked}
      onOpen={() => setActiveSlot(s.key)}
      onClear={() => assign(s.key, null)}
    />
  );

  return (
    <>
      <Topbar crumbs={crumbs} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>
              R{String(parseInt(round)).padStart(2,'0')} · Tip Entry
            </div>
            <h2 className="page-title">
              {race?.name || 'Loading…'}{' '}
              <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>· {race ? countryFlag(race.countryCode) : ''}</span>
            </h2>
            <div className="page-sub">
              {race?.circuit}
              {race?.isJoker && <> · <strong style={{ color: 'var(--red)' }}>Joker round: all points count double</strong></>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn ghost" onClick={() => navigate('/home')}>← Back</button>
          </div>
        </div>

        {isLocked && loadState !== 'loading' && (
          <div className="card" style={{ padding: '14px 18px', marginBottom: 18, borderColor: 'var(--red-line)', background: 'var(--red-dim)' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--red-2)', letterSpacing: '0.08em' }}>
              {loadState === 'error'
                ? '✗ COULDN\'T LOAD YOUR SAVED TIPS — REFRESH TO TRY AGAIN'
                : '✗ TIPS ARE LOCKED FOR THIS RACE — READ ONLY VIEW'}
            </span>
          </div>
        )}

        <div className="entry-simple">
          {!isLocked && (
            <div className="entry-progress">
              <div className="entry-progress-txt">
                <span>{valid ? 'All picks done — ready to submit' : 'Tap a position, then tap a driver'}</span>
                <span className="mono">{filledCount}/{slots.length}</span>
              </div>
              <div className="entry-progress-bar"><span style={{ width: `${(filledCount / slots.length) * 100}%` }} /></div>
            </div>
          )}

          <div className="entry-card">
            <h3>Race finish · P1 → P10</h3>
            <div className="slot-list">{slots.filter(s => typeof s.key === 'number').map(row)}</div>
          </div>

          <div className="entry-side">
          <div className="entry-card">
            <h3>Bonus picks</h3>
            <div className="slot-list">{slots.filter(s => typeof s.key === 'string').map(row)}</div>
          </div>

          {scoringRules.length > 0 && (
            <details className="entry-card entry-guide">
              <summary><h3>Scoring guide</h3></summary>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 14px' }} className="mono">
                {scoringRules.map(r => (
                  <Fragment key={r.rule_key}>
                    <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{r.description.split('·')[0]}</span>
                    <span style={{ fontSize: 11, textAlign: 'right' }}>+{r.points} pts</span>
                  </Fragment>
                ))}
              </div>
            </details>
          )}

          {!isLocked && (
            <div className="entry-submit-bar">
              <button className="btn ghost" onClick={saveDraft}>Save draft</button>
              <button className="btn primary" disabled={!valid} onClick={() => setShowConfirm(true)}>
                {valid ? 'Submit tips →' : `${slots.length - filledCount} picks to go`}
              </button>
            </div>
          )}
          </div>
        </div>
      </div>

      {active && !isLocked && (
        <DriverPicker
          title={active.title}
          subtitle={active.subtitle}
          value={valueOf(active.key)}
          taken={taken}
          onPick={pick}
          onClear={() => assign(active.key, null)}
          onClose={() => setActiveSlot(null)}
          onPrev={activeIdx > 0 ? () => setActiveSlot(slots[activeIdx - 1].key) : null}
          onNext={activeIdx < slots.length - 1 ? () => setActiveSlot(slots[activeIdx + 1].key) : null}
        />
      )}

      {showConfirm && (
        <Modal onClose={() => setShowConfirm(false)} labelledBy="tip-confirm-title">
            <h3 id="tip-confirm-title">Submit your tips?</h3>
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
                {saving ? 'Saving…' : 'Confirm submit →'}
              </button>
            </div>
        </Modal>
      )}
    </>
  );
}
