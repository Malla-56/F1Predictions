import { useAppData } from '../context/AppDataContext';
import Icon from './Icon';
import useDialog from './useDialog';

// Full-screen-friendly driver grid. On phones it slides up as a bottom sheet;
// on desktop it shows as a centred panel. Teams are ordered by the current
// constructors' championship so the front-runners are at the top.
export default function DriverPicker({
  title, subtitle, value, taken = {}, onPick, onClear, onClose, onPrev, onNext,
}) {
  const { driversByStanding: ordered } = useAppData();
  const dlg = useDialog(onClose);

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} {...dlg.props}>
        <div className="sheet-hd">
          <button className="sheet-nav" onClick={onPrev} disabled={!onPrev} aria-label="Previous pick">‹</button>
          <div className="sheet-title">
            <strong id={dlg.titleId}>{title}</strong>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <button className="sheet-nav" onClick={onNext} disabled={!onNext} aria-label="Next pick">›</button>
        </div>

        <div className="pick-grid">
          {ordered.map(d => {
            const badge = taken[d.id];
            return (
              <button
                key={d.id}
                type="button"
                className={`pick-tile${value === d.id ? ' selected' : ''}${badge ? ' taken' : ''}`}
                style={{ '--team-color': d.teamColor }}
                onClick={() => onPick(d.id)}
              >
                <span className="abbr">{d.id}</span>
                <span className="lname">{d.lastName}</span>
                {badge && <span className="badge-pos">{badge}</span>}
              </button>
            );
          })}
        </div>

        <div className="sheet-ft">
          <button className="btn ghost" onClick={onClear} disabled={!value}>Clear</button>
          <button className="btn primary" onClick={onClose}>
            <Icon name="results" size={16} /> Done
          </button>
        </div>
      </div>
    </div>
  );
}
