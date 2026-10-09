import React from 'react';

const SIGNAL_CLASS = {
  Positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Mixed: 'bg-amber-50 text-amber-700 border-amber-200',
  Caution: 'bg-red-50 text-red-700 border-red-200'
};

const DIRECTION_CLASS = {
  Positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Mixed: 'bg-slate-50 text-slate-600 border-slate-200',
  Negative: 'bg-red-50 text-red-700 border-red-200'
};

const SOURCE_LABEL = {
  sqlite_historical_cases: 'SQLite historical_cases',
  generated_fallback: 'generated fallback',
  unavailable: 'unavailable'
};

function formatDelta(value, suffix = '') {
  if (!Number.isFinite(value) || value === 0) return 'No change';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}${suffix}`;
}

function formatWeight(value) {
  if (!Number.isFinite(value)) return 'Not available';
  return value.toFixed(2);
}

function formatAge(value) {
  if (!Number.isFinite(value)) return 'Not available';
  return `${value.toFixed(1)} years`;
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return 'Not available';
  return value;
}

function SummaryMetric({ label, value, tone = 'default' }) {
  const valueClass = tone === 'positive'
    ? 'text-emerald-700'
    : tone === 'caution'
      ? 'text-red-700'
      : 'text-slate-800';

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-mono font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">{label}</p>
      <p className="text-[12px] font-semibold text-slate-700">{formatValue(value)}</p>
    </div>
  );
}

function ConfidenceBridge({ summary }) {
  const base = Number(summary.baseConfidence);
  const final = Number(summary.finalConfidence);
  const adjustment = Number(summary.confidenceAdjustment);
  if (!Number.isFinite(base) || !Number.isFinite(final)) return null;

  const width = (value) => `${Math.max(0, Math.min(100, value * 100))}%`;
  return (
    <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Confidence bridge</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">Past outcomes make the current estimate more or less dependable.</p>
        </div>
        <span className={`rounded-md border px-2.5 py-1 text-xs font-bold ${adjustment >= 0 ? SIGNAL_CLASS.Positive : SIGNAL_CLASS.Caution}`}>
          History {formatDelta(adjustment)}
        </span>
      </div>
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-xs font-bold text-slate-500"><span>Before historical evidence</span><span>{base.toFixed(2)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-slate-400" style={{ width: width(base) }} /></div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs font-bold text-indigo-700"><span>After historical evidence</span><span>{final.toFixed(2)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-indigo-500" style={{ width: width(final) }} /></div>
        </div>
      </div>
    </div>
  );
}

function HistoricalCaseRow({ historicalCase }) {
  const impact = historicalCase.currentCaseImpact || {};
  const confidenceContribution = historicalCase.confidenceContribution ?? impact.confidenceContribution;
  const influenceWeight = historicalCase.influenceWeight ?? impact.influenceWeight;
  const recencyWeight = historicalCase.recencyWeight ?? impact.recencyWeight;

  return (
    <details className="group border border-slate-200 rounded-xl bg-white overflow-hidden">
      <summary className="list-none cursor-pointer hover:bg-slate-50 transition-colors">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1.25fr_1fr_32px] gap-4 px-4 py-4 items-center">
          <div>
            <p className="text-sm font-bold text-slate-800">{historicalCase.caseId}</p>
            <p className="text-xs text-slate-500 font-medium">{historicalCase.location}</p>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs font-bold text-indigo-700">
              <span>Similarity</span><span>{historicalCase.similarityPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(0, Math.min(100, Number(historicalCase.similarityPct) || 0))}%` }} />
            </div>
            {Number.isFinite(historicalCase.caseAgeYears) && (
              <p className="text-xs text-slate-500 font-bold mt-1">{formatAge(historicalCase.caseAgeYears)} old</p>
            )}
          </div>
          <p className="text-[12px] text-slate-600 font-medium leading-snug">{historicalCase.outcomeSummary}</p>
          <p className={`text-[12px] font-bold ${confidenceContribution >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            Confidence {formatDelta(confidenceContribution)}
            {Number.isFinite(influenceWeight) && (
              <span className="block text-xs text-slate-500 font-bold mt-1">Influence {formatWeight(influenceWeight)}</span>
            )}
          </p>
          <span className="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
        </div>
      </summary>

      <div className="border-t border-slate-200 bg-slate-50/70 p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Historical Property Summary</h4>
            <div className="grid grid-cols-2 gap-4">
              <DetailItem label="Micro-market" value={historicalCase.microMarket} />
              <DetailItem label="Locality" value={historicalCase.localityName || historicalCase.location} />
              <DetailItem label="Type" value={historicalCase.propertyType} />
              <DetailItem label="Subtype" value={historicalCase.subtype} />
              <DetailItem label="Config" value={historicalCase.config} />
              <DetailItem label="Size" value={historicalCase.sizeSqft ? `${historicalCase.sizeSqft} sqft` : null} />
              <DetailItem label="Size band" value={historicalCase.sizeBand} />
              <DetailItem label="Age bucket" value={historicalCase.ageBucket} />
              <DetailItem label="Legal profile" value={historicalCase.legalProfile} />
              <DetailItem label="Closed date" value={historicalCase.closedDate} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Historical Outcome</h4>
            <div className="grid grid-cols-2 gap-4">
              <DetailItem label="Approval" value={historicalCase.outcome?.approvalStatus} />
              <DetailItem label="Default" value={historicalCase.outcome?.defaultStatus} />
              <DetailItem label="Liquidation" value={historicalCase.outcome?.liquidationDays ? `${historicalCase.outcome.liquidationDays} days` : 'Not liquidated'} />
              <DetailItem label="Valuation gap" value={`${historicalCase.outcome?.valuationDeviationPct ?? 0}%`} />
              <DetailItem label="Recovery ratio" value={historicalCase.outcome?.recoveryRatio} />
              <DetailItem label="Recovery quality" value={historicalCase.outcome?.recoveryQuality} />
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-2">Why it matched</p>
              <div className="flex flex-wrap gap-2">
                {(historicalCase.matchReasons || historicalCase.matchReason || []).map((reason) => (
                  <span key={reason} className="px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-600 font-bold">
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Impact on Current Case</h4>
            <div className="space-y-3">
              <DetailItem label="Similarity weight" value={impact.similarityWeight?.toFixed(2)} />
              <DetailItem label="Case age" value={formatAge(historicalCase.caseAgeYears)} />
              <DetailItem label="Recency weight" value={formatWeight(recencyWeight)} />
              <DetailItem label="Influence weight" value={formatWeight(influenceWeight)} />
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Reliability direction</p>
                <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${DIRECTION_CLASS[impact.reliabilityDirection] || DIRECTION_CLASS.Mixed}`}>
                  {impact.reliabilityDirection || 'Mixed'}
                </span>
              </div>
              <DetailItem label="Outcome score" value={formatWeight(historicalCase.outcomeScore)} />
              <DetailItem label="Confidence contribution" value={formatDelta(confidenceContribution)} />
              <DetailItem label="Liquidity effect" value={formatDelta(impact.liquidityEffect)} />
              <DetailItem label="Distress effect" value={formatDelta(impact.distressEffect)} />
              <DetailItem label="Recency explanation" value={historicalCase.recencyExplanation} />
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

