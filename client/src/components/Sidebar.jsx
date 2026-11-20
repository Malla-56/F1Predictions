import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import Avatar from './Avatar';
import { useAuth } from '../context/AuthContext';

const USER_NAV = [
  { path: '/home',        label: 'Home',        icon: 'home',  badge: null },
  { path: '/tips',        label: 'My Tips',     icon: 'tips',  badge: null },
  { path: '/results',     label: 'Results',     icon: 'flag',  badge: null },
  { path: '/scoreboard',  label: 'Scoreboard',  icon: 'score', badge: null },
  { path: '/stats',       label: 'Stats',       icon: 'stats', badge: null },
];

const ADMIN_NAV = [
  { path: '/admin',         label: 'Overview',  icon: 'admin'   },
  { path: '/admin/users',   label: 'Users',     icon: 'users'   },
  { path: '/admin/scoring', label: 'Scoring',   icon: 'scoring' },
  { path: '/admin/races',   label: 'Races',     icon: 'races'   },
  // Shared by every league, so only the site manager sees these.
  { path: '/admin/results', label: 'Results',   icon: 'results', siteOnly: true },
  { path: '/admin/import',  label: 'Import',    icon: 'import',  siteOnly: true },
  { path: '/admin/data',    label: 'Data',      icon: 'data'    },
  { path: '/admin/polls',   label: 'Polls',     icon: 'admin'   },
];

export default function Sidebar() {
  const { user, logout, leagues, activeLeague, switchLeague, isLeagueAdmin, isSiteManager } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isAdmin = pathname.startsWith('/admin');
  const nav = isAdmin ? ADMIN_NAV.filter(it => !it.siteOnly || isSiteManager) : USER_NAV;

  function changeLeague(id) {
    switchLeague(Number(id));
    // You may not be an admin of the other league, so leave the admin pages.
    if (isAdmin) navigate('/home');
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" />
        <div className="brand-text">
          <div className="row1">PULSE</div>
          <div className="row2">Pitlane Picks</div>
        </div>
      </div>

      {leagues.length > 1 ? (
        <select
          className="league-switch"
          aria-label="League"
          value={activeLeague?.id}
          onChange={e => changeLeague(e.target.value)}
        >
          {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      ) : (
        <div className="league-switch league-switch-single">{activeLeague?.name}</div>
      )}

      {/* Scrollable nav area — footer stays pinned below */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="nav-section">{isAdmin ? 'Admin' : 'League'}</div>
        {nav.map(it => {
          const active = pathname === it.path || (it.path !== '/admin' && pathname.startsWith(it.path));
          return (
            <Link
              key={it.path}
              to={it.path}
              className={`nav-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={it.label}
            >
              <span className="icon"><Icon name={it.icon} /></span>
              <span className="nav-label">{it.label}</span>
              {it.badge && <span className="badge">{it.badge}</span>}
            </Link>
          );
        })}

        <div className="nav-section">Account</div>
        <Link to="/leagues" className={`nav-item${pathname === '/leagues' ? ' active' : ''}`} title="Leagues">
          <span className="icon"><Icon name="users" /></span>
          <span className="nav-label">Leagues</span>
        </Link>
        {isAdmin ? (
          <Link to="/home" className="nav-item" title="Back to League">
            <span className="icon"><Icon name="home" /></span>
            <span className="nav-label">Back to League</span>
          </Link>
        ) : (isLeagueAdmin || isSiteManager) && (
          <Link to="/admin" className="nav-item" title="Admin Panel">
            <span className="icon"><Icon name="admin" /></span>
            <span className="nav-label">Admin Panel</span>
          </Link>
        )}
        <button type="button" className="nav-item" onClick={logout} title="Sign out">
          <span className="icon"><Icon name="logout" /></span>
          <span className="nav-label">Sign out</span>
        </button>
      </div>

      <div className="sidebar-foot">
        <Avatar displayName={user?.display_name} size={32} isMe />
        <div className="sidebar-foot-txt" style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.display_name}
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
            {isSiteManager ? 'Site manager' : isLeagueAdmin ? 'League admin' : 'Tipper'}
          </div>
        </div>
      </div>
    </aside>
  );
}
