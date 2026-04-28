import { useState, useEffect } from 'react';

function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, new Date(target).getTime() - now);
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { d, h, m, s, expired: ms === 0 };
}

const pad = n => String(n).padStart(2, '0');

export default function Countdown({ target }) {
  const c = useCountdown(target);
  return (
    <div>
      <div className="countdown-label">{c.expired ? 'Tips locked' : 'Tip lock in'}</div>
      <div className="countdown">
        <div className="seg"><div className="num">{pad(c.d)}</div><div className="lbl">Days</div></div>
        <div className="seg"><div className="num">{pad(c.h)}</div><div className="lbl">Hrs</div></div>
        <div className="seg"><div className="num">{pad(c.m)}</div><div className="lbl">Min</div></div>
        <div className="seg"><div className="num">{pad(c.s)}</div><div className="lbl">Sec</div></div>
      </div>
    </div>
  );
}
