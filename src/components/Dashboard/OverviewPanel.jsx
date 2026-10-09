import React from 'react';
import { Badge, MetricCard, cleanText, formatNumber, formatPercent } from '../ui/DashboardPrimitives';
import LiquidityGauge from '../ui/LiquidityGauge';
import ConfidenceBreakdownBar from '../ui/ConfidenceBreakdownBar';
import CollapsibleSection from '../ui/CollapsibleSection';
import PropertyMap from '../PropertyMap';
import { buildDecisionMemo } from '../../lib/decisionMemo';

/* ── helpers ─────────────────────────────────────────────────────────── */

function decisionTone(decision = '') {
  if (decision.includes('REJECT')) return 'red';
  if (decision.includes('MANUAL')) return 'orange';
  if (decision.includes('PENALTY')) return 'amber';
  if (decision.includes('WARNING')) return 'amber';
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

function recommendedLtv(data) {
  const value = data?.portfolioRiskSummary?.portfolioSummary?.recommendedLtv;
  return Number.isFinite(Number(value)) ? formatPercent(value) : `${data?.ltv ?? 'NA'}${Number.isFinite(data?.ltv) ? '%' : ''}`;
}

function BriefList({ title, items, icon, tone = 'slate', emptyText }) {
  const iconTone = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-500 text-white border-amber-600 shadow-sm shadow-amber-500/20',
    red: 'bg-red-600 text-white border-red-700 shadow-sm shadow-red-600/30',
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
  }[tone];

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <h4 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">{title}</h4>
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

/* ── main component ──────────────────────────────────────────────────── */

export default function OverviewPanel({
  data,
  underwriterSummary,
  isUnderwriterSummaryLoading,
  coordinates,
  showCircleRate,
  setShowCircleRate,
  showMetro,
  setShowMetro,
  showFlood,
  showImpactFactors,
  setShowImpactFactors,
  hyperlocalPOIs,
}) {
  if (!data) return null;

  const decision = data.verificationDecision?.decision || data.stage2Output?.decision || '';
  const portfolioSummary = data.portfolioRiskSummary?.portfolioSummary || {};
  const riskItems = topRisks(data);
  const evidenceItems = nextEvidence(data, underwriterSummary);
  const aiSummary = underwriterSummary?.summary?.executiveSummary;
  const memo = buildDecisionMemo(data, underwriterSummary);
  const requiredActions = memo.conditions.length ? memo.conditions : evidenceItems;

  return (
    <div className="space-y-6">

      {/* ── Decision hero + Key action ── */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">

        {/* Decision card — light hero */}
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone={memo.tone}>{memo.action}</Badge>
            <Badge tone="slate">Route: {memo.reviewRoute}</Badge>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600">Institutional Credit Memo</p>
          <h3 className="mt-2 max-w-3xl text-2xl font-extrabold tracking-tight text-slate-950">
            {memo.headline}
          </h3>
          <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-600">
            {cleanText(memo.narrative)}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Badge tone={data.visualEvidence?.packetStatus === 'complete' ? 'emerald' : 'slate'}>
              Visual packet {data.visualEvidence?.packetStatus || 'not uploaded'}
            </Badge>
            <Badge tone={data.visualEvidence?.metadataTrust?.gpsMatchStatus === 'fail' ? 'red' : 'slate'}>
              GPS {data.visualEvidence?.metadataTrust?.gpsMatchStatus || 'unknown'}
            </Badge>
            <Badge tone="slate">LTV {recommendedLtv(data)}</Badge>
          </div>
        </div>

        {/* Right column: Gauge + Next step + AI brief */}
        <div className="space-y-4">
          {/* Liquidity gauge + immediate next step */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-5">
              <LiquidityGauge score={data.PropIntel} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Immediate next step</p>
                <p className="mt-2 text-base font-extrabold text-slate-950 leading-snug">
                  {requiredActions[0] || 'Complete standard underwriting review'}
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                  {memo.primaryReason}
                </p>
              </div>
            </div>
          </div>

          {/* AI brief context card */}
          <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-5 shadow-sm relative overflow-hidden">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-700 flex items-center gap-2 mb-3">
               <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
               Intelligence Brief
            </p>
            {isUnderwriterSummaryLoading ? (
               <div className="space-y-2 animate-pulse">
                  <div className="h-3 bg-cyan-200/50 rounded w-full"></div>
                  <div className="h-3 bg-cyan-200/50 rounded w-5/6"></div>
                  <div className="h-3 bg-cyan-200/50 rounded w-4/6"></div>
               </div>
            ) : (
               <p className="text-sm font-medium leading-7 text-slate-800">
                 {aiSummary ? cleanText(aiSummary) : `Deterministic memo ready. Review route: ${memo.reviewRoute}.`}
               </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Confidence breakdown bar ── */}
      {data.confidenceBreakdown && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ConfidenceBreakdownBar
            breakdown={data.confidenceBreakdown}
            total={Number(data.confidence)}
          />
        </div>
      )}

      {/* ── Key metrics row ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard 
          label="Portfolio risk" 
          value={portfolioSummary.riskLevel || 'NA'} 
          icon="account_balance"
          formula="Risk Level = (Total Sector Exposure + Current Request) > Maximum Allowed Limit (80%)"
        />
        <MetricCard 
          label="Historical signal" 
          value={data.historicalCaseSummary?.overallSignal || 'NA'} 
          tone={data.historicalCaseSummary?.overallSignal === 'Positive' ? 'emerald' : 'slate'} 
          icon="history"
          formula="Signal = Mode(Historical Default Rates in 2km Radius)"
        />
        <MetricCard 
          label="Time to liquidate" 
          value={data.timeToSell} 
          icon="schedule" 
          formula="TTL = Base (3-6mo) + Marketability Penalty + Property Age Depreciation"
        />
        <MetricCard 
          label="Liquidity score" 
          value={`${data.PropIntel ?? 'NA'}/100`} 
          tone={data.PropIntel < 50 ? 'red' : data.PropIntel < 75 ? 'amber' : 'emerald'} 
          icon="speed"
          formula="PropIntel = (Location × 0.4) + (Amenities × 0.3) + (Historical Appreciation × 0.3)"
        />
      </div>

      {/* ── Strengths / Risks / Evidence ── */}
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
          emptyText="No major strengths identified."
        />
        <BriefList
          title="Review risks"
          tone="red"
          icon="priority_high"
          items={riskItems}
          emptyText="No high-signal risks surfaced."
        />
        <BriefList
          title="Evidence required"
          tone="amber"
          icon="description"
          items={requiredActions}
          emptyText="No additional evidence requested."
        />
      </div>

      {/* ── Map Intelligence ── */}
      <CollapsibleSection
        title="Hyperlocal Map Intelligence"
        icon="public"
        defaultOpen={true}
        eyebrow="Spatial Querying"
      >
        <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => setShowCircleRate(!showCircleRate)} className={`px-3 py-1 text-xs border rounded-full transition-colors font-bold flex items-center gap-1 ${showCircleRate ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              <span className={`w-2 h-2 rounded-full ${showCircleRate ? 'bg-indigo-500' : 'bg-slate-300'}`} /> Zone
            </button>
            <button onClick={() => setShowMetro(!showMetro)} className={`px-3 py-1 text-xs border rounded-full transition-colors font-bold flex items-center gap-1 ${showMetro ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              <span className={`w-2 h-2 rounded-full ${showMetro ? 'bg-emerald-500' : 'bg-slate-300'}`} /> Metro
            </button>
            <button onClick={() => setShowImpactFactors(!showImpactFactors)} className={`px-3 py-1 text-xs border rounded-full transition-colors font-bold flex items-center gap-1 shadow-sm ${showImpactFactors ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              <span className={`w-2 h-2 rounded-full ${showImpactFactors ? 'bg-indigo-500' : 'bg-slate-300'}`} /> Collateral Signals
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <PropertyMap
            center={coordinates}
            showCircleRate={showCircleRate}
            showMetro={showMetro}
            showFlood={showFlood}
            showImpactFactors={showImpactFactors}
            hyperlocalPOIs={hyperlocalPOIs}
          />
        </div>
      </CollapsibleSection>

    </div>
  );
}
