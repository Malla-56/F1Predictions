import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAppData } from '../context/AppDataContext';
import Topbar from '../components/Topbar';
import LineChart from '../components/LineChart';
import BarChart from '../components/BarChart';

export default function Stats() {
  const { races } = useAppData();
  const [standings, setStandings] = useState([]);
  const [opponent, setOpponent] = useState(null);

  useEffect(() => {
    api.scores.leaderboard().then(rows => {
      setStandings(rows);
      const notMe = rows.find(r => !r.isMe);
      if (notMe) setOpponent(notMe.userId);
    }).catch(() => {});
  }, []);

  const completedRaces = races.filter(r => r.status === 'done');
  const me = standings.find(r => r.isMe);
  const opp = standings.find(r => r.userId === opponent);
  const others = standings.filter(r => !r.isMe);

  if (!me || completedRaces.length === 0) {
    return (
      <>
        <Topbar crumbs={['Pulse League', 'Your Stats']} />
        <div className="content">
          <div className="loading">No race data yet — stats will appear after the first scored round.</div>
        </div>
      </>
    );
  }

  const myPoints = completedRaces.map(r => me.perRace?.[r.round]?.points ?? 0);
  const avgPoints = completedRaces.map(r => {
    const sum = standings.reduce((a, u) => a + (u.perRace?.[r.round]?.points ?? 0), 0);
    return standings.length > 0 ? Math.round(sum / standings.length) : 0;
  });
  const oppPoints = opp ? completedRaces.map(r => opp.perRace?.[r.round]?.points ?? 0) : [];

  const bestRound = completedRaces.reduce((b, r) => (me.perRace?.[r.round]?.points ?? 0) >= (me.perRace?.[b.round]?.points ?? 0) ? r : b, completedRaces[0]);
  const worstRound = completedRaces.reduce((w, r) => (me.perRace?.[r.round]?.points ?? 0) <= (me.perRace?.[w.round]?.points ?? 0) ? r : w, completedRaces[0]);

  const poleHits = completedRaces.filter(r => me.perRace?.[r.round]?.breakdown?.pole_correct).length;
  const dnfHits  = completedRaces.filter(r => me.perRace?.[r.round]?.breakdown?.dnf_correct).length;
  const polePct  = completedRaces.length ? Math.round((poleHits / completedRaces.length) * 100) : 0;
  const dnfPct   = completedRaces.length ? Math.round((dnfHits / completedRaces.length) * 100) : 0;

  const margin = opp ? me.total - opp.total : 0;

  return (
    <>
      <Topbar crumbs={['Pulse League', 'Your Stats']} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>Your Stats</h2>
            <div className="muted" style={{ marginTop: 6 }}>{completedRaces.length} rounds analysed · season form vs league average</div>
          </div>
        </div>

        <div className="stat-grid">
          <div className="panel">
            <div className="panel-hd">
              <h3>Points per Race · Form</h3>
              <div className="legend">
                <span><span className="sw" style={{ background: 'var(--red)' }} />You</span>
                <span><span className="sw" style={{ background: 'var(--text-3)' }} />League avg</span>
              </div>
            </div>
            <LineChart
              races={completedRaces}
              series={[
                { name: 'You', color: 'var(--red)', values: myPoints, dotted: false },
                { name: 'Avg', color: 'var(--text-3)', values: avgPoints, dotted: true },
              ]}
              height={280}
            />
          </div>

          <div className="panel">
            <h3>Accuracy</h3>
            <div className="kpis">
              <div className="kpi">
                <span className="lbl">Pole pick %</span>
                <span className={`val ${polePct >= 50 ? 'green' : 'red'}`}>{polePct}%</span>
                <span className="sub">{poleHits} of {completedRaces.length} correct</span>
              </div>
              <div className="kpi">
                <span className="lbl">DNF pick %</span>
                <span className={`val ${dnfPct >= 50 ? 'green' : 'red'}`}>{dnfPct}%</span>
                <span className="sub">{dnfHits} of {completedRaces.length} correct</span>
              </div>
              <div className="kpi">
                <span className="lbl">Total points</span>
                <span className="val">{me.total}</span>
                <span className="sub">Rank #{me.rank} overall</span>
              </div>
              <div className="kpi">
                <span className="lbl">Rounds played</span>
                <span className="val">{me.played}</span>
                <span className="sub">of {races.length} total</span>
              </div>
            </div>
          </div>
        </div>

        <div className="stat-grid-2">
          <div className="panel">
            <div className="panel-hd">
              <h3>Head-to-Head</h3>
              <select
                className="btn ghost"
                style={{ padding: '0 12px', height: 34, fontFamily: 'var(--display)' }}
                value={opponent || ''}
                onChange={e => setOpponent(Number(e.target.value))}
              >
                {others.map(u => (
                  <option key={u.userId} value={u.userId}>vs {u.displayName}</option>
                ))}
              </select>
            </div>
            {opp && (
              <>
                <BarChart
                  races={completedRaces}
                  series={[
                    { name: 'You', color: 'var(--red)', values: myPoints },
                    { name: opp.displayName, color: '#3a7bff', values: oppPoints },
                  ]}
                  height={240}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--line)' }} className="mono">
                  <span style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Season margin</span>
                  <span style={{ fontSize: 13, color: margin >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {margin >= 0 ? '+' : ''}{margin} pts
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <h3>Round Highlights</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="highlight-card">
                <div className="ico">★</div>
                <div className="body">
                  <div className="t">Best round</div>
                  <div className="h">R{String(bestRound.round).padStart(2,'0')} · {bestRound.name}</div>
                  <div className="s">{me.perRace?.[bestRound.round]?.points ?? 0} points scored</div>
                </div>
                <div className="pts" style={{ color: 'var(--red)' }}>{me.perRace?.[bestRound.round]?.points ?? 0}</div>
              </div>

              <div className="highlight-card bad">
                <div className="ico">▼</div>
                <div className="body">
                  <div className="t">Worst round</div>
                  <div className="h">R{String(worstRound.round).padStart(2,'0')} · {worstRound.name}</div>
                  <div className="s">{me.perRace?.[worstRound.round]?.points ?? 0} points scored</div>
                </div>
                <div className="pts" style={{ color: 'var(--text-2)' }}>{me.perRace?.[worstRound.round]?.points ?? 0}</div>
              </div>

              <div className="highlight-card" style={{ borderColor: 'rgba(42,209,123,0.35)', background: 'rgba(42,209,123,0.05)' }}>
                <div className="ico" style={{ background: 'rgba(42,209,123,0.15)', color: 'var(--green)' }}>↗</div>
                <div className="body">
                  <div className="t">League position</div>
                  <div className="h">#{me.rank} of {standings.length} tippers</div>
                  <div className="s">{me.total} total points scored</div>
                </div>
                <div className="pts" style={{ color: 'var(--green)' }}>#{me.rank}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
