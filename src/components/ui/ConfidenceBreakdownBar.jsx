import React from 'react';

/**
 * ConfidenceBreakdownBar — horizontal stacked bar showing how confidence is composed.
 *
 * Props:
 *   breakdown — object with keys like { base, legal, visual, historicalDelta, visualEvidenceDelta, crossRuleDelta }
 *   total     — final confidence score (0–1)
 */

const SEGMENTS = [
  { key: 'base',                label: 'Base model',    color: 'bg-slate-600' },
  { key: 'legal',               label: 'Legal/Title',   color: 'bg-emerald-500' },
  { key: 'visual',              label: 'Visual',        color: 'bg-blue-500' },
  { key: 'historicalDelta',     label: 'Historical',    color: 'bg-indigo-500' },
  { key: 'visualEvidenceDelta', label: 'Evidence',      color: 'bg-cyan-500' },
  { key: 'crossRuleDelta',      label: 'Cross-rule',    color: 'bg-red-400' },
];

export default function ConfidenceBreakdownBar({ breakdown = {}, total }) {
  const segments = SEGMENTS.map((seg) => {
    const raw = Number(breakdown[seg.key]);
    return {
      ...seg,
      value: Number.isFinite(raw) ? raw : 0,
    };
  }).filter((s) => s.value !== 0);

  // Total absolute value for proportional widths
  const absSum = segments.reduce((sum, s) => sum + Math.abs(s.value), 0) || 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Confidence composition
        </p>
        {Number.isFinite(total) && (
          <span className="text-sm font-extrabold text-slate-900 tabular-nums">
            {total.toFixed(2)}
          </span>
        )}
      </div>

      {/* Stacked bar */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        {segments.map((seg) => {
          const widthPct = Math.max((Math.abs(seg.value) / absSum) * 100, 2);
          return (
            <div
              key={seg.key}
              className={`${seg.color} ${seg.value < 0 ? 'opacity-60' : ''} transition-all duration-300`}
              style={{ width: `${widthPct}%` }}
              title={`${seg.label}: ${seg.value > 0 ? '+' : ''}${seg.value.toFixed(3)}`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${seg.color} ${seg.value < 0 ? 'opacity-60' : ''}`} />
            <span className="text-[11px] font-semibold text-slate-500">
              {seg.label}
            </span>
            <span className={`text-[11px] font-bold tabular-nums ${seg.value >= 0 ? 'text-slate-700' : 'text-red-600'}`}>
              {seg.value > 0 ? '+' : ''}{seg.value.toFixed(3)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
