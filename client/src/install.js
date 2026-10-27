// Chrome on Android fires beforeinstallprompt once, often before React has mounted,
// so it's captured here (imported from main.jsx) and handed to whoever subscribes.

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn(deferred));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // we show our own install sheet instead of the mini-infobar
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function onInstallPrompt(fn) {
  listeners.add(fn);
  fn(deferred);
  return () => listeners.delete(fn);
}

// Shows the browser's install dialog. Resolves true if the user accepted.
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null; // the event can only be used once
  notify();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIOS() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export const isAndroid = () => /Android/.test(navigator.userAgent);
