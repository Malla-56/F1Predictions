import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAppData } from '../context/AppDataContext';
import Topbar from '../components/Topbar';
import DriverChip from '../components/DriverChip';

export default function MyTips() {
  const { races, countryFlag } = useAppData();
  const navigate = useNavigate();
  const [myPreds, setMyPreds] = useState([]);
  const [scores, setScores] = useState({});

  useEffect(() => {
    api.predictions.myAll().then(setMyPreds).catch(() => {});
    api.scores.leaderboard().then(rows => {
      const me = rows.find(r => r.isMe);
      if (me) setScores(me.perRace);
    }).catch(() => {});
  }, []);

  const predMap = Object.fromEntries(myPreds.map(p => [p.round, p]));

  const upcoming = races.find(r => r.status === 'upcoming');

  return (
    <>
      <Topbar
        crumbs={['Pulse League', 'My Tips']}
        right={
          upcoming && (
            <button className="btn primary" onClick={() => navigate(`/predict/${upcoming.round}`)}>
              Edit current tips →
            </button>
          )
        }
      />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>My Tips</h2>
            <div className="muted" style={{ marginTop: 6 }}>Round-by-round submissions · 2025 season</div>
          </div>
        </div>

        <div className="score-table">
          <div className="score-row head" style={{ gridTemplateColumns: '56px 1fr 130px 130px 130px 120px 32px' }}>
            <span>Round</span>
            <span>Race</span>
            <span>Pole</span>
            <span>P1</span>
            <span>DNF</span>
            <span>Points</span>
            <span></span>
          </div>

          {races.map(r => {
            const pred = predMap[r.round];
            const pts = scores[r.round];
            return (
              <div
                key={r.round}
                className="score-row"
                style={{
                  gridTemplateColumns: '56px 1fr 130px 130px 130px 120px 32px',
                  opacity: r.status === 'future' && !pred ? 0.5 : 1,
                  cursor: r.status !== 'done' ? 'pointer' : 'default',
                }}
                onClick={() => r.status !== 'done' && navigate(`/predict/${r.round}`)}
              >
                <span className="rank" style={{ fontSize: 15, color: r.status === 'upcoming' ? 'var(--red)' : 'var(--text-2)' }}>
                  R{String(r.round).padStart(2, '0')}
                </span>
                <div className="name" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span>{r.name}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', marginLeft: 0 }}>
                    {countryFlag(r.countryCode)} {r.circuit?.toUpperCase()}
                  </span>
                </div>
                <DriverChip driverId={pred?.pole} />
                <DriverChip driverId={pred?.positions?.[0]} />
                <DriverChip driverId={pred?.dnf} />
                <span className="num">
                  {pts !== undefined
                    ? <span style={{ color: 'var(--green)' }}>{pts.points} pts</span>
                    : r.status === 'upcoming' || r.status === 'future'
                      ? <span className="badge pending dot">Pending</span>
                      : <span style={{ color: 'var(--text-3)' }}>—</span>
                  }
                </span>
                <span className="chev" style={{ color: 'var(--text-3)' }}>→</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
