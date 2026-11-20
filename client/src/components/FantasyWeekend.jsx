import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAppData } from '../context/AppDataContext';
import Avatar from './Avatar';

const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const POWERUP_LABEL = { boost: 'Boost ×2', net: 'Safety net' };

// One line of a score breakdown, in words.
function lineText(l) {
  switch (l.key) {
    case 'race_finish':    return `Finished ${ordinal(l.pos)}`;
    case 'sprint_finish':  return `Sprint: finished ${ordinal(l.pos)}`;
    case 'grid_delta': {
      const n = Math.abs(l.from - l.to);
      return `Started ${ordinal(l.from)}, ${l.to < l.from ? 'gained' : 'lost'} ${n} place${n === 1 ? '' : 's'}`;
    }
    case 'pole':           return 'Pole position';
    case 'fastest_lap':    return 'Fastest lap';
    case 'dnf':            return 'Did not finish';
    case 'team_points':
      return l.positions?.length
        ? `Cars finished ${l.positions.map(ordinal).join(' and ')} (${l.raw} pts, halved)`
        : 'Neither car was classified';
    case 'both_in_points': return 'Both cars in the points';
    case 'fastest_pit':    return `Fastest pit stop${l.seconds ? `, ${l.seconds.toFixed(1)}s` : ''}`;
    default:               return l.key;
  }
}

function Breakdown({ entry, driverName }) {
  const { lines, driver, team, powerup, teamKnown } = entry.breakdown;
  const side = s => lines.filter(l => l.side === s);
  const row = (l, i) => (
    <tr key={i}>
      <td>{lineText(l)}{l.saved != null && <span className="fx-tag">Safety net</span>}</td>
      <td className={l.pts < 0 ? 'neg' : ''}>{l.saved != null ? <s>{signed(l.saved)}</s> : signed(l.pts)}</td>
    </tr>
  );
  return (
    <table className="fx-key">
      <tbody>
        <tr className="grp"><td colSpan="2">Driver · {driverName}</td></tr>
        {side('driver').length ? side('driver').map(row) : <tr><td>Not classified</td><td>0</td></tr>}
        {powerup === 'boost' && <tr><td>Boost ×2</td><td>{signed(driver / 2)}</td></tr>}
        <tr className="grp"><td colSpan="2">Team · {entry.team}</td></tr>
        {teamKnown ? side('team').map(row) : <tr><td>Team data isn't in yet</td><td>—</td></tr>}
        <tr className="tot"><td>Weekend score</td><td>{driver + team}</td></tr>
      </tbody>
    </table>
  );
}

// The league's fantasy weekend for a finished round: who picked what, how each pick
// scored, and what the ranking added to the scoreboard.
export default function FantasyWeekend({ round }) {
  const { driverById, drivers } = useAppData();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let stale = false;
    setData(null);
    setError(null);
    setOpenId(null);
    api.fantasy.weekend(round)
      .then(d => { if (!stale) setData(d); })
      .catch(e => { if (!stale) setError(e.message); });
    return () => { stale = true; };
  }, [round]);

  if (error) return <div className="results-empty">Couldn't load the fantasy weekend: {error}</div>;
  if (!data) return <div className="loading">Loading fantasy weekend…</div>;

  const picked = data.entries.filter(e => e.hasPick);
  if (!picked.length) return <div className="results-empty">Nobody in this league made a fantasy pick for this race.</div>;

  const me = data.entries.find(e => e.isMe);
  const shown = data.entries.find(e => e.userId === openId && e.breakdown) || (me?.breakdown ? me : null);
  const nameOf = code => driverById(code)?.lastName || code;
  const colorOf = e => ({
    driver: driverById(e.driver)?.teamColor,
    team: drivers.find(d => d.team === e.team)?.teamColor,
  });

  // Ties: say so, since the next place is skipped.
  const rankCounts = {};
  for (const e of data.entries) if (e.rank) rankCounts[e.rank] = (rankCounts[e.rank] || 0) + 1;
  const isTied = e => e.rank && rankCounts[e.rank] > 1;

  // Fun, unscored: the driver most people in the league went for.
  const counts = {};
  for (const e of picked) if (e.driver) counts[e.driver] = (counts[e.driver] || 0) + 1;
  const [popular, popularCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];

  return (
    <div className="fx-weekend">
      <div className="fx-main">
        {me?.rank != null && (
          <div className="card fx-summary">
            <div><b>{ordinal(me.rank)}</b><span>of {picked.length} who picked</span></div>
            <div><b>{me.score}</b><span>Fantasy score</span></div>
            <div className={me.bonus ? 'gain' : ''}><b>{signed(me.bonus)}</b><span>To scoreboard</span></div>
          </div>
        )}

        <div className="card">
          <div className="fx-list-hd">
            <h3>League this weekend</h3>
            <span>{data.scored ? 'score · scoreboard points' : data.locked ? 'waiting for the result' : 'hidden until tips lock'}</span>
          </div>
          {data.entries.map(e => {
            const c = e.driver ? colorOf(e) : {};
            const canOpen = !!e.breakdown;
            return (
              <button
                key={e.userId}
                type="button"
                className={`fx-rank btn-reset${e.isMe ? ' me' : ''}${shown?.userId === e.userId ? ' open' : ''}`}
                disabled={!canOpen}
                onClick={() => setOpenId(e.userId)}
                aria-pressed={shown?.userId === e.userId}
              >
                <span className="pos">{e.rank ? `${isTied(e) ? '=' : ''}${e.rank}` : '—'}</span>
                <Avatar displayName={e.displayName} size={32} isMe={e.isMe} />
                <span className="who">
                  <b>
                    {e.displayName}
                    {e.powerup && <span className="fx-tag">{POWERUP_LABEL[e.powerup]}</span>}
                    {e.carried && <span className="fx-tag quiet">Carried</span>}
                  </b>
                  <span className="picks">
                    {e.driver ? (
                      <>
                        <span><i style={{ background: c.driver }} />{nameOf(e.driver)}</span>
                        <span><i style={{ background: c.team }} />{e.team}</span>
                      </>
                    ) : e.hasPick ? 'Pick hidden until lock' : 'No pick'}
                  </span>
                </span>
                <span className="sc">{e.score ?? '—'}</span>
                <span className={`gain${e.bonus ? '' : ' zero'}`}>{e.bonus != null ? signed(e.bonus) : ''}</span>
              </button>
            );
          })}
          <div className="fx-list-ft">
            Top {data.payout.length} score {data.payout.map(p => `+${p}`).join(', ')}. Tied places share the higher points and the next place is skipped.
          </div>
        </div>
      </div>

      <div className="fx-side">
        {shown && (
          <div className="entry-card">
            <h3 className="fx-h3">{shown.isMe ? 'Your breakdown' : `${shown.displayName}'s breakdown`}<small>tap a name to compare</small></h3>
            <Breakdown entry={shown} driverName={nameOf(shown.driver)} />
          </div>
        )}
        {(data.overtakes || popular) && (
          <div className="entry-card">
            <h3 className="fx-h3">Weekend stats <small>for fun, not scored</small></h3>
            <table className="fx-key">
              <tbody>
                {shown && data.overtakes && (
                  <tr><td>{nameOf(shown.driver)} overtakes</td><td>{data.overtakes[shown.driver] || 0}</td></tr>
                )}
                {popular && <tr><td>Most popular driver in the league</td><td>{nameOf(popular)} ×{popularCount}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
