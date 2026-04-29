import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import Topbar from '../components/Topbar';
import ResultsTable from '../components/ResultsTable';
import SpecialPair from '../components/SpecialPair';

export default function Results({ setToast }) {
  const { user } = useAuth();
  const { races, countryFlag, loading: racesLoading } = useAppData();
  const navigate = useNavigate();

  const [roundId, setRoundId] = useState(null);
  const [showRoundMenu, setShowRoundMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(undefined);
  const [allPredictions, setAllPredictions] = useState(undefined);
  const [roundScores, setRoundScores] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [error, setError] = useState(null);

  // Get completed races (results available)
  const completed = races.filter(r => r.status === 'done');

  // Initialize with most recent completed race
  useEffect(() => {
    if (!roundId && completed.length > 0) {
      setRoundId(completed[completed.length - 1].round);
    }
  }, [completed.length, roundId]);

  // Load results and predictions when round changes
  useEffect(() => {
    if (!roundId) return;

    setLoading(true);
    setError(null);
    setAllPredictions(undefined);
    setRoundScores(null);

    Promise.all([
      api.results.get(roundId).catch(() => null),
      api.get(`/predictions/${roundId}`).catch(() => null),
      api.scores.round(roundId).catch(() => null),
    ])
      .then(([res, preds, scores]) => {
        setResults(res);
        setAllPredictions(preds || []);
        setRoundScores(scores);
        // Default to current user if they have a prediction, else first submitted
        if (user && preds && preds.length > 0) {
          const mine = preds.find(p => String(p.userId || p.user_id) === String(user.id));
          const firstSubmitted = preds.find(p => !!(p.positions || p.pole || p.dnf));
          const defaultUid = mine
            ? String(user.id)
            : firstSubmitted
              ? String(firstSubmitted.userId || firstSubmitted.user_id)
              : null;
          setSelectedUserId(defaultUid);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [roundId, user?.id]);

  // ALL hooks must be before any early returns
  const predictions = useMemo(() => {
    if (!selectedUserId || !allPredictions) return null;
    const selectedIdStr = String(selectedUserId);
    return allPredictions.find(p => String(p.userId || p.user_id) === selectedIdStr) || null;
  }, [selectedUserId, allPredictions]);

  const selectedScore = useMemo(() => {
    if (!roundScores?.scores || !selectedUserId) return null;
    return roundScores.scores.find(s => String(s.userId) === String(selectedUserId)) || null;
  }, [roundScores, selectedUserId]);

  const { exactCount, oneOffCount } = useMemo(() => {
    if (!results?.finishOrder || !predictions?.positions) return { exactCount: 0, oneOffCount: 0 };
    let exact = 0, oneOff = 0;
    predictions.positions.forEach((pos, i) => {
      const actualIdx = results.finishOrder.indexOf(pos);
      if (actualIdx === -1) return;
      const d = Math.abs(actualIdx - i);
      if (d === 0) exact++;
      else if (d === 1) oneOff++;
    });
    return { exactCount: exact, oneOffCount: oneOff };
  }, [results, predictions]);

  // Derived values (not hooks)
  const leagueAvg = roundScores?.leagueAverage ?? 0;
  const totalPts = selectedScore?.points ?? 0;
  const breakdown = selectedScore?.breakdown ?? {};
  const actualDnfs = results ? (Array.isArray(results.dnfs) ? results.dnfs : (results.dnf ? [results.dnf] : [])) : [];
  const race = races.find(r => r.round === roundId);
  const idx = completed.findIndex(r => r.round === roundId);
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < completed.length - 1;

  if (!race) {
    return (
      <>
        <Topbar crumbs={['Pulse League', 'Results']} />
        <div className="content"><div className="loading">Loading race data…</div></div>
      </>
    );
  }

  if (error && results === undefined) {
    return (
      <>
        <Topbar crumbs={['Pulse League', 'Results', race.name]} />
        <div className="content">
          <div className="results-empty">Error loading results: {error}</div>
        </div>
      </>
    );
  }

  if (results === undefined || allPredictions === undefined) {
    return (
      <>
        <Topbar crumbs={['Pulse League', 'Results', race.name]} />
        <div className="content"><div className="loading">Loading results…</div></div>
      </>
    );
  }

  const topbarRight = (
    <>
      <span className="badge dot" style={{ color: 'var(--red-2)', borderColor: 'rgba(225,6,0,.4)', background: 'var(--red-dim)' }}>
        R{String(race.round).padStart(2, '0')} · Results
      </span>
    </>
  );

  return (
    <>
      <Topbar crumbs={['Pulse League', 'Results', race.name]} right={topbarRight} />
      <div className="content">
        <div className="results-head">
          <button className="results-back" onClick={() => navigate('/home')}>
            <span className="mono">←</span> Back
          </button>
          <div className="results-title">
            <h2>Race Results · {race.name}</h2>
            <div className="sub">
              <span className="flag">{countryFlag(race.countryCode)}</span>
              <span>{race.circuit}</span>
              <span style={{ color: 'var(--text-3)' }}>·</span>
              <span className="mono" style={{ fontSize: '11.5px', letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
                {new Date(race.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="round-selector-wrap">
              <div className="round-selector">
                <button className="arrow-btn" disabled={!canPrev} onClick={() => canPrev && setRoundId(completed[idx - 1].round)}>
                  ‹
                </button>
                <div className="pill" onClick={() => setShowRoundMenu(o => !o)}>
                  <span className="r">R{String(race.round).padStart(2, '0')}</span>
                  <span>{race.name}</span>
                  <span className="chev">▾</span>
                </div>
                <button className="arrow-btn" disabled={!canNext} onClick={() => canNext && setRoundId(completed[idx + 1].round)}>
                  ›
                </button>
              </div>
              {showRoundMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setShowRoundMenu(false)} />
                  <div className="round-menu">
                    {races.map(r => {
                      const isActive = r.round === roundId;
                      return (
                        <div
                          key={r.round}
                          className={'item ' + (isActive ? 'active' : '') + (r.status !== 'done' ? ' disabled' : '')}
                          onClick={() => {
                            if (r.status === 'done') {
                              setRoundId(r.round);
                              setShowRoundMenu(false);
                            }
                          }}
                          style={r.status !== 'done' ? { opacity: 0.4, cursor: 'not-allowed' } : null}
                        >
                          <span className="r">R{String(r.round).padStart(2, '0')}</span>
                          <div>
                            <div className="nm">{r.name}</div>
                            <div className="stat">
                              {countryFlag(r.countryCode)} · {r.circuit}
                            </div>
                          </div>
                          <span className="stat">{r.status === 'done' ? 'DONE' : r.status === 'upcoming' ? 'OPEN' : '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* User selector */}
            {allPredictions && allPredictions.length > 0 && (
              <div style={{ position: 'relative' }}>
                <select
                  value={selectedUserId || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedUserId(val ? val : null);
                  }}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'var(--body)',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All Predictions</option>
                  {allPredictions.map(p => {
                    const uid = p.userId || p.user_id;
                    return (
                      <option key={uid} value={uid}>
                        {p.displayName || uid}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>
        </div>

        {!results ? (
          <div className="results-empty">Results for this race haven't been published yet</div>
        ) : (
          <>
            {/* KPI strip - only show if viewing a specific user's predictions */}
            {predictions && selectedUserId && (
              <div className="results-kpis">
                <div className="kpi-cell accent">
                  <span className="lbl">Your Score</span>
                  <span className="val" style={{ color: 'var(--red)' }}>
                    {totalPts}
                  </span>
                  <span className="sub">league avg {leagueAvg}</span>
                </div>
                <div className="kpi-cell">
                  <span className="lbl">Exact Hits</span>
                  <span className="val" style={{ color: 'var(--green)' }}>
                    {exactCount} <span style={{ fontSize: '14px', color: 'var(--text-3)' }}>/ 10</span>
                  </span>
                  <span className="sub">{oneOffCount} one-off</span>
                </div>
                <div className="kpi-cell">
                  <span className="lbl">Pole</span>
                  <span className="val" style={{ color: breakdown.pole_correct ? 'var(--green)' : 'var(--red-2)' }}>
                    {breakdown.pole_correct ? '✓' : '✗'}
                  </span>
                  <span className="sub">
                    {breakdown.pole_correct
                      ? `+${breakdown.pole_correct} pts · correct`
                      : 'predicted ' + predictions.pole}
                  </span>
                </div>
                <div className="kpi-cell">
                  <span className="lbl">DNF</span>
                  <span className="val" style={{ color: breakdown.dnf_correct ? 'var(--green)' : 'var(--red-2)' }}>
                    {breakdown.dnf_correct ? '✓' : '✗'}
                  </span>
                  <span className="sub">
                    {breakdown.dnf_correct
                      ? `+${breakdown.dnf_correct} pts · correct`
                      : 'predicted ' + predictions.dnf}
                  </span>
                </div>
              </div>
            )}

            {/* Two columns */}
            <div className="results-cols">
              {/* Actual results */}
              <div className="results-col actual">
                <div className="results-col-hd">
                  <h3>Actual Results</h3>
                  <span className="meta">Official · FIA</span>
                </div>

                <SpecialPair
                  pole={results.pole}
                  dnf={Array.isArray(results.dnfs) && results.dnfs.length > 0 ? results.dnfs[0] : results.dnf}
                  comparePole={null}
                  compareDnf={null}
                />

                <ResultsTable rows={results.finishOrder.map((id, i) => ({ pos: i, driverId: id }))} actual />
              </div>

              {/* Predictions for selected user or all */}
              <div className="results-col">
                <div className="results-col-hd">
                  <h3>{selectedUserId ? 'Predictions' : 'All Submissions'}</h3>
                  <span className="meta">
                    {selectedUserId
                      ? predictions
                        ? `${predictions.displayName || (predictions.userId || predictions.user_id)} · ${predictions.submittedAt ? 'Submitted' : 'Not submitted'}`
                        : 'Not submitted'
                      : `${allPredictions?.filter(p => !!(p.positions || p.pole || p.dnf)).length || 0} submitted`}
                  </span>
                </div>

                {!selectedUserId ? (
                  <div className="predictions-summary">
                    <div className="summary-header">Race locked - All predictions revealed:</div>
                    {allPredictions && allPredictions.length > 0 ? (
                      <div className="predictions-list">
                        {allPredictions.map(p => {
                          const uid = p.userId || p.user_id;
                          const hasDetails = !!(p.positions || p.pole || p.dnf);
                          return (
                            <div
                              key={uid}
                              className="prediction-item"
                              onClick={() => setSelectedUserId(uid)}
                              style={{ cursor: hasDetails ? 'pointer' : 'default', opacity: hasDetails ? 1 : 0.5 }}
                            >
                              <div className="pred-name">{p.displayName || uid}</div>
                              <div className="pred-meta">{hasDetails ? 'Submitted' : 'Not submitted'}</div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="results-empty-col">
                        <div className="empty-icon">📋</div>
                        <div className="empty-text">No predictions submitted</div>
                      </div>
                    )}
                  </div>
                ) : !predictions || (!predictions.positions && !predictions.pole && !predictions.dnf) ? (
                  <div className="results-empty-col">
                    <div className="empty-icon">—</div>
                    <div className="empty-text">{selectedUserId ? 'No predictions submitted' : 'Race is complete'}</div>
                  </div>
                ) : (
                  <>
                    {(predictions.pole || predictions.dnf) && (
                      <SpecialPair
                        pole={predictions.pole}
                        dnf={predictions.dnf}
                        comparePole={results.pole}
                        compareDnf={Array.isArray(results.dnfs) ? results.dnfs : (results.dnf ? [results.dnf] : null)}
                      />
                    )}

                    {predictions.positions && predictions.positions.length > 0 && (
                      <ResultsTable
                        rows={predictions.positions.map((id, i) => {
                          const actualIdx = results.finishOrder.indexOf(id);
                          const distance = actualIdx === -1 ? 99 : Math.abs(actualIdx - i);
                          return { pos: i, driverId: id, distance, actualPos: actualIdx };
                        })}
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            {predictions && (
              <div className="results-legend">
                <span style={{ color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Legend</span>
                <span className="item">
                  <span className="sw s0">✓</span> Exact match · +3 pts
                </span>
                <span className="item">
                  <span className="sw s1">±1</span> One-off · +1 pt
                </span>
                <span className="item">
                  <span className="sw s2">±2</span> Two-off · 0 pts
                </span>
                <span className="item">
                  <span className="sw s3">✗</span> Three+ / missing · 0 pts
                </span>
                <span className="item" style={{ marginLeft: 'auto' }}>
                  Pole / DNF correct · +5 pts each
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
