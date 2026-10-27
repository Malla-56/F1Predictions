import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icon';
import { passkeySupported, biometricLabel, hasAnyPasskey, isCancel } from '../passkey';

export default function Login() {
  const { login, loginWithPasskey, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [canPasskey, setCanPasskey] = useState(false);

  useEffect(() => { passkeySupported().then(setCanPasskey); }, []);

  const bio = biometricLabel();
  // Only offer biometric sign-in once a passkey has been set up on this device
  // (via the banner after a password sign-in), and then lead with it.
  const passkeyFirst = canPasskey && hasAnyPasskey() && mode === 'signin';

  function switchMode(next) {
    setMode(next);
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password, displayName.trim());
      }
      navigate('/home');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function passkeyLogin() {
    setError('');
    setLoading(true);
    try {
      await loginWithPasskey();
      navigate('/home');
    } catch (err) {
      if (!isCancel(err)) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const passkeyButton = (
    <button
      type="button"
      className={`btn ${passkeyFirst ? 'primary' : 'ghost'} login-btn login-passkey`}
      onClick={passkeyLogin}
      disabled={loading}
    >
      <Icon name="faceid" size={20} />
      Sign in with {bio}
    </button>
  );

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark" />
          <div>
            <div className="login-brand-name">PULSE</div>
            <div className="login-brand-sub mono">Pitlane Picks · 2026</div>
          </div>
        </div>

        <h1 className="login-title">{mode === 'signin' ? 'Welcome back' : 'Join the league'}</h1>
        <p className="login-lede">
          {mode === 'signin' ? 'Sign in to lock in your tips for the next race.' : 'Create an account to start tipping.'}
        </p>

        {passkeyFirst && (
          <>
            {passkeyButton}
            <div className="login-divider"><span>or use your password</span></div>
          </>
        )}

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <div className="fld">
              <label htmlFor="display-name">Display name</label>
              <input
                id="display-name" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="How others see you" autoComplete="nickname" enterKeyHint="next" required
              />
            </div>
          )}
          <div className="fld">
            <label htmlFor="username">Username</label>
            <input
              id="username" type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="e.g. fastlap42" autoComplete="username" autoCapitalize="none"
              autoCorrect="off" spellCheck={false} enterKeyHint="next" required
            />
          </div>
          <div className="fld">
            <label htmlFor="password">Password</label>
            <div className="fld-password">
              <input
                id="password" type={showPassword ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                enterKeyHint="go" required
              />
              <button
                type="button" className="fld-reveal" onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'eyeoff' : 'eye'} size={18} />
              </button>
            </div>
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}

          <button type="submit" className={`btn ${passkeyFirst ? 'ghost' : 'primary'} login-btn`} disabled={loading}>
            {loading ? 'Signing in…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="login-switch">
          {mode === 'signin' ? (
            <>New to the league? <button type="button" onClick={() => switchMode('signup')}>Create an account</button></>
          ) : (
            <>Already tipping? <button type="button" onClick={() => switchMode('signin')}>Sign in</button></>
          )}
        </div>
      </div>
    </div>
  );
}
