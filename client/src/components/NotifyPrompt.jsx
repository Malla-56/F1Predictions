import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Icon from './Icon';

const supported = typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const dismissedKey = uid => `notify:dismissed:${uid}`;
function isDismissed(uid) {
  try { return localStorage.getItem(dismissedKey(uid)) === '1'; } catch { return false; }
}
function dismiss(uid) {
  try { localStorage.setItem(dismissedKey(uid), '1'); } catch {}
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Offers push notifications (tip reminders + post-race scores) once per device until
// the user enables or dismisses them.
export default function NotifyPrompt({ setToast }) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !supported) return;
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => {
        const on = !!sub && Notification.permission === 'granted';
        // Re-sync with the server in case it was lost (e.g. new login on this device)
        if (on) api.push.subscribe(sub.toJSON()).catch(() => {});
        setShow(!on && Notification.permission !== 'denied' && !isDismissed(user.id));
      })
      .catch(() => {});
  }, [user]);

  if (!show) return null;

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setShow(false);
        setToast('Notifications blocked — allow them in your browser settings');
        return;
      }
      const { publicKey } = await api.push.publicKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await api.push.subscribe(sub.toJSON());
      // Sends a confirmation notification, so the user sees straight away that it works.
      await api.push.test().catch(() => {});
      setShow(false);
      setToast('Notifications on');
    } catch (err) {
      setToast(`Couldn't turn on notifications: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function notNow() {
    dismiss(user.id);
    setShow(false);
  }

  return (
    <div className="prompt-banner">
      <span className="ico"><Icon name="bell" size={24} /></span>
      <div className="txt">
        <strong>Turn on notifications</strong>
        <span>Get a reminder before tips close and your score after each race.</span>
      </div>
      <div className="acts">
        <button className="btn primary" onClick={enable} disabled={busy}>{busy ? 'Turning on…' : 'Enable'}</button>
        <button className="x" onClick={notNow} aria-label="Not now"><Icon name="close" size={16} /></button>
      </div>
    </div>
  );
}
