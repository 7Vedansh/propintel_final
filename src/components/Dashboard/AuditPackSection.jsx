import React from 'react';
import { Badge, EmptyState, InfoItem, SectionCard, SectionHeader, cleanText, formatNumber } from '../ui/DashboardPrimitives';

function sourceTone(source) {
  if (!source) return 'slate';
  if (String(source).includes('sqlite') || String(source).includes('ollama') || String(source).includes('owlvit')) return 'emerald';
  if (String(source).includes('fallback') || String(source).includes('unavailable')) return 'amber';
  return 'indigo';
}

function compactSourceLabel(source) {
  if (!source) return 'Not available';
  return cleanText(String(source).replace(/_/g, ' '));
}

function confidenceRows(data) {
  const breakdown = data?.confidenceBreakdown || {};
  return [
    ['Base collateral model', breakdown.base],
    ['Legal/title contribution', breakdown.legal],
    ['Visual evidence contribution', breakdown.visual],
    ['Historical adjustment', breakdown.historicalDelta ?? breakdown.historical],
  ].filter(([, value]) => Number.isFinite(Number(value)));
}

function reviewFlags(data) {
  const stageFlags = (data?.stage2Output?.flags || [])
    .filter((flag) => !flag?.protective)
    .slice(0, 4)
    .map((flag) => cleanText(flag.title || flag.explanation || flag.text || flag));
  const portfolioFlags = (data?.portfolioRiskSummary?.riskFlags || [])
    .slice(0, 3)
    .map((flag) => `Portfolio: ${cleanText(flag)}`);
  const visualFailures = (data?.visualAudit?.failures || [])
    .slice(0, 2)
    .map((failure) => `Vision: ${cleanText(failure)}`);
  return [...stageFlags, ...portfolioFlags, ...visualFailures].filter(Boolean);
}

function evidenceChecklist(data, underwriterSummary) {
  const aiEvidence = underwriterSummary?.summary?.recommendedEvidence || [];
  if (aiEvidence.length) return aiEvidence.slice(0, 5);

  const flags = reviewFlags(data).join(' ').toLowerCase();
  const items = [];
  if (flags.includes('size') || flags.includes('area')) items.push('Verify carpet area / built-up area evidence.');
  if (flags.includes('legal') || flags.includes('title')) items.push('Upload title document and legal clearance evidence.');
  if (flags.includes('portfolio') || flags.includes('senior')) items.push('Record senior credit review for concentration flags.');
  if (data?.stage1?.normalizedPropertyProfile?.imageCount === 0) items.push('Upload exterior/interior property images or schedule field verification.');
  if (!items.length) items.push('Confirm standard property ownership, KYC, and field verification evidence.');
  return items;
}

function riskLevelTone(level) {
  if (level === 'Low') return 'emerald';
  if (level === 'Moderate') return 'amber';
  if (level === 'High' || level === 'Critical') return 'red';
  return 'slate';
}

