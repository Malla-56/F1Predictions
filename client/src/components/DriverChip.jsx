import { useAppData } from '../context/AppDataContext';

export default function DriverChip({ driverId, showName = true }) {
  const { driverById } = useAppData();
  if (!driverId) return <span className="muted mono" style={{ fontSize: 11 }}>—</span>;
  const d = driverById(driverId);
  if (!d) return <span className="mono" style={{ fontSize: 11 }}>{driverId}</span>;

  return (
    <span className="driver-chip" style={{ '--team-color': d.teamColor }}>
      <span className="team-bar" style={{ background: d.teamColor }} />
      <span className="num">#{d.num}</span>
      <span className="abbr">{d.id}</span>
      {showName && <span className="lname">{d.lastName}</span>}
    </span>
  );
}
