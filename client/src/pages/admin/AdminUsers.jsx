import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../../components/Topbar';
import Avatar from '../../components/Avatar';

export default function AdminUsers({ setToast }) {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  function load() {
    api.admin.users().then(setUsers).catch(() => {});
  }

  useEffect(load, []);

  async function kick(user) {
    if (!window.confirm(`Kick ${user.display_name}? They will no longer be able to log in.`)) return;
    await api.admin.updateUser(user.id, { is_active: 0 });
    setToast(`${user.display_name} deactivated`);
    load();
  }

  async function reactivate(user) {
    await api.admin.updateUser(user.id, { is_active: 1 });
    setToast(`${user.display_name} reactivated`);
    load();
  }

  async function toggleAdmin(user) {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    await api.admin.updateUser(user.id, { role: newRole });
    setToast(`${user.display_name} is now ${newRole}`);
    load();
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
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>Users</h2>
            <div className="muted" style={{ marginTop: 6 }}>{users.filter(u => u.is_active).length} active · {users.length} total</div>
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
                <th>Joined</th>
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
                  <td>
                    <span className={`badge dot ${u.is_active ? 'done' : 'pending'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => toggleAdmin(u)}>
                        {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                      </button>
                      {u.is_active
                        ? <button className="btn danger" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => kick(u)}>Kick</button>
                        : <button className="btn" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => reactivate(u)}>Restore</button>
                      }
                      <button
                        className="btn"
                        style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                        disabled={u.id === me?.id}
                        title={u.id === me?.id ? 'Cannot reset your own password here' : 'Reset password'}
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
        <div className="modal-bg" onClick={closeReset}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3>Reset Password</h3>
            <p>Set a new password for <strong>{resetTarget.display_name}</strong>.</p>
            <form onSubmit={submitReset}>
              <div className="fld">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoFocus
                />
              </div>
              <div className="fld">
                <label>Confirm Password</label>
                <input
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
          </div>
        </div>
      )}
    </>
  );
}
