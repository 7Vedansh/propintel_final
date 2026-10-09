import React from 'react';
import ConfidenceBreakdownBar from '../ui/ConfidenceBreakdownBar';
import ValuationLiquiditySection from './ValuationLiquiditySection';
import PortfolioRiskSection from './PortfolioRiskSection';
import HistoricalReliabilitySection from './HistoricalReliabilitySection';

export default function RiskValuationPanel({ data }) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      
      {/* Valuation Engine */}
      <ValuationLiquiditySection data={data} />

      {/* Confidence Composition */}
      {data.confidenceBreakdown && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-4 text-sm font-bold text-slate-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-500">verified</span>
            Confidence Composition
          </h4>
          <ConfidenceBreakdownBar
            breakdown={data.confidenceBreakdown}
            total={Number(data.confidence)}
          />
        </div>
      )}

      {/* Portfolio Risk Engine */}
      <PortfolioRiskSection portfolioRiskSummary={data.portfolioRiskSummary} />

      {/* Historical Cases Engine */}
      <HistoricalReliabilitySection historicalCaseSummary={data.historicalCaseSummary} />

    </div>
  );
}
