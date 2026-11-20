import { useEffect, useState } from 'react';
import { api } from '../api';

function fmt(iso) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Admin-only banner shown when OpenF1 can't be reached, so a race-weekend lockout
// doesn't look like a bug. Renders nothing while OpenF1 is healthy.
export default function OpenF1Status() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.admin.openf1Status().then(setStatus).catch(() => {});
  }, []);

  if (!status || status.ok) return null;

  const reason = status.lockout
    ? 'OpenF1 is locked while an F1 session is live and will be back when it ends.'
    : `OpenF1 is unavailable${status.httpStatus ? ` (HTTP ${status.httpStatus})` : ''}.`;
  const fallback = status.savedCount > 0
    ? `Races and drivers are showing data saved ${fmt(status.savedAt)}. Results can't be fetched until it's back.`
    : "There's no saved copy yet, so races and drivers won't load until it's back.";

  return (
    <div role="status" style={{
      border: '1px solid rgba(255,179,0,0.4)', background: 'rgba(255,179,0,0.08)',
      color: 'var(--text)', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 13,
    }}>
      <strong style={{ color: 'var(--amber)' }}>⚠ {reason}</strong>{' '}
      <span style={{ color: 'var(--text-2)' }}>{fallback}</span>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
        Checked {fmt(status.checkedAt)}
      </div>
    </div>
  );
}
