import { useNavigate, useLocation } from 'react-router-dom';
import Icon from './Icon';
import Avatar from './Avatar';
import { useAuth } from '../context/AuthContext';

const USER_NAV = [
  { path: '/home',        label: 'Home',        icon: 'home',  badge: null },
  { path: '/tips',        label: 'My Tips',     icon: 'tips',  badge: null },
  { path: '/scoreboard',  label: 'Scoreboard',  icon: 'score', badge: null },
  { path: '/stats',       label: 'Stats',       icon: 'stats', badge: null },
];

const ADMIN_NAV = [
  { path: '/admin',         label: 'Overview',  icon: 'admin'   },
  { path: '/admin/users',   label: 'Users',     icon: 'users'   },
  { path: '/admin/scoring', label: 'Scoring',   icon: 'scoring' },
  { path: '/admin/races',   label: 'Races',     icon: 'races'   },
  { path: '/admin/results', label: 'Results',   icon: 'results' },
  { path: '/admin/import',  label: 'Import',    icon: 'import'  },
  { path: '/admin/data',    label: 'Data',      icon: 'data'    },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isAdmin = pathname.startsWith('/admin');
  const nav = isAdmin ? ADMIN_NAV : USER_NAV;
  console.log("🚀 ~ Sidebar ~ nav:", nav)

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" />
        <div className="brand-text">
          <div className="row1">PULSE</div>
          <div className="row2">Pitlane Picks</div>
        </div>
      </div>

      {/* Scrollable nav area — footer stays pinned below */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="nav-section">{isAdmin ? 'Admin' : 'League'}</div>
        {nav.map(it => (
          <div
            key={it.path}
            className={`nav-item${pathname === it.path || (it.path !== '/admin' && pathname.startsWith(it.path)) ? ' active' : ''}`}
            onClick={() => navigate(it.path)}
          >
            <span className="icon"><Icon name={it.icon} /></span>
            <span>{it.label}</span>
            {it.badge && <span className="badge">{it.badge}</span>}
          </div>
        ))}

        <div className="nav-section">Account</div>
        {isAdmin ? (
          <div className="nav-item" onClick={() => navigate('/home')}>
            <span className="icon"><Icon name="home" /></span>
            <span>Back to League</span>
          </div>
        ) : user?.role === 'admin' && (
          <div className="nav-item" onClick={() => navigate('/admin')}>
            <span className="icon"><Icon name="admin" /></span>
            <span>Admin Panel</span>
          </div>
        )}
        <div className="nav-item" onClick={logout}>
          <span className="icon"><Icon name="logout" /></span>
          <span>Sign out</span>
        </div>
      </div>

      <div className="sidebar-foot">
        <Avatar displayName={user?.display_name} size={32} isMe />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.display_name}
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
            {user?.role === 'admin' ? 'Admin' : 'Tipper'}
          </div>
        </div>
      </div>
    </aside>
  );
}
