import React from 'react';
import { Badge, cleanText, formatNumber, formatPercent, FormulaTooltip } from '../ui/DashboardPrimitives';

function getDecisionTone(decision = '') {
  if (decision.includes('REJECT')) return 'red';
  if (decision.includes('MANUAL')) return 'orange';
  if (decision.includes('PENALTY')) return 'amber';
  if (decision.includes('WARNING')) return 'amber';
  return 'emerald';
}

function getPrimaryAction(data) {
  const decision = data?.verificationDecision?.decision || data?.stage2Output?.decision || '';
  if (decision.includes('REJECT')) return 'Do not proceed';
  if (decision.includes('MANUAL')) return 'Manual review required';
  if (decision.includes('PENALTY') || decision.includes('WARNING')) return 'Proceed with conditions';
  return 'Proceed to underwriting';
}

function getMicroMarket(data) {
  return data?.stage1?.bucketAssignment?.microMarketBucket?.label
    || data?.microMarket?.name
    || data?.microMarket?.label
    || 'Micro-market not available';
}

function getPortfolioRisk(data) {
  return data?.portfolioRiskSummary?.portfolioSummary?.riskLevel || 'Not available';
}

function getHistoricalSignal(data) {
  return data?.historicalCaseSummary?.overallSignal || 'Not available';
}

export default function CaseHeader({ data, aiStatus }) {
  if (!data) return null;

  const caseDetails = data.caseDetails || {};
  const decision = data.verificationDecision?.decision || data.stage2Output?.decision || 'REVIEW';
  const decisionLabel = data.verificationDecision?.label || cleanText(decision).replace(/_/g, ' ');
  const decisionTone = getDecisionTone(decision);
  const recommendedLtv = data.portfolioRiskSummary?.portfolioSummary?.recommendedLtv
    ? formatPercent(data.portfolioRiskSummary.portfolioSummary.recommendedLtv)
    : `${data.ltv ?? 'Not available'}${Number.isFinite(data.ltv) ? '%' : ''}`;

  const headerMetrics = [
    { 
      label: 'Market value', 
      value: data.marketValue, 
      icon: 'payments',
      formula: 'Market Value = (Builtup Area × Base Circle Rate) × (1 + Liquidity Premium + Marketability Premium)\n\n*Deterministic derived from local registry + mapped micro-market norms.',
      tooltipAlign: 'left'
    },
    { 
      label: 'Recommended LTV', 
      value: recommendedLtv, 
      icon: 'account_balance',
      formula: 'LTV Cap = Base Policy Cap (80%) - Portfolio Exposure Penalty - High Volatility Deduction',
      tooltipAlign: 'center'
    },
    { 
      label: 'Confidence', 
      value: formatNumber(data.confidence, 2), 
      icon: 'verified',
      formula: 'Confidence = Base (0.60) + Data Sufficiency (0.15) + Recency (0.10) + Verification (0.15) - High Variance Penalty',
      tooltipAlign: 'center'
    },
    { 
      label: 'Portfolio risk', 
      value: getPortfolioRisk(data), 
      icon: 'account_tree',
      formula: 'Exposure Risk = (Proposed Loan / Total Active Book) vs Sector Limit Cap',
      tooltipAlign: 'right'
    },
  ];

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-indigo-50 via-white to-cyan-50 p-5 md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-indigo-100 bg-white px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-indigo-700">
                Collateral case
              </span>
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-700">
                {decisionLabel}
              </span>
            </div>
            <h2 className="max-w-5xl break-words text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">
              {cleanText(caseDetails.address || data.stage1?.normalizedPropertyProfile?.address)}
            </h2>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-slate-500">
              <span>Micro-market <span className="text-slate-900">{cleanText(getMicroMarket(data))}</span></span>
              <span>Asset <span className="text-slate-900">{cleanText(caseDetails.type)} / {cleanText(caseDetails.config || caseDetails.subtype)}</span></span>
              <span>Area <span className="text-slate-900">{cleanText(caseDetails.area)} sqft</span></span>
            </div>
          </div>

          <div className="rounded-lg border border-indigo-100 bg-white/80 p-4 xl:min-w-[320px]">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Recommended action</p>
            <p className="mt-2 text-xl font-bold text-slate-950">{getPrimaryAction(data)}</p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
              Based on verified deterministic scoring across all assessment dimensions.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 border-t border-slate-200 bg-white md:grid-cols-2 xl:grid-cols-4">
        {headerMetrics.map((metric) => (
          <div key={metric.label} className="border-b border-slate-200 p-4 md:border-r xl:border-b-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                {metric.label}
                {metric.formula && <FormulaTooltip formula={metric.formula} align={metric.tooltipAlign} />}
              </p>
              <span className="material-symbols-outlined text-[18px] text-slate-400">{metric.icon}</span>
            </div>
            <p className="break-words text-lg font-extrabold leading-tight text-slate-950">{cleanText(metric.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
