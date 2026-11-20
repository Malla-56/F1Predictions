import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Shown to a signed-in account that isn't in any league (e.g. removed by an admin).
export default function NoLeague() {
  const { user, joinLeague, logout } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await joinLeague(code.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark" />
          <div>
            <div className="login-brand-name">PULSE</div>
            <div className="login-brand-sub mono">Pitlane Picks</div>
          </div>
        </div>

        <h1 className="login-title">Join a league</h1>
        <p className="login-lede">
          Hi {user?.display_name}, you're not in a league right now. Ask a league admin for an invite code.
        </p>

        <form onSubmit={submit}>
          <div className="fld">
            <label htmlFor="no-league-code">Invite code</label>
            <input
              id="no-league-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. 7KQ2MX" autoCapitalize="characters" autoComplete="off"
              spellCheck={false} maxLength={8} required
              style={{ fontFamily: 'var(--mono)', letterSpacing: '0.15em' }}
            />
          </div>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button type="submit" className="btn primary login-btn" disabled={loading}>
            {loading ? 'Joining…' : 'Join league'}
          </button>
        </form>

        <div className="login-switch">
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
