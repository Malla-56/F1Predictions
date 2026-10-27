import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Icon from './Icon';
import {
  passkeySupported, biometricLabel, isEnrolled, isDismissed, dismissPrompt, enrollPasskey, isCancel,
} from '../passkey';

// Offers Face ID / Touch ID sign-in once per device until the user enables or dismisses it.
export default function PasskeyPrompt({ setToast }) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || isEnrolled(user.id) || isDismissed(user.id)) return;
    passkeySupported().then(setShow);
  }, [user]);

  if (!show) return null;
  const bio = biometricLabel();

  async function enable() {
    setBusy(true);
    try {
      await enrollPasskey(user.id);
      setShow(false);
      setToast(`${bio} sign-in enabled`);
    } catch (err) {
      if (!isCancel(err)) setToast(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function notNow() {
    dismissPrompt(user.id);
    setShow(false);
  }

  return (
    <div className="prompt-banner">
      <span className="ico"><Icon name="faceid" size={26} /></span>
      <div className="txt">
        <strong>Sign in with {bio}</strong>
        <span>Skip the password next time.</span>
      </div>
      <div className="acts">
        <button className="btn primary" onClick={enable} disabled={busy}>{busy ? 'Setting up…' : 'Enable'}</button>
        <button className="x" onClick={notNow} aria-label="Not now"><Icon name="close" size={16} /></button>
      </div>
    </div>
  );
}
