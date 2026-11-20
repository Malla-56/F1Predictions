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
  const { user, logout } = useAuth();

  return (
    <>
      <header className="mobile-topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-text">
            <div className="row1">PULSE</div>
            <div className="row2">Pitlane Picks</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {user?.role === 'admin' && (
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
