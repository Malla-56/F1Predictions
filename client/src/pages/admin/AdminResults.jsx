import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAppData } from '../../context/AppDataContext';
import Topbar from '../../components/Topbar';
import DriverDropdown from '../../components/DriverDropdown';
import DriverChip from '../../components/DriverChip';

export default function AdminResults({ setToast }) {
  const { races, drivers, countryFlag } = useAppData();
  const [selectedRound, setSelectedRound] = useState(null);
  const [finishOrder, setFinishOrder] = useState(Array(10).fill(null));
  const [pole, setPole] = useState(null);
  const [dnfs, setDnfs] = useState([null]);
  const [sprintWinner, setSprintWinner] = useState(null);
  const [storedResults, setStoredResults] = useState({});
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchingAll, setFetchingAll] = useState(false);

  useEffect(() => {
    api.admin.results().then(rows => {
      setStoredResults(Object.fromEntries(rows.map(r => [r.race_round, r.result])));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedRound) return;
    const stored = storedResults[selectedRound];
    if (stored) {
      setFinishOrder(stored.finishOrder || Array(10).fill(null));
      setPole(stored.pole || null);
      setDnfs(stored.dnfs?.length ? stored.dnfs.map(d => d) : [null]);
      setSprintWinner(stored.sprintWinner || null);
    } else {
      setFinishOrder(Array(10).fill(null));
      setPole(null);
      setDnfs([null]);
      setSprintWinner(null);
    }
  }, [selectedRound, storedResults]);

  function setPosition(i, driverId) {
    setFinishOrder(arr => {
      const next = [...arr];
      const existing = arr.indexOf(driverId);
      if (existing > -1) next[existing] = arr[i];
      next[i] = driverId;
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api.admin.saveResult(selectedRound, { finishOrder, pole, dnfs: dnfs.filter(Boolean), sprintWinner });
      setToast(`R${selectedRound} results saved and scored`);
      api.admin.results().then(rows => setStoredResults(Object.fromEntries(rows.map(r => [r.race_round, r.result])))).catch(() => {});
    } catch (err) {
      setToast(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function rescore() {
    await api.admin.rescore(selectedRound);
    setToast(`R${selectedRound} rescored`);
  }

  async function fetchFromOpenF1() {
    setFetching(true);
    try {
      const res = await api.admin.fetchResult(selectedRound);
      setToast(`R${selectedRound} fetched from OpenF1 and scored ✓`);
      // Reload stored results and pre-fill the form
      const rows = await api.admin.results();
      setStoredResults(Object.fromEntries(rows.map(r => [r.race_round, r.result])));
    } catch (err) {
      setToast(`Fetch failed: ${err.message}`);
    } finally {
      setFetching(false);
    }
  }

  async function fetchAll() {
    setFetchingAll(true);
    try {
      const res = await api.admin.fetchAllResults();
      setToast(res.fetched > 0 ? `Fetched ${res.fetched} round(s) from OpenF1 ✓` : 'No new results available yet');
      const rows = await api.admin.results();
      setStoredResults(Object.fromEntries(rows.map(r => [r.race_round, r.result])));
    } catch (err) {
      setToast(`Fetch all failed: ${err.message}`);
    } finally {
      setFetchingAll(false);
    }
  }

  const race = races.find(r => r.round === selectedRound);

  return (
    <>
      <Topbar crumbs={['Admin', 'Results']} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>Race Results</h2>
            <div className="muted" style={{ marginTop: 6 }}>Enter or correct official results — triggers automatic scoring</div>
          </div>
          <button className="btn" onClick={fetchAll} disabled={fetchingAll}>
            {fetchingAll ? 'Fetching…' : '⟳ Fetch all from OpenF1'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          {races.filter(r => r.status === 'done' || r.status === 'locked').map(r => (
            <button
              key={r.round}
              className={`btn${selectedRound === r.round ? ' primary' : ''}`}
              onClick={() => setSelectedRound(r.round)}
            >
              {countryFlag(r.countryCode)} R{String(r.round).padStart(2, '0')} · {r.name.split(' ')[0]}
              {storedResults[r.round] && <span className="badge done" style={{ marginLeft: 6, height: 16, padding: '0 5px', fontSize: 9 }}>✓</span>}
            </button>
          ))}
        </div>

        {!selectedRound && (
          <div className="loading">Select a race above to enter results</div>
        )}

        {selectedRound && (
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 18, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="entry-card">
                <h3>Pole Position</h3>
                <DriverDropdown value={pole} onChange={setPole} placeholder="Pole sitter" />
              </div>

              <div className="entry-card">
                <h3>DNF Drivers</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dnfs.map((d, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <DriverDropdown
                        value={d}
                        onChange={val => setDnfs(prev => prev.map((x, j) => j === i ? val : x))}
                        exclude={dnfs.filter((_, j) => j !== i)}
                        placeholder="DNF driver"
                      />
                      {i > 0 && (
                        <button className="btn ghost" style={{ height: 44, padding: '0 10px' }}
                                onClick={() => setDnfs(prev => prev.filter((_, j) => j !== i))}>✕</button>
                      )}
                    </div>
                  ))}
                  <button className="btn ghost" style={{ height: 34 }} onClick={() => setDnfs(prev => [...prev, null])}>
                    + Add DNF
                  </button>
                </div>
              </div>

              {race?.isSprint && (
                <div className="entry-card">
                  <h3>Sprint Winner</h3>
                  <DriverDropdown value={sprintWinner} onChange={setSprintWinner} placeholder="Sprint winner" />
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save & Score →'}</button>
                <button className="btn" onClick={fetchFromOpenF1} disabled={fetching}>{fetching ? 'Fetching…' : '⟳ Fetch from OpenF1'}</button>
                {storedResults[selectedRound] && (
                  <button className="btn ghost" onClick={rescore}>Rescore</button>
                )}
              </div>
            </div>

            <div className="entry-card">
              <h3>Finishing Order · P1 → P10</h3>
              <div className="draglist">
                {finishOrder.map((id, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 3 }}>
                      <div className={`pos-pill${i === 0 ? ' gold' : i < 3 ? ' silver' : ''}`}>P{i + 1}</div>
                      {id ? <DriverChip driverId={id} showName /> : <span className="muted">empty</span>}
                    </div>
                    <DriverDropdown value={id} onChange={d => setPosition(i, d)} exclude={finishOrder} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
