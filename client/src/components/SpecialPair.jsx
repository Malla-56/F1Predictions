import DriverChip from './DriverChip';

export default function SpecialPair({ pole, dnf, comparePole, compareDnf, compact = false }) {
  const poleMatch = comparePole !== null ? pole === comparePole : null;
  // Check if dnf matches - handle both single value and array
  const dnfMatch = compareDnf !== null
    ? Array.isArray(compareDnf)
      ? compareDnf.includes(dnf)
      : dnf === compareDnf
    : null;

  return (
    <div className="special-row" style={compact ? { marginBottom: '4px' } : null}>
      <div className={'special-cell' + (poleMatch === true ? ' match-exact' : poleMatch === false ? ' match-bad' : '')}>
        <span className="lbl">Pole Position</span>
        <div className="body">
          <DriverChip driverId={pole} />
          {poleMatch !== null && <span className="status-icon">{poleMatch ? '✓' : '✗'}</span>}
        </div>
      </div>
      <div className={'special-cell' + (dnfMatch === true ? ' match-exact' : dnfMatch === false ? ' match-bad' : '')}>
        <span className="lbl">DNF Pick</span>
        <div className="body">
          <DriverChip driverId={dnf} />
          {dnfMatch !== null && <span className="status-icon">{dnfMatch ? '✓' : '✗'}</span>}
        </div>
      </div>
    </div>
  );
}
