import React from 'react';

/**
 * LiquidityGauge — small SVG arc gauge for PropIntel (0–100).
 *
 * Props:
 *   score — numeric value 0–100
 *   label — optional label below the number (default: "Liquidity")
 *   size  — diameter in px (default: 88)
 */

function scoreColor(score) {
  if (score < 35) return { stroke: '#ef4444', text: 'text-red-600' };       // red
  if (score < 60) return { stroke: '#f59e0b', text: 'text-amber-600' };     // amber
  if (score < 80) return { stroke: '#3b82f6', text: 'text-blue-600' };      // blue
  return { stroke: '#10b981', text: 'text-emerald-600' };                    // emerald
}

export default function LiquidityGauge({ score = 0, label = 'Liquidity', size = 88 }) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  const { stroke, text } = scoreColor(safeScore);

  const r = 34;                         // radius
  const circumference = 2 * Math.PI * r;
  const arc = circumference * 0.75;     // 270° arc
  const offset = arc - (arc * safeScore) / 100;

  const center = size / 2;
  const strokeWidth = 6;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="drop-shadow-sm"
        aria-label={`${label}: ${safeScore}/100`}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
          strokeDashoffset="0"
          transform={`rotate(135 ${center} ${center})`}
        />
        {/* Filled arc */}
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
          strokeDashoffset={offset}
          transform={`rotate(135 ${center} ${center})`}
          className="transition-all duration-700 ease-out"
        />
        {/* Center text */}
        <text
          x={center}
          y={center + 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-slate-900 text-lg font-extrabold"
          style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'system-ui, sans-serif' }}
        >
          {safeScore}
        </text>
      </svg>
      {label && (
        <p className={`text-[10px] font-bold uppercase tracking-wider ${text}`}>
          {label}
        </p>
      )}
    </div>
  );
}
