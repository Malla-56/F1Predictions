import { useState, useRef, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';
import DriverChip from './DriverChip';

export default function DriverDropdown({ value, onChange, exclude = [], placeholder = 'Select driver' }) {
  const { drivers } = useAppData();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={`dropdown${open ? ' open' : ''}`}>
      <button type="button" className="field" onClick={() => setOpen(!open)}>
        {value ? <DriverChip driverId={value} /> : <span className="empty">{placeholder}</span>}
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="dropdown-menu">
          {drivers.map(d => {
            const disabled = exclude.includes(d.id) && d.id !== value;
            return (
              <div
                key={d.id}
                className={`dropdown-item${disabled ? ' disabled' : ''}${value === d.id ? ' selected' : ''}`}
                onClick={() => { if (!disabled) { onChange(d.id); setOpen(false); } }}
              >
                <span style={{ width: 3, height: 18, background: d.teamColor, borderRadius: 1 }} />
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', width: 28 }}>#{d.num}</span>
                <span style={{ fontWeight: 600 }}>{d.id}</span>
                <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{d.firstName} {d.lastName}</span>
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
                  {d.team?.split(' ').slice(-1)[0]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
