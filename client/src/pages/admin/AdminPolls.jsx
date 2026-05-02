import { useState, useEffect } from 'react';
import { api } from '../../api';
import Topbar from '../../components/Topbar';

export default function AdminPolls({ setToast }) {
  const [polls, setPolls] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState([{ id: 1, label: '' }, { id: 2, label: '' }]);
  const [makeActive, setMakeActive] = useState(false);
  const [creating, setCreating] = useState(false);

  function load() {
    api.polls.list().then(setPolls).catch(() => {});
  }

  useEffect(load, []);

  const activePoll = polls.find(p => p.is_active);
  const history = polls.filter(p => !p.is_active);

  function totalVotes(poll) {
    return (poll.results || []).reduce((s, r) => s + r.votes, 0);
  }

  function getVotes(poll, optId) {
    return (poll.results || []).find(r => r.option_id === optId)?.votes ?? 0;
  }

  function winner(poll) {
    if (!poll.results || poll.results.length === 0) return '—';
    const top = poll.results.reduce((a, b) => a.votes >= b.votes ? a : b);
    if (top.votes === 0) return '—';
    const opt = poll.options.find(o => o.id === top.option_id);
    return opt ? opt.label : '—';
  }

  function addOption() {
    if (options.length >= 8) return;
    const maxId = Math.max(...options.map(o => o.id));
    setOptions([...options, { id: maxId + 1, label: '' }]);
  }

  function removeOption(id) {
    if (options.length <= 2) return;
    setOptions(options.filter(o => o.id !== id));
  }

  function setOptionLabel(id, label) {
    setOptions(options.map(o => o.id === id ? { ...o, label } : o));
  }

  async function create(e) {
    e.preventDefault();
    const opts = options.filter(o => o.label.trim());
    if (!question.trim()) return setToast('Question is required');
    if (opts.length < 2) return setToast('At least 2 options required');

    if (makeActive && activePoll) {
      if (!window.confirm(`This will close "${activePoll.question}". Continue?`)) return;
    }

    setCreating(true);
    try {
      await api.polls.create({ question: question.trim(), options: opts, is_active: makeActive, force: true });
      setToast('Poll created');
      setQuestion('');
      setOptions([{ id: 1, label: '' }, { id: 2, label: '' }]);
      setMakeActive(false);
      load();
    } catch (err) {
      setToast(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function closePoll(poll) {
    await api.polls.update(poll.id, { is_active: false });
    setToast('Poll closed');
    load();
  }

  async function reopen(poll) {
    if (activePoll) {
      if (!window.confirm(`Close "${activePoll.question}" and reopen this poll?`)) return;
    }
    try {
      await api.polls.update(poll.id, { is_active: true, force: true });
      setToast('Poll reopened');
      load();
    } catch (err) {
      setToast(err.message);
    }
  }

  async function deletePoll(poll) {
    if (!window.confirm('Delete this poll? This cannot be undone.')) return;
    try {
      await api.polls.remove(poll.id);
      setToast('Poll deleted');
      load();
    } catch (err) {
      setToast(err.message);
    }
  }

  return (
    <>
      <Topbar crumbs={['Admin', 'Polls']} />
      <div className="content">

        {/* Header */}
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>Polls</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              {activePoll ? '1 active' : 'No active poll'} · {polls.length} total
            </div>
          </div>
        </div>

        {/* Create form */}
        <div className="card" style={{ padding: '22px 24px', marginBottom: 28 }}>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 16 }}>CREATE POLL</div>
          <form onSubmit={create}>
            <div className="fld">
              <label>Question</label>
              <input
                type="text"
                placeholder="Ask the community something…"
                value={question}
                onChange={e => setQuestion(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {options.map((opt, i) => (
                <div key={opt.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div className="fld" style={{ flex: 1, marginBottom: 0 }}>
                    <input
                      type="text"
                      placeholder={`Option ${i + 1}`}
                      value={opt.label}
                      onChange={e => setOptionLabel(opt.id, e.target.value)}
                    />
                  </div>
                  {options.length > 2 && (
                    <button
                      type="button"
                      className="btn danger"
                      style={{ height: 36, padding: '0 12px', flexShrink: 0 }}
                      onClick={() => removeOption(opt.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {options.length < 8 && (
                  <button type="button" className="btn" style={{ fontSize: 12 }} onClick={addOption}>
                    + Add option
                  </button>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={makeActive}
                    onChange={e => setMakeActive(e.target.checked)}
                    style={{ width: 14, height: 14 }}
                  />
                  Set as active immediately
                </label>
              </div>
              <button type="submit" className="btn primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create Poll'}
              </button>
            </div>
          </form>
        </div>

        {/* Active poll */}
        {activePoll && (
          <>
            <div className="sec-head">
              <h2>Active Poll</h2>
            </div>
            <div className="card" style={{ padding: '22px 24px', marginBottom: 28, borderColor: 'var(--red)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 16, marginBottom: 6 }}>
                    {activePoll.question}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {totalVotes(activePoll)} {totalVotes(activePoll) === 1 ? 'vote' : 'votes'} · opened {new Date(activePoll.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <button className="btn danger" style={{ flexShrink: 0 }} onClick={() => closePoll(activePoll)}>
                  Close Poll
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {activePoll.options.map(opt => {
                  const votes = getVotes(activePoll, opt.id);
                  const total = totalVotes(activePoll);
                  const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
                  return (
                    <div key={opt.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13 }}>{opt.label}</span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{votes} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: 'var(--red)',
                          borderRadius: 3,
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* History */}
        {history.length > 0 && (
          <>
            <div className="sec-head">
              <h2>Poll History</h2>
            </div>
            <div className="score-table">
              <table className="admin-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Options</th>
                    <th>Votes</th>
                    <th>Winner</th>
                    <th>Created</th>
                    <th>Closed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(p => (
                    <>
                      <tr
                        key={p.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                      >
                        <td style={{ fontWeight: 500, maxWidth: 260 }}>{p.question}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{p.options.length}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{totalVotes(p)}</td>
                        <td style={{ fontSize: 13 }}>{winner(p)}</td>
                        <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {new Date(p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {p.closed_at ? new Date(p.closed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                            <button
                              className="btn"
                              style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                              onClick={() => reopen(p)}
                            >
                              Reopen
                            </button>
                            <button
                              className="btn danger"
                              style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                              disabled={totalVotes(p) > 0}
                              title={totalVotes(p) > 0 ? 'Cannot delete a poll with votes' : 'Delete poll'}
                              onClick={() => deletePoll(p)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded === p.id && (
                        <tr key={`${p.id}-exp`}>
                          <td colSpan={7} style={{ padding: '16px 22px', background: 'var(--surface-2)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
                              {p.options.map(opt => {
                                const votes = getVotes(p, opt.id);
                                const total = totalVotes(p);
                                const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
                                return (
                                  <div key={opt.id}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                      <span style={{ fontSize: 12 }}>{opt.label}</span>
                                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{votes} ({pct}%)</span>
                                    </div>
                                    <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                                      <div style={{
                                        height: '100%',
                                        width: `${pct}%`,
                                        background: 'var(--red)',
                                        borderRadius: 2,
                                      }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {polls.length === 0 && (
          <div className="mono" style={{ color: 'var(--text-3)', fontSize: 11, padding: '32px 0' }}>
            No polls yet. Create one above.
          </div>
        )}

      </div>
    </>
  );
}
