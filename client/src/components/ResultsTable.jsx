import DriverChip from './DriverChip';

function distanceClass(d) {
  if (d === 0) return 'match-0';
  if (d === 1) return 'match-1';
  if (d === 2) return 'match-2';
  return 'match-bad';
}

function statusIcon(d) {
  if (d === 0) return '✓';
  if (d === 1 || d === 2) return '±';
  return '✗';
}

function pointsForDistance(d) {
  if (d === 0) return 3;
  if (d === 1) return 1;
  return 0;
}

export default function ResultsTable({ rows, actual = false, compact = false }) {
  return (
    <div className="rtable">
      <div className="rtable-hd">
        <span>Pos</span>
        <span>Driver</span>
        <span style={{ textAlign: 'right' }}>{actual ? 'Team' : 'Match'}</span>
        {!actual && <span style={{ textAlign: 'right', minWidth: '48px' }}>Points</span>}
      </div>
      {rows.map(r => {
        const cls = actual ? '' : r.distance === 99 ? 'match-bad' : distanceClass(r.distance);
        const pts = r.distance === 99 ? 0 : pointsForDistance(r.distance);
        return (
          <div key={r.pos} className={'rrow ' + cls}>
            <span className={'pos' + (r.pos === 0 ? ' gold' : '')}>P{r.pos + 1}</span>
            <DriverChip driverId={r.driverId} />
            {actual ? (
              <span className="status mono" style={{ color: 'var(--text-3)' }}>
                {/* Team short code will be displayed from driver data */}
              </span>
            ) : (
              <span className="status">
                <span className="ico">{statusIcon(r.distance === 99 ? 99 : r.distance)}</span>
                {r.distance === 0 ? 'EXACT' : r.distance === 99 ? 'MISS' : '±' + r.distance}
              </span>
            )}
            {!actual && <span style={{ textAlign: 'right', fontSize: '12px', fontWeight: 500, color: 'var(--text-2)' }}>+{pts}</span>}
          </div>
        );
      })}
    </div>
  );
}
