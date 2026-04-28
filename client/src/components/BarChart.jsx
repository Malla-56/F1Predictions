import { useState, useRef, useEffect } from 'react';

export default function BarChart({ races, series, height = 200 }) {
  const [w, setW] = useState(540);
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padL = 30, padR = 12, padT = 12, padB = 32;
  const innerW = Math.max(100, w - padL - padR);
  const innerH = height - padT - padB;
  const max = Math.max(20, Math.ceil(Math.max(...series.flatMap(s => s.values)) / 10) * 10);
  const groupW = innerW / Math.max(1, races.length);
  const barW = (groupW - 8) / series.length;

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={w} height={height} style={{ display: 'block', overflow: 'visible' }}>
        {[0, 0.5, 1].map((p, i) => (
          <line key={i} x1={padL} y1={padT + innerH * p} x2={padL + innerW} y2={padT + innerH * p}
                stroke="var(--line)" />
        ))}

        {races.map((r, i) => {
          const gx = padL + i * groupW + 4;
          return (
            <g key={r.round}>
              {series.map((s, si) => {
                const v = s.values[i] || 0;
                const h = (v / max) * innerH;
                return (
                  <rect key={si}
                        x={gx + si * barW}
                        y={padT + innerH - h}
                        width={barW - 2}
                        height={h}
                        fill={s.color}
                        opacity={si === 0 ? 1 : 0.7}>
                    <title>R{r.round} {s.name}: {v}pts</title>
                  </rect>
                );
              })}
              <text x={gx + (barW * series.length) / 2} y={padT + innerH + 18}
                    fontFamily="var(--mono)" fontSize="10" fill="var(--text-3)" textAnchor="middle">
                R{String(r.round).padStart(2, '0')}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="legend" style={{ marginTop: 10 }}>
        {series.map((s, i) => (
          <span key={i}>
            <span className="sw" style={{ background: s.color, display: 'inline-block', width: 10, height: 10, verticalAlign: 'middle', marginRight: 5 }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
