import { useState, useEffect } from 'react';
import Icon from './Icon';
import { onInstallPrompt, promptInstall, isStandalone, isIOS, isAndroid } from '../install';

const DISMISS_KEY = 'install:dismissed';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // ask again a fortnight after "Not now"

function snoozed() {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < SNOOZE_MS; } catch { return false; }
}
function snooze() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
}

// iOS Safari's share glyph, so the instructions match what's on screen.
function ShareGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-label="Share" style={{ verticalAlign: '-3px' }}>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

// Bottom sheet for mobile web visitors: install steps on iPhone (Safari has no install
// API), and a one-tap Install button on Android when Chrome offers one.
export default function InstallSheet() {
  const [platform, setPlatform] = useState(null); // 'ios' | 'android' | null
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;
    if (isIOS()) {
      // Give the page a moment to settle before sliding the sheet up.
      const t = setTimeout(() => setPlatform('ios'), 1500);
      return () => clearTimeout(t);
    }
    if (isAndroid()) {
      return onInstallPrompt(e => {
        setCanPrompt(!!e);
        setPlatform(e ? 'android' : null);
      });
    }
  }, []);

  if (!platform) return null;

  function close() {
    snooze();
    setPlatform(null);
  }

  async function install() {
    const accepted = await promptInstall();
    if (!accepted) snooze();
    setPlatform(null);
  }

  return (
    <div className="install-bg" onClick={close}>
      <div className="install-sheet" role="dialog" aria-labelledby="install-title" onClick={e => e.stopPropagation()}>
        <div className="install-grab" />
        <div className="install-head">
          <img src="/icons/icon-192.png" alt="" width="48" height="48" />
          <div>
            <h3 id="install-title">Install Pitlane Picks</h3>
            <p>Add it to your home screen for tip reminders, race scores and {platform === 'ios' ? 'Face ID' : 'fingerprint'} sign-in.</p>
          </div>
          <button className="x" onClick={close} aria-label="Not now"><Icon name="close" size={16} /></button>
        </div>

        {platform === 'ios' ? (
          <ol className="install-steps">
            <li>Tap the Share button <ShareGlyph /> in Safari's toolbar (on newer iPhones it's under the <strong>•••</strong> button).</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
            <li>Open <strong>Pitlane Picks</strong> from your home screen.</li>
          </ol>
        ) : (
          <button className="btn primary install-btn" onClick={install} disabled={!canPrompt}>Install app</button>
        )}

        <button className="btn ghost install-later" onClick={close}>Not now</button>
      </div>
    </div>
  );
}
