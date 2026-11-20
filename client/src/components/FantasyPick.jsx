import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { useAppData } from '../context/AppDataContext';

const POWERUPS = [
  { id: 'boost', icon: '×2', name: 'Boost', desc: "Doubles your driver's score" },
  { id: 'net', icon: '0', name: 'Safety net', desc: 'Ignores negatives, like a DNF' },
];
const PLACES = ['1st', '2nd', '3rd', '4th', '5th'];

// Dots showing how many of a season's uses are gone; the red one is this pick.
function Pips({ used, max, now }) {
  return (
    <span className="fx-pips" title={`${used} of ${max} used`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < used ? 'used' : now && i === used ? 'now' : ''} />
      ))}
    </span>
  );
}

// The fantasy half of tip entry: one driver and one team for the round, plus an
// optional powerup. Saved separately from tips but locks at the same time.
export default function FantasyPick({ race, setToast }) {
  const { driversByStanding: drivers, driverById } = useAppData();
  const [data, setData] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [driver, setDriver] = useState(null);
  const [team, setTeam] = useState(null);
  const [powerup, setPowerup] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const round = race?.round;
  useEffect(() => {
    if (!round) return;
    let stale = false;
    setLoadState('loading');
    api.fantasy.mine(round).then(d => {
      if (stale) return;
      setData(d);
      setDriver(d.pick?.driver || null);
      setTeam(d.pick?.team || null);
      setPowerup(d.pick?.powerup || null);
      setDirty(false);
      setLoadState('ready');
    }).catch(() => { if (!stale) setLoadState('error'); });
    return () => { stale = true; };
  }, [round]);

  // Teams aren't a list of their own; they're whoever the drivers drive for.
  const teams = useMemo(() => {
    const seen = new Map();
    for (const d of drivers) if (d.team && !seen.has(d.team)) seen.set(d.team, { name: d.team, color: d.teamColor });
    return [...seen.values()];
  }, [drivers]);

  if (loadState === 'loading') return <div className="loading">Loading your fantasy pick…</div>;
  if (loadState === 'error') return <div className="results-empty">Couldn't load your fantasy pick. Refresh to try again.</div>;

  const locked = data.locked || race.isLocked;
  const caps = data.caps;
  const usedDriver = id => data.uses.drivers[id] || 0;
  const usedTeam = name => data.uses.teams[name] || 0;
  const d = driver && driverById(driver);
  const t = team && teams.find(x => x.name === team);
  const complete = !!(driver && team);
  // A carried pick isn't stored yet, so saving it as-is is still worth offering.
  const canSave = complete && (dirty || !data.saved);

  function change(setter, value, current) {
    setter(current === value ? null : value);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await api.fantasy.save(round, { driver, team, powerup });
      setData(prev => ({ ...prev, saved: true, pick: { driver, team, powerup, carried: false } }));
      setDirty(false);
      setToast(`Fantasy pick saved for ${race.name}`);
    } catch (err) {
      setToast(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  const carried = data.pick?.carried && !dirty;
  const status = locked
    ? (data.pick ? 'Locked in for this race.' : "You didn't make a pick for this race.")
    : carried
      ? "Carried over from your last pick. Leave it and it's entered for you, or tap below to change."
      : !data.pick && !dirty
        ? 'Pick a driver and a team. Your pick then carries over each race until you change it.'
        : dirty ? 'Not saved yet.' : 'Saved. It carries over to the next race unless you change it.';

  return (
    <div className="fx-layout">
      <div className="fx-main">
        <div className="entry-card">
          <h3>Your pick</h3>
          <div className="fx-slots">
            <div className="fx-slot" style={{ '--team-color': d?.teamColor }}>
              <span className="lbl">Driver</span>
              <span className="big">{d ? d.lastName : 'Not picked'}</span>
              <span className="sub">
                <span>{d ? d.team : 'Choose below'}</span>
                {d && <span className="mono">use {Math.min(usedDriver(d.id) + 1, caps.driver)}/{caps.driver}</span>}
              </span>
            </div>
            <div className="fx-slot" style={{ '--team-color': t?.color }}>
              <span className="lbl">Team</span>
              <span className="big">{t ? t.name : 'Not picked'}</span>
              <span className="sub">
                <span>{t ? 'Both cars score' : 'Choose below'}</span>
                {t && <span className="mono">use {Math.min(usedTeam(t.name) + 1, caps.team)}/{caps.team}</span>}
              </span>
            </div>
          </div>
          <div className={`fx-note${dirty && !locked ? ' warn' : ''}`}>{status}</div>
        </div>

        <div className="entry-card">
          <h3 className="fx-h3">Driver <small>each driver up to {caps.driver} times a season</small></h3>
          <div className="fx-tiles">
            {drivers.map(x => {
              const sel = x.id === driver;
              const maxed = usedDriver(x.id) >= caps.driver;
              const blocked = x.team === team;
              return (
                <button
                  key={x.id}
                  type="button"
                  className={`fx-tile${sel ? ' sel' : ''}`}
                  style={{ '--team-color': x.teamColor }}
                  disabled={locked || maxed || blocked}
                  aria-pressed={sel}
                  onClick={() => change(setDriver, x.id, driver)}
                >
                  <span className="top"><span className="n">#{x.num}</span>{x.id}<span className="nm">{x.lastName}</span></span>
                  <span className="bot">
                    <span>{maxed ? 'Used up' : blocked ? 'Your team' : x.team}</span>
                    <Pips used={usedDriver(x.id)} max={caps.driver} now={sel} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="entry-card">
          <h3 className="fx-h3">Team <small>each team up to {caps.team} times · not your driver's team</small></h3>
          <div className="fx-tiles teams">
            {teams.map(x => {
              const sel = x.name === team;
              const used = usedTeam(x.name);
              const maxed = used >= caps.team;
              const blocked = d?.team === x.name;
              return (
                <button
                  key={x.name}
                  type="button"
                  className={`fx-tile${sel ? ' sel' : ''}`}
                  style={{ '--team-color': x.color }}
                  disabled={locked || maxed || blocked}
                  aria-pressed={sel}
                  onClick={() => change(setTeam, x.name, team)}
                >
                  <span className="top"><span className="tn">{x.name}</span></span>
                  <span className="bot">
                    <span>{maxed ? 'Used up' : blocked ? "Your driver's team" : `${caps.team - used} left`}</span>
                    <Pips used={used} max={caps.team} now={sel} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="fx-side">
        <div className="entry-card">
          <h3 className="fx-h3">Powerups <small>one per weekend</small></h3>
          <div className="fx-powers">
            {POWERUPS.map(p => {
              const on = powerup === p.id;
              const left = data.powerups[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`fx-power${on ? ' on' : ''}`}
                  disabled={locked || (!on && left < 1)}
                  aria-pressed={on}
                  onClick={() => change(setPowerup, p.id, powerup)}
                >
                  <span className="ic">{p.icon}</span>
                  <b>{p.name}</b>
                  <span>{p.desc}</span>
                  <em>{on ? 'Playing this weekend' : left < 1 ? 'None left' : `${left} left this season`}</em>
                </button>
              );
            })}
          </div>
        </div>

        <div className="entry-card">
          <h3 className="fx-h3">What it's worth <small>added to the scoreboard</small></h3>
          <div className="fx-ladder">
            {data.payout.map((p, i) => <div key={i}><b>+{p}</b><span>{PLACES[i]}</span></div>)}
          </div>
          <div className="fx-note plain">Your weekend fantasy score ranks you against the league. Only that rank adds points.</div>
        </div>

        <details className="entry-card entry-guide" open>
          <summary><h3>How the weekend scores</h3></summary>
          <table className="fx-key">
            <tbody>
              <tr className="grp"><td colSpan="2">Driver</td></tr>
              <tr><td>Race finish</td><td>25, 18, 15 … 1</td></tr>
              {race.isSprint && <tr><td>Sprint finish</td><td>8 … 1</td></tr>}
              <tr><td>Places gained or lost from grid</td><td>±1 each</td></tr>
              <tr><td>Pole · fastest lap</td><td>+5 each</td></tr>
              <tr><td>Did not finish</td><td className="neg">−10</td></tr>
              <tr className="grp"><td colSpan="2">Team</td></tr>
              <tr><td>Both cars' race points</td><td>half</td></tr>
              <tr><td>Both cars in the points</td><td>+5</td></tr>
              <tr><td>Fastest pit stop of the race</td><td>+5</td></tr>
            </tbody>
          </table>
        </details>

        {!locked && (
          <div className="entry-submit-bar">
            <div className="fx-save-txt">
              <b>{complete ? `${d?.lastName || driver} + ${team}` : 'Pick a driver and a team'}</b>
              <span>{powerup === 'boost' ? 'Boost ×2 on' : powerup === 'net' ? 'Safety net on' : 'No powerup'}</span>
            </div>
            <button className="btn primary" disabled={!canSave || saving} onClick={save}>
              {saving ? 'Saving…' : canSave ? 'Save pick →' : complete ? 'Saved ✓' : 'Save pick'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
