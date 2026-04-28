import { useState, useEffect } from 'react';
import { api } from '../../api';
import Topbar from '../../components/Topbar';
import Avatar from '../../components/Avatar';

export default function AdminUsers({ setToast }) {
  const [users, setUsers] = useState([]);

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
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => toggleAdmin(u)}>
                        {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                      </button>
                      {u.is_active
                        ? <button className="btn danger" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => kick(u)}>Kick</button>
                        : <button className="btn" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => reactivate(u)}>Restore</button>
                      }
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
