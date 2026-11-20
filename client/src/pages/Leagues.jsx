import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';

// 6:42 left on an invite code; null once it has expired.
function useCountdown(expiresAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const left = Math.max(0, Math.round((new Date(expiresAt) - now) / 1000));
  if (!left) return null;
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

// Invite codes for a league this user admins. Codes last 15 minutes, so they're
// generated on demand rather than shown permanently.
function InvitePanel({ league, setToast }) {
  const [invite, setInvite] = useState(null);
  const [counts, setCounts] = useState(null);
  const [busy, setBusy] = useState(false);
  const remaining = useCountdown(invite?.expires_at);

  useEffect(() => {
    api.leagues.invite(league.id)
      .then(r => { setInvite(r.invite); setCounts(r); })
      .catch(() => {});
  }, [league.id]);

  async function generate() {
    setBusy(true);
    try {
      const r = await api.leagues.newInvite(league.id);
      setInvite(r.invite);
      setCounts(r);
    } catch (err) {
      setToast(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.code);
      setToast('Invite code copied');
    } catch {
      setToast('Copy failed — select the code instead');
    }
  }

  const full = counts && counts.memberCount >= counts.memberLimit;

  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
        Invite code{counts ? ` · ${counts.memberCount}/${counts.memberLimit} members` : ''}
      </div>
      {invite && remaining ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.2em', userSelect: 'all' }}>
            {invite.code}
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>expires in {remaining}</span>
          <button className="btn" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={copy}>Copy</button>
          <button className="btn ghost" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={generate} disabled={busy || full}>
            New code
          </button>
        </div>
      ) : (
        <button className="btn primary" onClick={generate} disabled={busy || full}>
          {full ? 'League is full' : busy ? 'Generating…' : 'Generate invite code'}
        </button>
      )}
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        Codes work for 15 minutes. New players enter it when they sign up; existing players use “Join a league”.
      </div>
    </div>
  );
}

export default function Leagues({ setToast }) {
  const { user, leagues, activeLeague, switchLeague, joinLeague, createLeague } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  function select(league) {
    switchLeague(league.id);
    setToast(`Switched to ${league.name}`);
    navigate('/home');
  }

  async function join(e) {
    e.preventDefault();
    setJoining(true);
    try {
      const league = await joinLeague(code.trim());
      setCode('');
      setToast(`You've joined ${league.name}`);
      navigate('/home');
    } catch (err) {
      setToast(err.message);
    } finally {
      setJoining(false);
    }
  }

  async function create(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const league = await createLeague(name.trim());
      setName('');
      setToast(`${league.name} created — generate an invite code to add players`);
    } catch (err) {
      setToast(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Topbar crumbs={['Leagues']} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 className="page-title">Your Leagues</h2>
            <div className="page-sub">One set of tips counts in every league you're in</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {leagues.map(l => {
            const selected = l.id === activeLeague?.id;
            return (
              <div key={l.id} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 16, flex: 1 }}>{l.name}</span>
                  {l.role === 'admin' && <span className="badge locked">Admin</span>}
                  {selected
                    ? <span className="badge dot done">Selected</span>
                    : <button className="btn" style={{ height: 30, padding: '0 12px', fontSize: 12 }} onClick={() => select(l)}>Switch</button>}
                </div>
                {l.role === 'admin' && <InvitePanel league={l} setToast={setToast} />}
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: '14px 16px', marginTop: 20 }}>
          <form onSubmit={join}>
            <div className="fld">
              <label htmlFor="join-code">Join a league</label>
              <input
                id="join-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="Invite code from a league admin" autoCapitalize="characters"
                autoComplete="off" spellCheck={false} maxLength={8} required
                style={{ fontFamily: 'var(--mono)', letterSpacing: '0.15em' }}
              />
            </div>
            <button type="submit" className="btn primary" disabled={joining || !code.trim()}>
              {joining ? 'Joining…' : 'Join league'}
            </button>
          </form>
        </div>

        {user?.canCreateLeague && (
          <div className="card" style={{ padding: '14px 16px', marginTop: 12 }}>
            <form onSubmit={create}>
              <div className="fld">
                <label htmlFor="league-name">Start a new league</label>
                <input
                  id="league-name" value={name} onChange={e => setName(e.target.value)}
                  placeholder="League name" maxLength={40} required
                />
              </div>
              <button type="submit" className="btn" disabled={creating || name.trim().length < 2}>
                {creating ? 'Creating…' : 'Create league'}
              </button>
            </form>
            <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              You'll be its admin. Leagues have their own leaderboard, scoring and joker round.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
