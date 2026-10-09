import React, { useState } from 'react';

/**
 * CollapsibleSection — a clean accordion panel for progressive disclosure.
 *
 * Uses the CSS `grid-template-rows: 0fr → 1fr` trick for smooth height
 * animation without JavaScript measurement.
 *
 * Props:
 *   title       — section heading text
 *   icon        — optional Material Symbols icon name
 *   badge       — optional badge text shown next to title
 *   badgeTone   — badge color key (slate | emerald | amber | red | indigo)
 *   eyebrow     — optional small label above title
 *   defaultOpen — start expanded (default: false)
 *   children    — collapsible content
 *   className   — extra classes on the outer wrapper
 */

const BADGE_TONE = {
  slate:   'bg-slate-50 text-slate-600 border-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  red:     'bg-red-50 text-red-700 border-red-200',
  indigo:  'bg-indigo-50 text-indigo-700 border-indigo-100',
};

export default function CollapsibleSection({
  title,
  icon,
  badge,
  badgeTone = 'slate',
  eyebrow,
  defaultOpen = false,
  children,
  className = '',
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors duration-150 hover:bg-slate-50/60"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <span className="material-symbols-outlined text-[20px] text-slate-400" aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                {eyebrow}
              </p>
            )}
            <h4 className="text-sm font-bold text-slate-800 truncate">{title}</h4>
          </div>
          {badge && (
            <span
              className={`ml-1 shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${BADGE_TONE[badgeTone] || BADGE_TONE.slate}`}
            >
              {badge}
            </span>
          )}
        </div>
        <span
          aria-hidden="true"
          className={`material-symbols-outlined text-[20px] text-slate-400 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Animated content wrapper using grid-template-rows for smooth open/close */}
      <div
        className="ps-collapsible-body"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
