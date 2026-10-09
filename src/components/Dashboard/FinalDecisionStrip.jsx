import React from 'react';
import { Badge, formatPercent } from '../ui/DashboardPrimitives';
import { buildDecisionMemo } from '../../lib/decisionMemo';

export default function FinalDecisionStrip({ data, underwriterSummary }) {
  if (!data) return null;
  const recommendedLtv = data.portfolioRiskSummary?.portfolioSummary?.recommendedLtv
    ? formatPercent(data.portfolioRiskSummary.portfolioSummary.recommendedLtv)
    : `${data.ltv ?? 'Not available'}${Number.isFinite(data.ltv) ? '%' : ''}`;
  const memo = buildDecisionMemo(data, underwriterSummary);

  return (
    <div className="sticky bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone={memo.tone}>{memo.action}</Badge>
            <Badge tone="slate">Recommended LTV: {recommendedLtv}</Badge>
            <Badge tone="slate">Route: {memo.reviewRoute}</Badge>
          </div>
          <p className="text-sm font-semibold leading-relaxed text-slate-700">
            {memo.primaryReason} {memo.conditions[0] ? `Next: ${memo.conditions[0]}` : 'Proceed with standard documentation checks.'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-bold uppercase tracking-wider text-slate-500">
          Decision memo
        </div>
      </div>
    </div>
  );
}
