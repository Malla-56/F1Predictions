import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        await login(username, password);
      } else {
        await register(username, password, displayName);
      }
      navigate('/home');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div className="brand-mark" style={{ width: 36, height: 36 }} />
          <div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.02em' }}>PULSE</div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-3)', textTransform: 'uppercase', marginTop: 2 }}>
              Pitlane Picks · 2026
            </div>
          </div>
          <span className="badge dot locked" style={{ marginLeft: 'auto' }}>Live</span>
        </div>

        <div className="login-tabs">
          <button className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Sign In</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Create Account</button>
        </div>

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <div className="fld">
              <label>Display name</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. fastlap_42" required />
            </div>
          )}
          <div className="fld">
            <label>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. fastlap42" autoComplete="username" required />
          </div>
          <div className="fld">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>

          {error && (
            <div className="mono" style={{ fontSize: 11, color: 'var(--red-2)', marginBottom: 14, letterSpacing: '0.04em' }}>
              ✗ {error}
            </div>
          )}

          <button type="submit" className="btn primary" style={{ width: '100%', height: 44, justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Loading…' : mode === 'signin' ? 'Sign In →' : 'Create Account →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 22 }} className="mono">
          <span style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Pulse Pitlane Picks · 2026 Season
          </span>
        </div>
      </div>
    </div>
  );
}