export default function HistoricalReliabilitySection({ historicalCaseSummary }) {
  if (!historicalCaseSummary) return null;

  const signalClass = SIGNAL_CLASS[historicalCaseSummary.overallSignal] || SIGNAL_CLASS.Mixed;
  const hasCases = historicalCaseSummary.similarCases?.length > 0;
  const sourceLabel = SOURCE_LABEL[historicalCaseSummary.source] || SOURCE_LABEL.unavailable;

  return (
    <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-indigo-500">history</span>
            <h3 className="text-lg font-headline font-bold text-slate-800">Historical Similar Cases</h3>
            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded font-mono border border-indigo-100">HISTORY_LAYER</span>
          </div>
          <p className="text-sm text-slate-500 font-medium">
            How similar past collateral cases performed. This is separate from market comparables and portfolio concentration.
          </p>
        </div>
        <div className="flex flex-wrap lg:justify-end gap-2">
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest border bg-slate-50 text-slate-600 border-slate-200">
            Source: {sourceLabel}
          </span>
          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest border ${signalClass}`}>
            Historical Signal: {historicalCaseSummary.overallSignal}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <SummaryMetric label="Relevant cases used" value={historicalCaseSummary.displayedCount ?? historicalCaseSummary.casesFound} />
        <SummaryMetric
          label="Confidence impact"
          value={formatDelta(historicalCaseSummary.confidenceAdjustment)}
          tone={historicalCaseSummary.confidenceAdjustment >= 0 ? 'positive' : 'caution'}
        />
        <SummaryMetric label="Historical signal" value={historicalCaseSummary.overallSignal || 'Not available'} />
      </div>

      <ConfidenceBridge summary={historicalCaseSummary} />

      {historicalCaseSummary.sparse && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-800">
          {historicalCaseSummary.note}
        </div>
      )}

      {!hasCases ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
          Limited historical matches found. Historical data had low similarity, so confidence impact is small.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="hidden lg:grid grid-cols-[1fr_1fr_1.25fr_1fr_32px] gap-4 px-4 text-xs text-slate-400 font-bold uppercase tracking-wider">
            <span>Similar case</span>
            <span>Similarity</span>
            <span>Historical outcome</span>
            <span>Impact on this case</span>
            <span></span>
          </div>
          {historicalCaseSummary.similarCases.map((historicalCase) => (
            <HistoricalCaseRow key={historicalCase.caseId} historicalCase={historicalCase} />
          ))}
        </div>
      )}
    </section>
  );
}
