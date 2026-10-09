import React from 'react';
import { Badge, MetricCard, cleanText, formatNumber, formatPercent } from '../ui/DashboardPrimitives';

function decisionTone(decision = '') {
  if (decision.includes('REJECT')) return 'red';
  if (decision.includes('MANUAL')) return 'orange';
  if (decision.includes('PENALTY')) return 'amber';
  if (decision.includes('WARNING')) return 'blue';
  return 'emerald';
}

function topRisks(data) {
  const stage2Flags = data?.stage2Output?.flags || [];
  const portfolioFlags = data?.portfolioRiskSummary?.riskFlags || [];
  const normalizedStage2 = stage2Flags
    .filter((flag) => !flag?.protective)
    .slice(0, 3)
    .map((flag) => cleanText(flag.title || flag.explanation || flag.text || flag));
  const normalizedPortfolio = portfolioFlags.slice(0, 2).map((flag) => `Portfolio: ${cleanText(flag)}`);
  return [...normalizedStage2, ...normalizedPortfolio].filter(Boolean).slice(0, 4);
}

function nextEvidence(data, underwriterSummary) {
  const aiEvidence = underwriterSummary?.summary?.recommendedEvidence || [];
  if (aiEvidence.length) return aiEvidence.slice(0, 3);

  const flags = [
    ...(data?.stage2Output?.flags || []).map((flag) => cleanText(flag.title || flag.explanation || flag.text || flag)),
    ...(data?.portfolioRiskSummary?.riskFlags || []).map((flag) => cleanText(flag)),
  ].join(' ').toLowerCase();

  const evidence = [];
  if (flags.includes('size') || flags.includes('area')) evidence.push('Verify carpet area / built-up area.');
  if (flags.includes('legal') || flags.includes('title')) evidence.push('Upload title document and legal clearance evidence.');
  if (flags.includes('portfolio') || flags.includes('concentration')) evidence.push('Document senior credit review for exposure flags.');
  if (!evidence.length) evidence.push('Confirm mandatory intake and legal evidence before approval.');
  return evidence;
}

function BriefList({ title, items, icon, tone = 'slate', emptyText }) {
  const iconTone = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="mb-3 text-sm font-bold text-slate-900">{title}</h4>
      <div className="space-y-2">
        {(items?.length ? items : [emptyText]).map((item, index) => (
          <div key={`${title}-${index}`} className="flex items-start gap-2">
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${iconTone}`}>
              <span className="material-symbols-outlined text-[14px]">{icon}</span>
            </span>
            <p className="text-sm font-semibold leading-snug text-slate-700">{cleanText(item)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function recommendedLtv(data) {
  const value = data?.portfolioRiskSummary?.portfolioSummary?.recommendedLtv;
  return Number.isFinite(Number(value)) ? formatPercent(value) : `${data?.ltv ?? 'Not available'}${Number.isFinite(data?.ltv) ? '%' : ''}`;
}

export default function OverviewSection({ data, underwriterSummary, isUnderwriterSummaryLoading }) {
  if (!data) return null;

  const decision = data.verificationDecision?.decision || data.stage2Output?.decision || '';
  const scores = data.stage2Output?.scores || {};
  const portfolioSummary = data.portfolioRiskSummary?.portfolioSummary || {};
  const riskItems = topRisks(data);
  const evidenceItems = nextEvidence(data, underwriterSummary);
  const aiSummary = underwriterSummary?.summary?.executiveSummary;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-xl border border-slate-900 bg-slate-900 p-6 text-white shadow-xl shadow-slate-900/10">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Badge tone={decisionTone(decision)}>{data.verificationDecision?.label || cleanText(decision)}</Badge>
            <Badge tone="slate">DSS {formatNumber(scores.dataSufficiencyScore ?? data.dataSufficiency, 2)}</Badge>
            <Badge tone="slate">Suspicion {scores.suspicionScore ?? data.anomalyResults?.suspicionScore ?? 'NA'}/100</Badge>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200/80">Underwriter decision memo</p>
          <h3 className="mt-3 max-w-3xl text-2xl font-extrabold tracking-tight text-white">
            {data.verificationDecision?.label || cleanText(decision)}
          </h3>
          <p className="mt-4 max-w-4xl text-base font-semibold leading-8 text-slate-200">
            {cleanText(data.verificationDecision?.explanation || data.stage2Output?.decisionExplanation || 'The deterministic assessment is available for review.')}
          </p>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Recommended LTV</p>
              <p className="mt-2 text-2xl font-extrabold text-white">{recommendedLtv(data)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Liquidity</p>
              <p className="mt-2 text-2xl font-extrabold text-white">{data.PropIntel ?? 'NA'}/100</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Confidence</p>
              <p className="mt-2 text-2xl font-extrabold text-white">{formatNumber(data.confidence, 2)}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Immediate next step</p>
            <p className="mt-3 text-xl font-extrabold text-slate-950">
              {evidenceItems[0] || 'Complete evidence review'}
            </p>
            <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
              {riskItems[0] || 'No high-signal risk surfaced in the structured output.'}
            </p>
          </div>
          <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">AI brief</p>
            <p className="mt-3 text-sm font-semibold leading-7 text-slate-900">
              {isUnderwriterSummaryLoading
                ? 'Fast AI summary is generating in the background.'
                : aiSummary
                  ? cleanText(aiSummary)
                  : 'AI summary will appear in its own tab without blocking deterministic results.'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <MetricCard label="Market value" value={data.marketValue} icon="payments" />
        <MetricCard label="Distress value" value={data.distressValue} tone="amber" icon="trending_down" />
        <MetricCard label="Portfolio risk" value={portfolioSummary.riskLevel || 'Not available'} icon="account_balance" />
        <MetricCard label="Historical signal" value={data.historicalCaseSummary?.overallSignal || 'Not available'} tone={data.historicalCaseSummary?.overallSignal === 'Positive' ? 'emerald' : 'slate'} icon="history" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <BriefList
          title="Strengths"
          tone="emerald"
          icon="check"
          items={[
            data.stage1?.bucketAssignment?.microMarketBucket?.liquidityNorm && `Liquidity norm: ${data.stage1.bucketAssignment.microMarketBucket.liquidityNorm}`,
            data.historicalCaseSummary?.overallSignal && `Historical signal: ${data.historicalCaseSummary.overallSignal}`,
            Number.isFinite(data.confidence) && `Deterministic confidence: ${formatNumber(data.confidence, 2)}`,
          ].filter(Boolean)}
          emptyText="No major strengths identified from structured output."
        />
        <BriefList
          title="Review risks"
          tone="red"
          icon="priority_high"
          items={riskItems}
          emptyText="No high-signal risks surfaced in the structured output."
        />
        <BriefList
          title="Evidence required"
          tone="amber"
          icon="description"
          items={evidenceItems}
          emptyText="No additional evidence requested from structured output."
        />
      </div>
    </div>
  );
}
