import { useState, useEffect } from 'react';
import { api } from '../api';
import Icon from './Icon';

const supported = typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Topbar bell: toggles tip-reminder push notifications for this device.
export default function NotifyButton({ setToast }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => {
        setEnabled(!!sub && Notification.permission === 'granted');
        // Re-sync with the server in case it was lost (e.g. new login on this device)
        if (sub && Notification.permission === 'granted') api.push.subscribe(sub.toJSON()).catch(() => {});
      })
      .catch(() => {});
  }, []);

  const toast = (msg) => setToast?.(msg);

  async function enable() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      toast('Notifications blocked — allow them in your browser settings');
      return;
    }
    const { publicKey } = await api.push.publicKey();
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await api.push.subscribe(sub.toJSON());
    await api.push.test().catch(() => {});
    setEnabled(true);
    toast("Tip reminders on — we'll ping you 2 days and 1 day before tips close");
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.push.unsubscribe(sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
    setEnabled(false);
    toast('Tip reminders off for this device');
  }

  async function onClick() {
    if (!supported) {
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      toast(isIOS
        ? 'On iPhone: tap Share → Add to Home Screen, then open the app to enable reminders'
        : 'This browser does not support push notifications');
      return;
    }
    setBusy(true);
    try {
      await (enabled ? disable() : enable());
    } catch (err) {
      toast(`Couldn't update notifications: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="icon-btn"
      onClick={onClick}
      disabled={busy}
      title={enabled ? 'Tip reminders on — click to turn off' : 'Turn on tip reminders'}
      style={enabled ? { color: 'var(--red)' } : { opacity: 0.6 }}
    >
      <Icon name="bell" size={16} />
    </button>
  );
}
