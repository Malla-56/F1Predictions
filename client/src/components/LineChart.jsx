import { useState, useRef, useEffect } from 'react';

export default function LineChart({ races, series, height = 280 }) {
  const [w, setW] = useState(640);
  const ref = useRef(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padL = 38, padR = 20, padT = 12, padB = 36;
  const innerW = Math.max(100, w - padL - padR);
  const innerH = height - padT - padB;
  const allVals = series.flatMap(s => s.values);
  const max = Math.max(20, Math.ceil(Math.max(...allVals) / 10) * 10);
  const xStep = races.length > 1 ? innerW / (races.length - 1) : innerW;
  const xy = (i, v) => [padL + i * xStep, padT + innerH - (v / max) * innerH];

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={w} height={height} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--red)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--red)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <g key={i}>
            <line x1={padL} y1={padT + innerH * p} x2={padL + innerW} y2={padT + innerH * p}
                  stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 8} y={padT + innerH * p + 4}
                  fontFamily="var(--mono)" fontSize="10" fill="var(--text-3)" textAnchor="end">
              {Math.round(max * (1 - p))}
            </text>
          </g>
        ))}

        {races.map((r, i) => (
          <text key={r.round} x={padL + i * xStep} y={padT + innerH + 18}
                fontFamily="var(--mono)" fontSize="10" fill="var(--text-3)" textAnchor="middle">
            R{String(r.round).padStart(2, '0')}
          </text>
        ))}

        {series.map((s, si) => {
          const path = s.values.map((v, i) => {
            const [x, y] = xy(i, v);
            return (i === 0 ? 'M' : 'L') + x + ',' + y;
          }).join(' ');
          return (
            <g key={si}>
              {si === 0 && (
                <path
                  d={path + ` L ${xy(s.values.length - 1, 0)[0]},${padT + innerH} L ${padL},${padT + innerH} Z`}
                  fill="url(#redGrad)" opacity="0.6"
                />
              )}
              <path d={path} fill="none" stroke={s.color} strokeWidth="2"
                    strokeDasharray={s.dotted ? '4 4' : '0'} strokeLinecap="round" strokeLinejoin="round" />
              {s.values.map((v, i) => {
                const [x, y] = xy(i, v);
                return (
                  <circle key={i} cx={x} cy={y} r={hover === i && si === 0 ? 5 : 3}
                          fill={si === 0 ? s.color : 'var(--bg)'}
                          stroke={s.color} strokeWidth="1.5" />
                );
              })}
            </g>
          );
        })}

        {races.map((r, i) => (
          <rect key={r.round}
                x={padL + (i - 0.5) * xStep} y={padT}
                width={xStep} height={innerH} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}

        {hover !== null && (() => {
          const [x] = xy(hover, 0);
          const flipX = x > w - 130;
          return (
            <g transform={`translate(${x}, ${padT})`}>
              <line x1="0" y1="0" x2="0" y2={innerH} stroke="var(--red)" strokeDasharray="2 3" />
              <g transform={`translate(${flipX ? -110 : 8}, 0)`}>
                <rect width="104" height={series.length * 16 + 18} rx="2"
                      fill="var(--surface-2)" stroke="var(--line-2)" />
                <text x="8" y="14" fontFamily="var(--mono)" fontSize="9" fill="var(--text-3)" letterSpacing="0.1em">
                  R{String(races[hover].round).padStart(2, '0')}
                </text>
                {series.map((s, si) => (
                  <text key={si} x="8" y={14 + (si + 1) * 16}
                        fontFamily="var(--mono)" fontSize="10" fill={s.color}>
                    {s.name}: {s.values[hover]} pts
                  </text>
                ))}
              </g>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
