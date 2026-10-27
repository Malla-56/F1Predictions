import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import Topbar from '../components/Topbar';
import Countdown from '../components/Countdown';
import Avatar from '../components/Avatar';
import DriverChip from '../components/DriverChip';
import Icon from '../components/Icon';
import PollWidget from '../components/PollWidget';
import Modal from '../components/Modal';
import { onActivate } from '../components/useDialog';

export default function Home({ setToast, theme, setTheme }) {
  const { user } = useAuth();
  const { races, countryFlag, loading: racesLoading, error: racesError } = useAppData();
  const navigate = useNavigate();

  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [predError, setPredError] = useState(null);
  const [selectedTip, setSelectedTip] = useState(null);

  // Race weekend in progress, else the next race that hasn't started (open or locked early).
  const current  = races.find(r => r.status === 'current' && !r.isCancelled);
  const upcoming = current
    || races.find(r => (r.status === 'upcoming' || r.status === 'locked') && !r.isCancelled);
  const cancelledRaces = races.filter(r => r.isCancelled);

  useEffect(() => {
    if (!upcoming) return;
    let stale = false;
    setLoading(true);
    setPredError(null);
    api.predictions.list(upcoming.round)
      .then(p => { if (!stale) setPredictions(p); })
      .catch(e => { if (!stale) setPredError(e.message); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [upcoming?.round]);

  const topbarRight = (
    <>
      {upcoming && <span className="badge dot locked">R{upcoming.round} · {current ? 'Race Day' : upcoming.isLocked ? 'Locked' : 'Open'}</span>}
      {upcoming?.isJoker && <span className="badge" style={{ background: 'var(--red)', color: '#fff' }} title="All points count double this round">Joker ×2</span>}
      <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle theme" aria-label="Toggle theme">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>
    </>
  );

  if (!upcoming) {
    let msg = 'Loading race calendar…';
    if (!racesLoading) msg = racesError ? `Error: ${racesError}` : 'No upcoming races found.';
    return (
      <>
        <Topbar crumbs={['Pulse League', 'Home']} right={topbarRight} />
        <div className="content"><div className="loading">{msg}</div></div>
      </>
    );
  }

  return (
    <>
      <Topbar crumbs={['Pulse League', 'Home']} right={topbarRight} />
      <div className="content">
        <div className="home-top">
        <div className="hero">
          <div className="hero-left">
            <div className="hero-meta">
              <span className="live-dot" />
              <span>Round {String(upcoming.round).padStart(2, '0')} / {races[0]?.date ? new Date(races[0].date).getFullYear() : new Date().getFullYear()}</span>
              <span style={{ color: 'var(--line-2)' }}>·</span>
              <span>{current ? 'Race Weekend' : 'Next Race'}</span>
            </div>
            <h1 className="hero-title">{upcoming.name}</h1>
            <div className="hero-circuit">
              <span className="flag">{countryFlag(upcoming.countryCode)}</span>
              <span>{upcoming.circuit}</span>
              <span style={{ color: 'var(--text-3)' }}>·</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {new Date(upcoming.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
              </span>
            </div>
            {!current && (
              <div className="hero-actions">
                <button className="btn primary" onClick={() => navigate(`/predict/${upcoming.round}`)}>
                  Enter your tips <span className="arrow">→</span>
                </button>
              </div>
            )}
          </div>
          <div className="hero-right">
            <Countdown target={upcoming.lockTime} />
            <div className="mono" style={{ marginTop: 14, fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Lock: {new Date(upcoming.lockTime).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
            </div>
          </div>
        </div>

        <PollWidget />
        </div>

        <div className="sec-head">
          <h2>Community Tips</h2>
          <div className="meta">{predictions.length} Submitted</div>
        </div>

        {loading ? (
          <div className="loading">Loading tips…</div>
        ) : predError ? (
          <div className="results-empty">Couldn't load tips: {predError}</div>
        ) : (
          <div className="tipgrid">
            {predictions.map(p => (
              <TipCard key={p.userId} prediction={p} isMe={p.userId === user?.id} raceName={upcoming.name} raceIsLocked={upcoming?.isLocked} onViewFull={() => setSelectedTip(p)} navigate={navigate} />
            ))}
            {predictions.length === 0 && (
              <div className="mono" style={{ color: 'var(--text-3)', fontSize: 11, padding: '32px 0' }}>
                No tips submitted yet for this race.
              </div>
            )}
          </div>
        )}

        {cancelledRaces.length > 0 && (
          <div className="sec-head" style={{ marginTop: 32, marginBottom: 12 }}>
            <h2>Cancelled Races</h2>
          </div>
        )}
        {cancelledRaces.map(r => (
          <div key={r.round} className="card" style={{ padding: '14px 18px', marginBottom: 12, borderColor: 'var(--red-line)', background: 'var(--red-dim)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--red-2)', letterSpacing: '0.08em' }}>
                ✗ R{String(r.round).padStart(2, '0')} · {r.name}
              </span>
              <span className="badge" style={{ background: 'rgba(225,6,0,0.5)', color: 'var(--red)' }}>CANCELLED</span>
            </div>
          </div>
        ))}

        {selectedTip && (
          <Modal onClose={() => setSelectedTip(null)} labelledBy="home-tip-title" style={{ maxWidth: 520, padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar displayName={selectedTip.displayName} size={40} isMe={selectedTip.userId === user?.id} />
                  <div>
                    <div id="home-tip-title" style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 15 }}>{selectedTip.displayName}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>FULL TIP · {upcoming?.name?.toUpperCase()}</div>
                  </div>
                </div>
                <span className="badge locked dot">Submitted</span>
              </div>
              <div style={{ marginBottom: 28 }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 16 }}>RACE FINISH</div>
                <div className="reveal-grid" style={{ gap: 12 }}>
                  {(selectedTip.positions || []).map((id, i) => (
                    <div key={i} className="reveal-row" style={{ padding: '12px 0', borderBottom: i < 9 ? '1px solid var(--line)' : 'none', gap: 20 }}>
                      <span className="pos">P{i + 1}</span>
                      <DriverChip driverId={id} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
                <div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 12 }}>POLE POSITION</div>
                  <DriverChip driverId={selectedTip.pole} showName />
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 12 }}>DID NOT FINISH</div>
                  <DriverChip driverId={selectedTip.dnf} showName />
                </div>
              </div>
              {selectedTip.userId === user?.id && !upcoming?.isLocked && (
                <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
                  <button className="btn primary" style={{ width: '100%' }} onClick={() => { setSelectedTip(null); navigate(`/predict/${upcoming.round}`); }}>
                    Edit tips →
                  </button>
                </div>
              )}
          </Modal>
        )}
      </div>
    </>
  );
}

function TipCard({ prediction: p, isMe, raceName, raceIsLocked, onViewFull, navigate }) {
  // Other players' picks stay hidden until the race locks; your own are always visible.
  const revealed = !!p.positions;
  return (
    <div
      className={`tipcard${isMe ? ' me' : ''}${revealed ? ' clickable' : ''}`}
      onClick={() => revealed && onViewFull()}
      {...(revealed ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `View ${p.displayName}'s full tip`,
        onKeyDown: onActivate(onViewFull),
      } : {})}
    >
      <div className="tipcard-hd">
        <Avatar displayName={p.displayName} size={36} isMe={isMe} />
        <div className="tipcard-name">
          <div className="n">{p.displayName}</div>
          <div className="h">{isMe ? 'You' : ''}</div>
        </div>
        <div className="tipcard-status">
          <span className={"badge dot locked"}>
            Submitted
          </span>
        </div>
      </div>

      <div className="tipcard-picks">
        <div className="pickrow">
          <span className="pos gold">POLE</span>
          {revealed ? <DriverChip driverId={p.pole} /> : <span className="muted mono" style={{ fontSize: 11 }}>Hidden</span>}
        </div>
        <div className="pickrow">
          <span className="pos gold">P1</span>
          {revealed ? <DriverChip driverId={p.positions?.[0]} /> : <span className="muted mono" style={{ fontSize: 11 }}>Hidden</span>}
        </div>
        <div className="pickrow">
          <span className="pos">P2</span>
          {revealed ? <DriverChip driverId={p.positions?.[1]} /> : <span className="muted mono" style={{ fontSize: 11 }}>Hidden</span>}
        </div>
        <div className="pickrow">
          <span className="pos">P3</span>
          {revealed ? <DriverChip driverId={p.positions?.[2]} /> : <span className="muted mono" style={{ fontSize: 11 }}>Hidden</span>}
        </div>
      </div>

      <div className="tipcard-foot">
        <span>{revealed ? 'Submitted' : 'Picks revealed at lock'}</span>
        {revealed && <span>↗ Click for full picks</span>}
      </div>
    </div>
  );
}
