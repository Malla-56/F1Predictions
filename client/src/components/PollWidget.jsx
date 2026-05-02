import { useState, useEffect } from 'react';
import { api } from '../api';

export default function PollWidget() {
  const [data, setData] = useState(null);
  const [voting, setVoting] = useState(false);

  function load() {
    api.polls.active()
      .then(setData)
      .catch(() => setData({ poll: null }));
  }

  useEffect(load, []);

  async function vote(optionId) {
    if (voting || !data?.poll) return;
    setVoting(true);
    const prev = data;
    // Optimistic update
    setData(d => {
      const results = (d.results || []).map(r => ({ ...r }));
      const old = results.find(r => r.option_id === d.user_vote);
      if (old) old.votes = Math.max(0, old.votes - 1);
      const target = results.find(r => r.option_id === optionId);
      if (target) target.votes += 1;
      else results.push({ option_id: optionId, votes: 1 });
      return { ...d, results, user_vote: optionId };
    });
    try {
      const res = await api.polls.vote(data.poll.id, optionId);
      setData(d => ({ ...d, results: res.results, user_vote: res.user_vote }));
    } catch {
      setData(prev);
    } finally {
      setVoting(false);
    }
  }

  if (!data || !data.poll) return null;

  const { poll, results, user_vote } = data;
  const totalVotes = (results || []).reduce((s, r) => s + r.votes, 0);
  const hasVoted = user_vote !== null && user_vote !== undefined;

  function getVotes(optId) {
    return (results || []).find(r => r.option_id === optId)?.votes ?? 0;
  }

  return (
    <div className="card" style={{ padding: '20px 22px', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.1em' }}>COMMUNITY POLL</div>
        <span className="badge">{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span>
      </div>

      <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 15, marginBottom: 16 }}>
        {poll.question}
      </div>

      {!hasVoted ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {poll.options.map(opt => (
            <button
              key={opt.id}
              className="btn"
              style={{ textAlign: 'left', padding: '10px 14px', height: 'auto', justifyContent: 'flex-start', width: '100%' }}
              onClick={() => vote(opt.id)}
              disabled={voting}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {poll.options.map(opt => {
            const votes = getVotes(opt.id);
            const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            const isChosen = opt.id === user_vote;
            return (
              <div key={opt.id} style={{ cursor: voting ? 'default' : 'pointer' }} onClick={() => !voting && vote(opt.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: isChosen ? 600 : 400, color: isChosen ? 'var(--red)' : 'var(--text-1)' }}>
                    {isChosen ? '✓ ' : ''}{opt.label}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{pct}%</span>
                </div>
                <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: isChosen ? 'var(--red)' : 'var(--text-3)',
                    borderRadius: 2,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            );
          })}
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
            Tap any option to change your vote
          </div>
        </div>
      )}
    </div>
  );
}
