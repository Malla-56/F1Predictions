import { useState, useRef, useLayoutEffect, useId } from 'react';

const MIN_LABEL_STEP = 28;

// Height scales with width (≈0.32·w, clamped 220–380) unless an explicit height is passed.
export default function LineChart({ races, series, height }) {
  const [w, setW] = useState(0);
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const gradId = useId().replace(/:/g, '') + '-redGrad';

  useLayoutEffect(() => {
    if (!ref.current) return;
    setW(ref.current.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const h = height ?? Math.round(Math.min(380, Math.max(220, w * 0.32)));
  const padL = 38, padR = 20, padT = 12, padB = 36;
  const innerW = Math.max(100, w - padL - padR);
  const innerH = h - padT - padB;
  const allVals = series.flatMap(s => s.values);
  const max = Math.max(20, Math.ceil(Math.max(...allVals) / 10) * 10);
  const xStep = races.length > 1 ? innerW / (races.length - 1) : innerW;
  const xy = (i, v) => [padL + i * xStep, padT + innerH - (v / max) * innerH];
  const labelEvery = Math.max(1, Math.ceil(MIN_LABEL_STEP / Math.max(1, xStep)));

  function indexFromClientX(clientX) {
    const svg = ref.current?.querySelector('svg');
    if (!svg || races.length === 0) return null;
    const x = clientX - svg.getBoundingClientRect().left;
    const i = races.length > 1 ? Math.round((x - padL) / xStep) : 0;
    return Math.max(0, Math.min(races.length - 1, i));
  }

  function onPointer(e) {
    setHover(indexFromClientX(e.clientX));
  }

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {w > 0 && (
      <svg
        width={w} height={h}
        style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y' }}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null); }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
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

        {races.map((r, i) => (i % labelEvery === 0 || i === races.length - 1) && (
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
                  fill={`url(#${gradId})`} opacity="0.6"
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

        {hover !== null && races[hover] && (() => {
          const [x] = xy(hover, 0);
          const flipX = x > w - 130;
          return (
            <g transform={`translate(${x}, ${padT})`} pointerEvents="none">
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
      )}
    </div>
  );
}
