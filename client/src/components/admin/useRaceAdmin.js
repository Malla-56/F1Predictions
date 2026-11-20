import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAppData } from '../../context/AppDataContext';

// Shared by the desktop Races page and the mobile admin page: race settings (lock
// point, custom lock time, locked state, joker) and the rules for displaying them.

// <input type="datetime-local"> works in the browser's local time with no zone, so
// convert to/from UTC ISO here rather than letting the server guess.
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtLocal(iso) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const LOCK_LABELS = {
  weekend: 'Weekend start',
  sprint: 'Sprint',
  qualifying: 'Qualifying',
  race: 'Race start',
};

export const SOURCE_NOTES = {
  weekend: 'weekend start',
  sprint: 'sprint start',
  qualifying: 'qualifying start',
  race: 'race start',
  custom: 'custom time',
  capped: 'custom time, capped at race start',
};

// Lock points available for a race, with their session times.
export function lockOptions(r) {
  return [
    ['weekend', r.date],
    ['sprint', r.sprintStart],
    ['qualifying', r.qualifyingStart],
    ['race', r.raceStart],
  ].filter(([, time]) => time);
}

export const raceStarted = r => !!r.raceStart && new Date() >= new Date(r.raceStart);

export function lockStatus(r, cfg) {
  if (raceStarted(r)) return 'Race started';
  if (cfg.manually_locked === 1) return 'Locked manually';
  if (r.isLocked) return `Auto-locked ${fmtLocal(r.lockTime)}`;
  return `Open · locks ${fmtLocal(r.lockTime)}`;
}

export default function useRaceAdmin(setToast) {
  const { reloadRaces } = useAppData();
  const [configs, setConfigs] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    api.admin.races()
      .then(rows => setConfigs(Object.fromEntries(rows.map(r => [r.race_round, r]))))
      .catch(e => setLoadError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  async function save(race, patch, message, applyLocal) {
    setSaving(race.round);
    try {
      await api.admin.saveRace(race.round, patch);
      setConfigs(prev => applyLocal ? applyLocal(prev) : { ...prev, [race.round]: { ...prev[race.round], ...patch } });
      setToast(message);
      // Effective lock time and locked state are computed server-side.
      await reloadRaces();
    } catch (err) {
      setToast(`Error: ${err.message}`);
    } finally {
      setSaving(null);
    }
  }

  // Lock at a session (follows OpenF1 schedule changes). Clears any custom time.
  function setLockPoint(race, point) {
    save(race, { lock_at: point, lock_time: null },
      `R${race.round} now locks at ${LOCK_LABELS[point].toLowerCase()}`);
  }

  // Custom lock time. The input always shows the effective lock time, so leaving it
  // unchanged is a no-op; clearing it goes back to the default.
  function setLockTime(race, value) {
    if (value === toLocalInput(race.lockTime)) return;
    if (!value) return setLockPoint(race, 'weekend');
    save(race, { lock_time: new Date(value).toISOString(), lock_at: null }, `Lock time updated for R${race.round}`);
  }

  // Ticked whenever tips are actually locked (manual lock or lock time passed).
  // Unticking reopens tips until race start; once the race has started it stays locked.
  function toggleLocked(race) {
    if (!race.isLocked) {
      return save(race, { manually_locked: 1 }, `R${race.round} locked`);
    }
    const patch = { manually_locked: 0 };
    const timePassed = new Date() >= new Date(race.lockTime);
    if (timePassed && race.raceStart) Object.assign(patch, { lock_at: 'race', lock_time: null });
    save(race, patch, timePassed
      ? `R${race.round} unlocked — tips open until race start`
      : `R${race.round} unlocked`);
  }

  // Only one joker round per season — the server clears the previous one (and
  // rescores), so mirror that here.
  function setJoker(race) {
    const on = configs[race.round]?.is_joker ? 0 : 1;
    save(race, { is_joker: on },
      on ? `R${race.round} is now the joker round (double points)` : `Joker removed from R${race.round}`,
      prev => {
        const next = {};
        for (const [round, cfg] of Object.entries(prev)) next[round] = on ? { ...cfg, is_joker: 0 } : cfg;
        next[race.round] = { ...prev[race.round], is_joker: on };
        return next;
      });
  }

  function toggleFlag(race, key, on, off) {
    const next = configs[race.round]?.[key] ? 0 : 1;
    save(race, { [key]: next }, `R${race.round} ${next ? on : off}`);
  }

  return { configs, loaded, loadError, saving, setLockPoint, setLockTime, toggleLocked, setJoker, toggleFlag };
}