export default function AuditPackSection({ data, underwriterSummary }) {
  if (!data) return null;

  const stage1Metadata = data.stage1?.stage1Metadata || {};
  const stage2 = data.stage2Output || {};
  const portfolio = data.portfolioRiskSummary || {};
  const portfolioSummary = portfolio.portfolioSummary || {};
  const historical = data.historicalCaseSummary || {};
  const aiSource = underwriterSummary?.source || 'pending';
  const flags = reviewFlags(data);
  const evidence = evidenceChecklist(data, underwriterSummary);
  const confidence = Number(data.confidence);

  const sourceCards = [
    {
      label: 'Stage 1 locality context',
      value: stage1Metadata.contextSourceLabel || stage1Metadata.contextSource,
      sublabel: `Match: ${stage1Metadata.locationMatchConfidence || 'not available'}${stage1Metadata.locationMatchDistanceKm ? `, ${stage1Metadata.locationMatchDistanceKm} km` : ''}`,
      source: stage1Metadata.contextSource,
    },
    {
      label: 'Stage 2 norm checks',
      value: stage2.normSourceLabel || stage2.normSource || 'Deterministic rule engine',
      sublabel: `Decision: ${cleanText(stage2.decision || data.verificationDecision?.decision)}`,
      source: stage2.normSource,
    },
    {
      label: 'Historical reliability',
      value: compactSourceLabel(historical.source),
      sublabel: `${historical.displayedCount ?? historical.casesFound ?? 0} displayed of ${historical.candidateCount ?? 0} candidates`,
      source: historical.source,
    },
    {
      label: 'Portfolio concentration',
      value: compactSourceLabel(portfolio.source),
      sublabel: `Risk: ${portfolioSummary.riskLevel || 'not available'}`,
      source: portfolio.source,
    },
    {
      label: 'AI underwriter summary',
      value: compactSourceLabel(aiSource),
      sublabel: underwriterSummary?.modelUsed ? `Model: ${underwriterSummary.modelUsed}` : 'Explanation only; no numeric scoring',
      source: aiSource,
    },
    {
      label: 'Visual evidence',
      value: compactSourceLabel(data.visualEvidence?.source || 'none'),
      sublabel: (() => {
        const ve = data.visualEvidence;
        if (!ve || ve.packetStatus === 'not_uploaded') return 'No visual evidence packet uploaded';
        if (ve.packetStatus === 'incomplete') return `Packet incomplete · ${(ve.missingCategories || []).length} required missing`;
        const effects = ve.deterministicEffects || {};
        const route = effects.inspectionRoute && effects.inspectionRoute !== 'none' ? ` · ${effects.inspectionRoute.replace(/_/g, ' ')}` : '';
        return `Packet complete · evidence ${effects.evidenceStrength || 'none'}${route}`;
      })(),
      source: data.visualEvidence?.source || 'none',
    },
  ];

  return (
    <div className="space-y-6">
      <SectionCard>
        <SectionHeader
          icon="fact_check"
          title="Audit Pack"
          eyebrow="Traceable outputs"
          description="Comprehensive trace of data sources and computational models for credit review and compliance."
          actions={(
            <div className="flex flex-wrap gap-2">
              <Badge tone={confidence >= 0.75 ? 'emerald' : confidence >= 0.55 ? 'amber' : 'red'}>
                Confidence {formatNumber(confidence, 2)}
              </Badge>
              <Badge tone={riskLevelTone(portfolioSummary.riskLevel)}>
                Portfolio {portfolioSummary.riskLevel || 'NA'}
              </Badge>
            </div>
          )}
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sourceCards.map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
                <Badge tone={sourceTone(item.source)}>{compactSourceLabel(item.source)}</Badge>
              </div>
              <p className="text-sm font-extrabold leading-snug text-slate-900">{cleanText(item.value)}</p>
              <p className="mt-1 text-[12px] font-semibold leading-snug text-slate-500">{cleanText(item.sublabel)}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6">
        <SectionCard>
          <SectionHeader
            icon="query_stats"
            title="Confidence And Review Inputs"
            eyebrow="Underwriter view"
            description="Shows how available evidence affected confidence and what must be checked before approval."
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="mb-3 text-sm font-bold text-slate-900">Confidence contributors</h4>
              <div className="space-y-3">
                {confidenceRows(data).map(([label, value]) => (
                  <div key={label}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-[12px] font-bold text-slate-600">
                      <span>{label}</span>
                      <span>{formatNumber(value, 2)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.min(Math.abs(Number(value)) * 100, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="mb-3 text-sm font-bold text-slate-900">Evidence checklist</h4>
              <div className="space-y-2">
                {evidence.map((item, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="material-symbols-outlined mt-0.5 text-[16px] text-amber-500">task_alt</span>
                    <p className="text-sm font-semibold leading-snug text-slate-700">{cleanText(item)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard>
        <SectionHeader
          icon="flag"
          title="Open Review Flags"
          eyebrow={`${flags.length} active`}
          description="The audit pack favors explicit review gates over silent confidence reduction."
        />
        {flags.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {flags.map((flag, index) => (
              <div key={index} className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold leading-relaxed text-amber-950">
                {cleanText(flag)}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No active review flags" description="The current case has no non-protective Stage 2 or portfolio flags." />
        )}
      </SectionCard>
    </div>
  );
}
