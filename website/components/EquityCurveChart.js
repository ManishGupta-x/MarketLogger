"use client";

import { useMemo, useState } from "react";
import { formatINR, formatDate } from "@/lib/format";

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 24, left: 16 };

export default function EquityCurveChart({ points, startCapital }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  const { path, xOf, yOf, min, max } = useMemo(() => {
    if (!points || points.length === 0) return { path: "", xOf: () => 0, yOf: () => 0, min: 0, max: 0 };
    const values = points.map((p) => p.equity);
    const min = Math.min(...values, startCapital);
    const max = Math.max(...values, startCapital);
    const range = max - min || 1;
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const xOf = (i) => PAD.left + (i / Math.max(1, points.length - 1)) * innerW;
    const yOf = (v) => PAD.top + innerH - ((v - min) / range) * innerH;
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(p.equity).toFixed(1)}`).join(" ");
    return { path, xOf, yOf, min, max };
  }, [points, startCapital]);

  if (!points || points.length === 0) return null;

  const baseline = yOf(startCapital);
  const hovered = hoverIdx != null ? points[hoverIdx] : null;

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const innerW = WIDTH - PAD.left - PAD.right;
    const ratio = Math.min(1, Math.max(0, (x - PAD.left) / innerW));
    const idx = Math.round(ratio * (points.length - 1));
    setHoverIdx(idx);
  };

  return (
    <div className="viz-root">
      <style>{`
        .viz-root { --surface-1: #fcfcfb; --text-secondary: #52514e; --muted: #898781; --grid: #e1e0d9; --baseline: #c3c2b7; --series-1: #2a78d6; --good: #006300; --bad: #d03b3b; }
        @media (prefers-color-scheme: dark) {
          .viz-root { --surface-1: #1a1a19; --text-secondary: #c3c2b7; --muted: #898781; --grid: #2c2c2a; --baseline: #383835; --series-1: #3987e5; --good: #0ca30c; --bad: #e66767; }
        }
      `}</style>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <line x1={PAD.left} y1={baseline} x2={WIDTH - PAD.right} y2={baseline} stroke="var(--baseline)" strokeWidth="1" strokeDasharray="3,3" />
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hovered && (
          <g>
            <line x1={xOf(hoverIdx)} y1={PAD.top} x2={xOf(hoverIdx)} y2={HEIGHT - PAD.bottom} stroke="var(--grid)" strokeWidth="1" />
            <circle cx={xOf(hoverIdx)} cy={yOf(hovered.equity)} r="4" fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth="2" />
          </g>
        )}
      </svg>
      <div className="mt-1 flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{formatDate(points[0].date)}</span>
        {hovered ? (
          <span className="font-medium tabular-nums" style={{ color: hovered.equity >= startCapital ? "var(--good)" : "var(--bad)" }}>
            {formatDate(hovered.date)} · {formatINR(hovered.equity)}
          </span>
        ) : (
          <span className="text-[var(--text-secondary)]">Hover to inspect</span>
        )}
        <span>{formatDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}
