import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../../components/Topbar';
import Avatar from '../../components/Avatar';
import Modal from '../../components/Modal';

// "3h ago" for recent activity, a date after a week; the exact time is in the tooltip.
function TimeAgo({ iso }) {
  if (!iso) return <span style={{ color: 'var(--text-3)' }}>Never</span>;
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d) / 60000);
  const label =
    mins < 2 ? 'Just now' :
    mins < 60 ? `${mins}m ago` :
    mins < 24 * 60 ? `${Math.round(mins / 60)}h ago` :
    mins < 7 * 24 * 60 ? `${Math.round(mins / (24 * 60))}d ago` :
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return <span title={d.toLocaleString('en-GB')}>{label}</span>;
}

export default function AdminUsers({ setToast }) {
  const { user: me, activeLeague } = useAuth();
  const [users, setUsers] = useState([]);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  function load() {
    api.admin.users().then(setUsers).catch(err => setToast(`Error loading users: ${err.message}`));
  }

  useEffect(load, []);

  async function update(user, data, message) {
    try {
      await api.admin.updateUser(user.id, data);
      setToast(message);
      load();
    } catch (err) {
      setToast(`Error: ${err.message}`);
    }
  }

  // Removing only affects this league; their account and other leagues are untouched.
  function kick(user) {
    if (!window.confirm(`Remove ${user.display_name} from ${activeLeague?.name}? Their scores stay but they'll no longer see or appear in this league.`)) return;
    update(user, { is_active: 0 }, `${user.display_name} removed from the league`);
  }

  function reactivate(user) {
    update(user, { is_active: 1 }, `${user.display_name} restored`);
  }

  function toggleAdmin(user) {
    const newRole = user.role === 'admin' ? 'member' : 'admin';
    update(user, { role: newRole }, `${user.display_name} is now a league ${newRole}`);
  }

  function openReset(user) {
    setResetTarget(user);
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
  }

  function closeReset() {
    setResetTarget(null);
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
  }

  async function submitReset(e) {
    e.preventDefault();
    setResetError('');
    if (newPassword.length < 8) {
      setResetError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }
    setResetting(true);
    try {
      await api.admin.updateUser(resetTarget.id, { password: newPassword });
      setToast(`Password reset for ${resetTarget.display_name}`);
      closeReset();
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <Topbar crumbs={['Admin', 'Users']} />
      <div className="content">
        <div className="sec-head" style={{ marginTop: 0 }}>
          <div>
            <h2 className="page-title">Members</h2>
            <div className="page-sub">
              {users.filter(u => u.is_active).length} in {activeLeague?.name} · {users.filter(u => !u.is_active).length} removed
              · add players with an invite code from the Leagues page
            </div>
          </div>
        </div>

        <div className="score-table">
          <table className="admin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>User</th>
                <th>Username</th>
                <th>Role</th>
                <th>Predictions</th>
                <th>Joined League</th>
                <th title="Last password or Face ID sign-in">Last Login</th>
                <th title="Last time they used the app (sessions stay signed in for 30 days)">Last Active</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.45 }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar displayName={u.display_name} size={30} />
                      <span style={{ fontFamily: 'var(--display)', fontWeight: 600 }}>{u.display_name}</span>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{u.username}</td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'locked' : ''}`}>{u.role}</span>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{u.prediction_count}</td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}><TimeAgo iso={u.last_login_at} /></td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}><TimeAgo iso={u.last_seen_at} /></td>
                  <td>
                    <span className={`badge dot ${u.is_active ? 'done' : 'pending'}`}>{u.is_active ? 'Active' : 'Removed'}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => toggleAdmin(u)}>
                        {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                      </button>
                      {u.is_active
                        ? <button className="btn danger" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => kick(u)}>Remove</button>
                        : <button className="btn" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => reactivate(u)}>Restore</button>
                      }
                      <button
                        className="btn"
                        style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                        disabled={u.id === me?.id || !u.can_manage}
                        title={u.id === me?.id ? 'Cannot reset your own password here'
                          : !u.can_manage ? "They're also in a league you don't run — ask the site manager"
                          : 'Reset password'}
                        onClick={() => openReset(u)}
                      >
                        Reset PW
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {resetTarget && (
        <Modal onClose={closeReset} labelledBy="reset-pw-title" style={{ maxWidth: 400 }}>
            <h3 id="reset-pw-title">Reset Password</h3>
            <p>Set a new password for <strong>{resetTarget.display_name}</strong>.</p>
            <form onSubmit={submitReset}>
              <div className="fld">
                <label htmlFor="reset-new-pw">New Password</label>
                <input
                  id="reset-new-pw"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoFocus
                />
              </div>
              <div className="fld">
                <label htmlFor="reset-confirm-pw">Confirm Password</label>
                <input
                  id="reset-confirm-pw"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                />
              </div>
              {resetError && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--red)', marginBottom: 14 }}>
                  {resetError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={closeReset}>Cancel</button>
                <button type="submit" className="btn primary" disabled={resetting}>
                  {resetting ? 'Saving…' : 'Reset Password'}
                </button>
              </div>
            </form>
        </Modal>
      )}
    </>
  );
}
