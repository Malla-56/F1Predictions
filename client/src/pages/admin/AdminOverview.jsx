import { useState, useEffect } from 'react';
import { api } from '../../api';
import Topbar from '../../components/Topbar';

export default function AdminOverview() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.admin.overview().then(setStats).catch(() => {});
  }, []);

  return (
    <>
      <Topbar crumbs={['Admin', 'Overview']} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>Admin Overview</h2>
            <div className="muted" style={{ marginTop: 6 }}>League management · Pulse Pitlane Picks</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 700 }}>
          <Stat label="Active Users" value={stats?.userCount ?? '—'} />
          <Stat label="Predictions" value={stats?.predCount ?? '—'} />
          <Stat label="Scored Rounds" value={stats?.scoredRounds ?? '—'} />
        </div>

        <div className="card" style={{ padding: '22px 24px', marginTop: 24, maxWidth: 600 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 14 }}>Admin Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>
              → <strong>Users</strong> — Kick users, promote to admin, reset predictions<br />
              → <strong>Scoring</strong> — Edit point values; changes trigger immediate rescore<br />
              → <strong>Races</strong> — Override lock times, manually lock/unlock rounds<br />
              → <strong>Results</strong> — Enter or correct race results, trigger rescore
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="kpi">
      <span className="lbl">{label}</span>
      <span className="val">{value}</span>
    </div>
  );
}
