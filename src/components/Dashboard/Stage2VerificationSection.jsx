import React, { useState } from 'react';
import CollapsibleSection from '../ui/CollapsibleSection';

const STATUS_CLASS = {
  pass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  penalty: 'bg-amber-50 text-amber-700 border-amber-200',
  review: 'bg-amber-50 text-amber-700 border-amber-200',
  block: 'bg-red-50 text-red-600 border-red-200'
};

const NORM_SOURCE_LABEL = {
  sqlite_market_norms: 'SQLite market_norms',
  generated_fallback: 'generated fallback',
  default_fallback: 'default fallback'
};

function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'Not resolved';
  return value;
}

function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function ReferenceMetric({ label, value }) {
  return (
    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-bold text-slate-800">{displayValue(value)}</p>
    </div>
  );
}

function getCategoryIcon(group) {
  switch (group) {
    case 'basics': return 'home';
    case 'market': return 'trending_up';
    case 'risk': return 'warning';
    case 'crossSignal': return 'compare_arrows';
    default: return 'checklist';
  }
}

function getCategoryTitle(group) {
  switch (group) {
    case 'basics': return 'Property Basics';
    case 'market': return 'Market Context';
    case 'risk': return 'Risk Signals';
    case 'crossSignal': return 'Cross-Signal Checks';
    default: return 'General Checks';
  }
}

function groupRows(rows) {
  const groups = {};
  rows.forEach((row) => {
    // Infer group if missing
    let group = row.checkGroup || 'other';
    if (group === 'other') {
      const label = (row.check || '').toLowerCase();
      if (label.includes('size') || label.includes('subtype') || label.includes('age')) group = 'basics';
      else if (label.includes('price') || label.includes('liquid') || label.includes('market')) group = 'market';
      else if (label.includes('fraud') || label.includes('anomaly') || label.includes('suspicion')) group = 'risk';
    }
    
    if (!groups[group]) groups[group] = [];
    groups[group].push(row);
  });
  return groups;
}

function CheckRow({ row }) {
  const [expanded, setExpanded] = useState(false);
  const isPass = row.result === 'pass';
  
  return (
    <li className={`border-b border-slate-100 last:border-b-0 ${isPass ? 'bg-white' : 'bg-amber-50/20'}`}>
      <div 
        onClick={() => setExpanded(!expanded)} 
        className="cursor-pointer flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3 w-1/3 min-w-[200px]">
          <span className={`material-symbols-outlined text-[18px] ${isPass ? 'text-emerald-500' : 'text-amber-500'}`}>
            {isPass ? 'check_circle' : 'error'}
          </span>
          <p className="text-[13px] font-bold text-slate-800">{row.check}</p>
        </div>
        
        <div className="flex-1 px-4 flex items-center gap-4">
          <div className="flex-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Observed</span>
            <span className="text-[13px] text-slate-700 font-medium">{displayValue(row.observedValue)}</span>
          </div>
          <div className="flex-1 border-l border-slate-200 pl-4 hidden sm:block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Benchmark</span>
            <span className="text-[13px] text-slate-600 truncate block">{displayValue(row.reference)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest border ${STATUS_CLASS[row.result] || STATUS_CLASS.warning}`}>
            {titleCase(row.result)}
          </span>
          <span className="material-symbols-outlined text-[16px] text-slate-400">
            {expanded ? 'expand_less' : 'expand_more'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="p-4 bg-slate-50/50 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Details</p>
            <p className="text-[13px] text-slate-700">{row.detail || 'No additional details provided.'}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Source Bucket</p>
            <p className="text-[13px] font-mono text-slate-600">{displayValue(row.sourceBucket)}</p>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-3 mb-1">Full Benchmark Reference</p>
            <p className="text-[13px] text-slate-700">{displayValue(row.reference)}</p>
          </div>
        </div>
      )}
    </li>
  );
}

function CheckGroup({ group, rows }) {
  const passed = rows.filter(r => r.result === 'pass').length;
  const total = rows.length;
  const hasIssues = passed < total;
  
  return (
    <CollapsibleSection
      title={getCategoryTitle(group)}
      icon={getCategoryIcon(group)}
      badge={`${passed}/${total} Passed`}
      badgeTone={hasIssues ? 'amber' : 'emerald'}
      defaultOpen={hasIssues}
    >
      <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white shadow-sm overflow-hidden mt-1">
        {rows.map(row => <CheckRow key={row.id || row.check} row={row} />)}
      </ul>
    </CollapsibleSection>
  );
}

export default function Stage2VerificationSection({ stage2Output }) {
  if (!stage2Output) return null;

  const localReferenceContext = stage2Output.localReferenceContext || {};
  const normSourceLabel = NORM_SOURCE_LABEL[stage2Output.normSource] || NORM_SOURCE_LABEL.default_fallback;
  
  const evaluationRows = stage2Output.evaluationRows?.length
    ? stage2Output.evaluationRows
    : (stage2Output.checksRun || []).map((check) => ({
        id: check.id,
        check: check.label,
        observedValue: check.status === 'pass' ? 'No issue observed' : 'Issue observed',
        reference: 'This check should pass',
        sourceBucket: 'Source: System',
        result: check.status,
        detail: `The system checked this item as part of the pre-valuation review. ${check.explanation}`,
        checkGroup: check.group || 'other'
      }));

  const groupedRows = groupRows(evaluationRows);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 border-b border-slate-100 pb-4">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            Local Reference Context
          </h4>
          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border w-max bg-slate-50 text-slate-600 border-slate-200">
            Norm source: {normSourceLabel}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <ReferenceMetric label="Size band" value={localReferenceContext.sizeBand} />
          <ReferenceMetric label="Price band" value={localReferenceContext.priceBand || localReferenceContext.localPriceBand} />
          <ReferenceMetric label="Subtype prevelance" value={typeof localReferenceContext.subtypePrevalence === 'number' ? `${(localReferenceContext.subtypePrevalence * 100).toFixed(1)}%` : localReferenceContext.subtypePrevalenceLabel} />
          <ReferenceMetric label="Comparables" value={localReferenceContext.comparableCount} />
          <ReferenceMetric label="Liquidity index" value={typeof localReferenceContext.liquidityIndex === 'number' ? localReferenceContext.liquidityIndex.toFixed(2) : localReferenceContext.liquidityIndex} />
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(groupedRows).map(([group, rows]) => (
          <CheckGroup key={group} group={group} rows={rows} />
        ))}
      </div>
    </div>
  );
}
