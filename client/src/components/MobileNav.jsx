import { useNavigate, useLocation } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';

const MOBILE_NAV = [
  { path: '/tips',       label: 'Tips',       icon: 'tips'  },
  { path: '/scoreboard', label: 'Standings',  icon: 'score' },
  { path: '/results',    label: 'Results',    icon: 'flag'  },
  { path: '/stats',      label: 'Stats',      icon: 'stats' },
];

export default function MobileNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout } = useAuth();

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
        <button className="mobile-logout" onClick={logout} aria-label="Sign out">
          <Icon name="logout" size={18} />
        </button>
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
