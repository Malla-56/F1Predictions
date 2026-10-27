import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAppData } from '../context/AppDataContext';
import Topbar from '../components/Topbar';
import DriverChip from '../components/DriverChip';
import useIsMobile from '../hooks/useIsMobile';
import Modal from '../components/Modal';
import { onActivate } from '../components/useDialog';

export default function MyTips() {
  const { races, countryFlag, loading: racesLoading } = useAppData();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [myPreds, setMyPreds] = useState([]);
  const [scores, setScores] = useState({});
  const [expandedRound, setExpandedRound] = useState(null);

  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    api.predictions.myAll().then(setMyPreds).catch(e => setLoadError(e.message));
    api.scores.leaderboard().then(rows => {
      const me = rows.find(r => r.isMe);
      if (me) setScores(me.perRace);
    }).catch(e => setLoadError(e.message));
  }, []);

  const predMap = Object.fromEntries(myPreds.map(p => [p.round, p]));

  const upcoming = races.find(r => r.status === 'upcoming' && !r.isCancelled);

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
            <h2 className="page-title">My Tips</h2>
            <div className="page-sub">Round-by-round submissions · {races[0]?.date ? new Date(races[0].date).getFullYear() : new Date().getFullYear()} season</div>
          </div>
        </div>

        {loadError && <div className="results-empty">Couldn't load your tips: {loadError}</div>}
        {racesLoading && <div className="loading">Loading races…</div>}

        <div className="score-table">
          {!isMobile && (
            <div className="score-row mytips-row head">
              <span>Round</span>
              <span>Race</span>
              <span>Pole</span>
              <span>P1</span>
              <span>DNF</span>
              <span>Points</span>
              <span></span>
            </div>
          )}

          {races.filter(r => !r.isCancelled).map(r => {
            const pred = predMap[r.round];
            const pts = scores[r.round];
            const onRowClick = () => {
              if (pred && r.status === 'done') {
                setExpandedRound(r.round);
              } else if (!pred && r.status !== 'done') {
                navigate(`/predict/${r.round}`);
              } else if (pred) {
                setExpandedRound(r.round);
              }
            };

            if (isMobile) {
              return (
                <div
                  key={r.round}
                  className="mytips-card"
                  style={{ opacity: r.status === 'future' && !pred ? 0.5 : 1 }}
                  onClick={onRowClick}
                  role="button"
                  tabIndex={0}
                  onKeyDown={onActivate(onRowClick)}
                >
                  <div className="mytips-card-hd">
                    <span className="rank" style={{ fontSize: 14, color: r.status === 'upcoming' ? 'var(--red)' : 'var(--text-2)' }}>
                      R{String(r.round).padStart(2, '0')}
                    </span>
                    <div className="mytips-card-race">
                      <span>{r.name}</span>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                        {countryFlag(r.countryCode)} {r.circuit?.toUpperCase()}
                      </span>
                    </div>
                    <span className="chev" style={{ color: 'var(--text-3)' }}>→</span>
                  </div>
                  <div className="mytips-card-body">
                    <div className="mytips-field">
                      <span className="mytips-lbl">Pole</span>
                      <DriverChip driverId={pred?.pole} />
                    </div>
                    <div className="mytips-field">
                      <span className="mytips-lbl">P1</span>
                      <DriverChip driverId={pred?.positions?.[0]} />
                    </div>
                    <div className="mytips-field">
                      <span className="mytips-lbl">DNF</span>
                      <DriverChip driverId={pred?.dnf} />
                    </div>
                    <div className="mytips-field">
                      <span className="mytips-lbl">Points</span>
                      {pts !== undefined
                        ? <span className="num" style={{ color: 'var(--green)' }}>{pts.points} pts</span>
                        : r.status === 'upcoming' || r.status === 'future'
                          ? <span className="badge pending dot">Pending</span>
                          : <span className="num" style={{ color: 'var(--text-3)' }}>—</span>
                      }
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={r.round}>
                <div
                  className="score-row mytips-row"
                  style={{
                    opacity: r.status === 'future' && !pred ? 0.5 : 1,
                    cursor: pred ? 'pointer' : (r.status !== 'done' ? 'pointer' : 'default'),
                  }}
                  onClick={onRowClick}
                  {...(pred || r.status !== 'done' ? {
                    role: 'button',
                    tabIndex: 0,
                    onKeyDown: onActivate(onRowClick),
                  } : {})}
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
              </div>
            );
          })}
        </div>

        {expandedRound && predMap[expandedRound] && (
          <Modal onClose={() => setExpandedRound(null)} labelledBy="mytips-modal-title">
              <div style={{ marginBottom: 16 }}>
                <h3 id="mytips-modal-title">Round {String(expandedRound).padStart(2, '0')} — Full Tips</h3>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  {races.find(r => r.round === expandedRound)?.name}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, maxHeight: '60vh', overflowY: 'auto' }}>
                {(predMap[expandedRound].positions || []).map((driverId, i) => (
                  <div key={i} style={{ padding: '10px 0', borderBottom: i < 9 ? '1px solid var(--line)' : 'none' }}>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>POSITION {i + 1}</div>
                    <DriverChip driverId={driverId} showName />
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>POLE POSITION</div>
                  <DriverChip driverId={predMap[expandedRound].pole} showName />
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>DID NOT FINISH</div>
                  <DriverChip driverId={predMap[expandedRound].dnf} showName />
                </div>
              </div>
          </Modal>
        )}
      </div>
    </>
  );
}
