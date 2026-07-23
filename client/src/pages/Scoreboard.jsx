import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAppData } from '../context/AppDataContext';
import Topbar from '../components/Topbar';
import Avatar from '../components/Avatar';
import useIsMobile from '../hooks/useIsMobile';

export default function Scoreboard() {
  const { races } = useAppData();
  const [rows, setRows] = useState([]);
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    api.scores.leaderboard().then(setRows).catch(() => {});
  }, []);

  const completedRaces = races.filter(r => r.status === 'done');
  const lastRound = completedRaces[completedRaces.length - 1];

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function onSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortHd({ k, label }) {
    return (
      <span className={`sortable${sortKey === k ? ' active' : ''}`} onClick={() => onSort(k)}>
        {label} {sortKey === k && (sortDir === 'asc' ? '↑' : '↓')}
      </span>
    );
  }

  return (
    <>
      <Topbar crumbs={['Pulse League', 'Scoreboard']} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>Scoreboard</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              {rows.length} tippers · {completedRaces.length} rounds scored
            </div>
          </div>
        </div>

        <div className="score-table">
          {!isMobile && (
            <div className="score-row head">
              <SortHd k="rank" label="Rank" />
              <span></span>
              <span>Tipper</span>
              <SortHd k="total" label="Total Pts" />
              <span className="mono">{lastRound ? `R${lastRound.round}` : '—'}</span>
              <SortHd k="played" label="Rounds" />
              <span></span>
            </div>
          )}

          {isMobile && (
            <div className="score-sort-bar">
              <SortHd k="total" label="Total" />
              <SortHd k="played" label="Rounds" />
            </div>
          )}

          {sorted.map(r => {
            const lastPts = lastRound ? (r.perRace?.[lastRound.round]?.points ?? 0) : 0;
            const isOpen = expanded === r.userId;

            const expandPanel = isOpen && (
              <div key={`${r.userId}-exp`} className="score-expand">
                {races.map(race => {
                  const entry = r.perRace?.[race.round];
                  const isDone = race.status === 'done';
                  return (
                    <div key={race.round} className="exp-cell"
                         style={isDone && entry?.points >= 10 ? { borderColor: 'rgba(225,6,0,0.4)' } : !isDone ? { opacity: 0.4 } : {}}>
                      <span className="r">R{String(race.round).padStart(2, '0')}</span>
                      <span className={`p${!isDone || !entry ? ' bad' : ''}`}>
                        {isDone && entry ? entry.points : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            );

            if (isMobile) {
              return (
                <div key={r.userId}>
                  <div
                    className={`score-card${r.isMe ? ' me' : ''}${isOpen ? ' expanded' : ''}`}
                    onClick={() => setExpanded(isOpen ? null : r.userId)}
                  >
                    <span className={`rank${r.rank === 1 ? ' gold' : ''}`}>{String(r.rank).padStart(2, '0')}</span>
                    <Avatar displayName={r.displayName} size={32} isMe={r.isMe} />
                    <div className="score-card-mid">
                      <div className="name">{r.displayName}</div>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                        {r.played} / {races.length} rounds · last {lastPts} pts
                      </span>
                    </div>
                    <div className="score-card-pts">
                      <span className="num">{r.total}</span>
                      <span className="delta">+{lastPts}</span>
                    </div>
                    <span className="chev">▾</span>
                  </div>
                  {expandPanel}
                </div>
              );
            }

            return (
              <>
                <div
                  key={r.userId}
                  className={`score-row${r.isMe ? ' me' : ''}${isOpen ? ' expanded' : ''}`}
                  onClick={() => setExpanded(isOpen ? null : r.userId)}
                >
                  <span className={`rank${r.rank === 1 ? ' gold' : ''}`}>{String(r.rank).padStart(2, '0')}</span>
                  <Avatar displayName={r.displayName} size={36} isMe={r.isMe} />
                  <div className="name">{r.displayName}</div>
                  <span className="num">{r.total}<span className="delta">+{lastPts}</span></span>
                  <span className="num muted">{lastPts} pts</span>
                  <span className="num muted">{r.played} / {races.length}</span>
                  <span className="chev">▾</span>
                </div>

                {expandPanel}
              </>
            );
          })}

          {rows.length === 0 && (
            <div style={{ padding: '32px 16px', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              No scores yet — check back after the first race.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
