import { useState, useEffect } from 'react';
import { api } from '../../api';
import Topbar from '../../components/Topbar';
import { useAuth } from '../../context/AuthContext';
import OpenF1Status from '../../components/OpenF1Status';

export default function AdminOverview() {
  const { activeLeague, isSiteManager } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.admin.overview().then(setStats).catch(() => {});
  }, []);

  return (
    <>
      <Topbar crumbs={['Admin', 'Overview']} />
      <div className="content">
        <OpenF1Status />
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 className="page-title">Admin Overview</h2>
            <div className="page-sub">League management · {activeLeague?.name}</div>
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
              → <strong>Leagues</strong> (in the main menu) — Generate an invite code to add players; codes last 15 minutes<br />
              → <strong>Users</strong> — Remove members from this league, make them admins, fix tips<br />
              → <strong>Scoring</strong> — This league's point values; changes trigger an immediate rescore<br />
              → <strong>Races</strong> — Choose this league's joker round{isSiteManager && <>; lock times and manual lock/unlock (all leagues)</>}
              {isSiteManager && <><br />→ <strong>Results</strong> — Enter or correct race results for every league, trigger rescore</>}
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
