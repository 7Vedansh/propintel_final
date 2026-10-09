import React from 'react';

const toneClasses = {
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  red: 'bg-red-50 text-red-700 border-red-200',
};

export function cleanText(value) {
  if (value === null || value === undefined || value === '') return 'Not available';
  return String(value)
    .replace(/â‚¹/g, 'INR ')
    .replace(/â€“/g, '-')
    .replace(/â€”/g, '-')
    .replace(/Ã—/g, 'x')
    .replace(/â†‘/g, 'Up')
    .replace(/â†“/g, 'Down')
    .replace(/â€º/g, '>');
}

export function formatNumber(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Not available';
  return numeric.toFixed(digits);
}

export function formatPercent(value, digits = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Not available';
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return `${percent.toFixed(digits)}%`;
}

export function Badge({ children, tone = 'slate', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${toneClasses[tone] || toneClasses.slate} ${className}`}>
      {children}
    </span>
  );
}

export function SectionCard({ children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function SectionHeader({ icon, title, eyebrow, description, actions }) {
  return (
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {icon && <span className="material-symbols-outlined text-[20px] text-indigo-500">{icon}</span>}
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          {eyebrow && <Badge tone="indigo">{eyebrow}</Badge>}
        </div>
        {description && <p className="max-w-3xl text-sm font-medium leading-relaxed text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div>}
    </div>
  );
}

export function MetricCard({ label, value, sublabel, tone = 'slate', icon, formula, tooltipAlign = 'center' }) {
  const toneClass = {
    slate: 'text-slate-900 bg-slate-50 border-slate-200',
    indigo: 'text-indigo-900 bg-indigo-50 border-indigo-100',
    emerald: 'text-emerald-900 bg-emerald-50 border-emerald-100',
    amber: 'text-amber-900 bg-amber-50 border-amber-100',
    red: 'text-red-900 bg-red-50 border-red-100',
  }[tone] || 'text-slate-900 bg-slate-50 border-slate-200';

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          {label}
          {formula && <FormulaTooltip formula={formula} align={tooltipAlign} />}
        </p>
        {icon && <span className="material-symbols-outlined text-[18px] opacity-70">{icon}</span>}
      </div>
      <p className="break-words text-xl font-bold leading-tight text-current">{cleanText(value)}</p>
      {sublabel && <p className="mt-1 text-[12px] font-semibold leading-snug text-slate-500">{cleanText(sublabel)}</p>}
    </div>
  );
}

export function InfoItem({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="break-words text-sm font-semibold leading-snug text-slate-800">{cleanText(value)}</p>
    </div>
  );
}

export function EmptyState({ title = 'No data available', description }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm">
      <p className="font-bold text-slate-800">{title}</p>
      {description && <p className="mt-1 font-medium leading-relaxed text-slate-500">{description}</p>}
    </div>
  );
}

export function SubSectionDivider({ label, className = '' }) {
  return (
    <div className={`flex items-center gap-3 py-2 ${className}`}>
      <div className="h-px flex-1 bg-slate-100" />
      {label && (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </span>
      )}
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

export function SummaryStatRow({ items = [] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {item.label}
          </span>
          <span className={`text-sm font-extrabold tabular-nums ${item.tone === 'danger' ? 'text-red-700' : item.tone === 'success' ? 'text-emerald-700' : 'text-slate-900'}`}>
            {cleanText(item.value)}
          </span>
          {item.delta && (
            <span className={`text-[11px] font-bold tabular-nums ${Number(item.delta) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {Number(item.delta) > 0 ? '+' : ''}{item.delta}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function FormulaTooltip({ formula, align = 'center' }) {
  if (!formula) return null;

  const alignClasses = {
    left: '-left-2',
    right: '-right-2',
    center: 'left-1/2 -translate-x-1/2',
  }[align];

  const caretClasses = {
    left: 'left-3',
    right: 'right-3',
    center: 'left-1/2 -translate-x-1/2',
  }[align];

  return (
    <div className="group relative inline-flex items-center justify-center translate-y-[1px]">
      <span className="material-symbols-outlined text-[13px] text-slate-300 cursor-help hover:text-indigo-500 transition-colors bg-white rounded-full">help</span>
      <div className={`pointer-events-none absolute bottom-full mb-2 w-max max-w-[280px] opacity-0 shadow-lg transition-all duration-200 group-hover:opacity-100 z-[100] translate-y-1 group-hover:translate-y-0 ${alignClasses}`}>
        <div className="rounded-lg bg-slate-900 px-3 py-2.5 text-[11px] text-white font-mono leading-relaxed whitespace-pre-wrap text-left shadow-xl border border-slate-700 tracking-wide">
          {formula}
        </div>
        <div className={`absolute -bottom-1 h-2 w-2 rotate-45 bg-slate-900 border-b border-r border-slate-700 ${caretClasses}`}></div>
      </div>
    </div>
  );
}
