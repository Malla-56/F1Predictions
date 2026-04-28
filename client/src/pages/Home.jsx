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

export default function Home({ setToast, theme, setTheme }) {
  const { user } = useAuth();
  const { races, countryFlag, loading: racesLoading, error: racesError } = useAppData();
  const navigate = useNavigate();

  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);

  const upcoming = races.find(r => r.status === 'upcoming') || races.find(r => r.status === 'future');

  useEffect(() => {
    if (!upcoming) return;
    setLoading(true);
    api.predictions.list(upcoming.round)
      .then(setPredictions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [upcoming?.round]);

  const topbarRight = (
    <>
      {upcoming && <span className="badge dot locked">R{upcoming.round} · Open</span>}
      <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle theme">
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
        <div className="hero">
          <div className="hero-left">
            <div className="hero-meta">
              <span className="live-dot" />
              <span>Round {String(upcoming.round).padStart(2, '0')} / 2025</span>
              <span style={{ color: 'var(--line-2)' }}>·</span>
              <span>Next Race</span>
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
            <div className="hero-actions">
              <button className="btn primary" onClick={() => navigate(`/predict/${upcoming.round}`)}>
                Enter your tips <span className="arrow">→</span>
              </button>
            </div>
          </div>
          <div className="hero-right">
            <Countdown target={upcoming.lockTime} />
            <div className="mono" style={{ marginTop: 14, fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Lock: {new Date(upcoming.lockTime).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
            </div>
          </div>
        </div>

        <div className="sec-head">
          <h2>Community Tips</h2>
          <div className="meta">{predictions.filter(p => p.locked).length} / {predictions.length} Locked In</div>
        </div>

        {loading ? (
          <div className="loading">Loading tips…</div>
        ) : (
          <div className="tipgrid">
            {predictions.map(p => (
              <TipCard key={p.userId} prediction={p} isMe={p.userId === user?.id} raceName={upcoming.name} />
            ))}
            {predictions.length === 0 && (
              <div className="mono" style={{ color: 'var(--text-3)', fontSize: 11, padding: '32px 0' }}>
                No tips submitted yet for this race.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function TipCard({ prediction: p, isMe, raceName }) {
  return (
    <div className={`tipcard${isMe ? ' me' : ''}`}>
      <div className="tipcard-hd">
        <Avatar displayName={p.displayName} size={36} isMe={isMe} />
        <div className="tipcard-name">
          <div className="n">{p.displayName}</div>
          <div className="h">{isMe ? 'You' : ''}</div>
        </div>
        <div className="tipcard-status">
          <span className={`badge dot ${p.locked ? 'locked' : 'pending'}`}>
            {p.locked ? 'Locked' : 'Pending'}
          </span>
        </div>
      </div>

      <div className="tipcard-picks">
        <div className="pickrow">
          <span className="pos gold">POLE</span>
          {p.locked ? <DriverChip driverId={p.pole} /> : <span className="muted mono" style={{ fontSize: 11 }}>Hidden</span>}
        </div>
        <div className="pickrow">
          <span className="pos gold">P1</span>
          {p.locked ? <DriverChip driverId={p.positions?.[0]} /> : <span className="muted mono" style={{ fontSize: 11 }}>Hidden</span>}
        </div>
        <div className="pickrow">
          <span className="pos">P2</span>
          {p.locked ? <DriverChip driverId={p.positions?.[1]} /> : <span className="muted mono" style={{ fontSize: 11 }}>Hidden</span>}
        </div>
        <div className="pickrow">
          <span className="pos">P3</span>
          {p.locked ? <DriverChip driverId={p.positions?.[2]} /> : <span className="muted mono" style={{ fontSize: 11 }}>Hidden</span>}
        </div>
      </div>

      <div className="tipcard-foot">
        <span>{p.locked ? 'Submitted' : 'Awaiting lock'}</span>
        {p.locked && <span>↗ Hover for full picks</span>}
      </div>

      {p.locked && (
        <div className="reveal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar displayName={p.displayName} size={28} isMe={isMe} />
              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13 }}>{p.displayName}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>FULL TIP · {raceName?.toUpperCase()}</div>
              </div>
            </div>
            <span className="badge locked dot">Locked</span>
          </div>
          <div className="reveal-grid">
            {(p.positions || []).map((id, i) => (
              <div key={i} className="reveal-row">
                <span className="pos">P{i + 1}</span>
                <DriverChip driverId={id} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            <div>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.14em' }}>POLE</div>
              <div style={{ marginTop: 4 }}><DriverChip driverId={p.pole} /></div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.14em' }}>DNF</div>
              <div style={{ marginTop: 4 }}><DriverChip driverId={p.dnf} /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
