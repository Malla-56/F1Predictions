import { useAuth } from '../context/AuthContext';

// The selected league's name always leads the breadcrumbs.
export default function Topbar({ crumbs: pageCrumbs = [], right }) {
  const { activeLeague } = useAuth();
  const crumbs = activeLeague ? [activeLeague.name, ...pageCrumbs] : pageCrumbs;
  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === crumbs.length - 1 ? 'now' : ''}>{c}</span>
          </span>
        ))}
      </div>
      <div className="topbar-right">{right}</div>
    </div>
  );
}
