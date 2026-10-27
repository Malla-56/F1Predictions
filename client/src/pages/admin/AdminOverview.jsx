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
            <h2 className="page-title">Admin Overview</h2>
            <div className="page-sub">League management · Pulse Pitlane Picks</div>
          </div>
        </div>

        <div className="kpi-row">
          <Stat label="Active Users" value={stats?.userCount ?? '—'} />
          <Stat label="Predictions" value={stats?.predCount ?? '—'} />
          <Stat label="Scored Rounds" value={stats?.scoredRounds ?? '—'} />
        </div>

        <div className="card" style={{ padding: '22px 24px', marginTop: 24 }}>
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
