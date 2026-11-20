import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';

// League admins switch the fantasy side game on or off for the selected league.
export default function FantasySwitch({ setToast }) {
  const { activeLeague, refresh } = useAuth();
  const [saving, setSaving] = useState(false);
  const on = !!activeLeague?.fantasy;

  async function toggle(enabled) {
    setSaving(true);
    try {
      await api.admin.saveFantasy(enabled);
      await refresh();
      setToast(enabled ? 'Fantasy switched on for this league' : 'Fantasy switched off for this league');
    } catch (err) {
      setToast(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card fx-switch">
      <label>
        <input type="checkbox" checked={on} disabled={saving} onChange={e => toggle(e.target.checked)} />
        <span>
          <b>Fantasy picks {saving ? '· saving…' : on ? '· on' : '· off'}</b>
          <span>
            Everyone picks one driver and one team each race. The weekend's fantasy ranking adds a few
            points to this league's scoreboard. Switching it off hides fantasy and removes those points;
            switching it back on restores them.
          </span>
        </span>
      </label>
    </div>
  );
}
