import { useNavigate, useLocation } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';

const MOBILE_NAV = [
  { path: '/home',       label: 'Home',       icon: 'home'  },
  { path: '/tips',       label: 'Tips',       icon: 'tips'  },
  { path: '/scoreboard', label: 'Scoreboard', icon: 'score' },
  { path: '/results',    label: 'Results',    icon: 'flag'  },
  { path: '/stats',      label: 'Stats',      icon: 'stats' },
];

export default function MobileNav({ setToast }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout, activeLeague, isLeagueAdmin, isSiteManager } = useAuth();

  return (
    <>
      <header className="mobile-topbar">
        {/* The league name doubles as the way into the Leagues page (switch, join, invite). */}
        <button className={`brand mobile-league${pathname === '/leagues' ? ' active' : ''}`}
          onClick={() => navigate('/leagues')} aria-label={`League: ${activeLeague?.name}. Change league`}>
          <div className="brand-mark" />
          <div className="brand-text">
            <div className="row1">PULSE</div>
            <div className="row2">{activeLeague?.name} ▾</div>
          </div>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(isLeagueAdmin || isSiteManager) && (
            <button className={`mobile-logout${pathname.startsWith('/admin') ? ' active' : ''}`}
              onClick={() => navigate('/admin')} aria-label="Admin" title="Admin">
              <Icon name="admin" size={18} />
            </button>
          )}
          <button className="mobile-logout" onClick={logout} aria-label="Sign out">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </header>

      <nav className="mobile-tabbar">
        {MOBILE_NAV.map(it => (
          <button
            key={it.path}
            className={`mobile-tab${pathname === it.path || pathname.startsWith(it.path) ? ' active' : ''}`}
            onClick={() => navigate(it.path)}
          >
            <Icon name={it.icon} size={20} />
            <span>{it.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
