import React from 'react';

const SIGNAL_CLASS = {
  Safe: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Watch: 'bg-amber-50 text-amber-700 border-amber-200',
  High: 'bg-orange-50 text-orange-700 border-orange-200',
  Critical: 'bg-red-50 text-red-700 border-red-200',
  Unavailable: 'bg-slate-50 text-slate-600 border-slate-200'
};

const RISK_CLASS = {
  Low: SIGNAL_CLASS.Safe,
  Moderate: SIGNAL_CLASS.Watch,
  High: SIGNAL_CLASS.High,
  Critical: SIGNAL_CLASS.Critical,
  Unavailable: SIGNAL_CLASS.Unavailable
};

function formatCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Not available';
  if (numeric >= 10000000) return `INR ${(numeric / 10000000).toFixed(2)} Cr`;
  if (numeric >= 100000) return `INR ${(numeric / 100000).toFixed(1)} L`;
  return `INR ${Math.round(numeric).toLocaleString('en-IN')}`;
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Not available';
  return `${(numeric * 100).toFixed(1)}%`;
}

function formatLtv(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Not available';
  return `${(numeric * 100).toFixed(0)}%`;
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'Not available';
  return value;
}

function SummaryMetric({ label, value }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-mono font-bold text-slate-800">{value}</p>
    </div>
  );
}

function SignalBadge({ signal }) {
  return (
    <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-widest border ${SIGNAL_CLASS[signal] || SIGNAL_CLASS.Unavailable}`}>
      {displayValue(signal)}
    </span>
  );
}

function RiskLensCards({ riskLenses }) {
  if (!riskLenses?.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
        Portfolio concentration data unavailable. Single-case assessment still available.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {riskLenses.map((lens) => {
        const share = Number(lens.postLoanShare) || 0;
        const cap = Number(lens.policyCap) || 0;
        const capUsage = cap > 0 ? Math.min(100, (share / cap) * 100) : 0;
        return (
          <div key={lens.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-800">{lens.label}</p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{lens.explanation}</p>
              </div>
              <SignalBadge signal={lens.signal} />
            </div>
            {lens.id !== 'similar_bucket_performance' && (
              <>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs font-bold text-slate-500">
                    <span>Policy capacity used after approval</span>
                    <span>{formatPercent(share)} / {formatPercent(cap)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div className={`h-full rounded-full ${capUsage >= 100 ? 'bg-red-500' : capUsage >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${capUsage}%` }} />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-semibold text-slate-600">
                  <div><p className="text-slate-400">Current book</p><p>{formatCurrency(lens.currentExposure)} ({formatPercent(lens.currentShare)})</p></div>
                  <div><p className="text-slate-400">After this case</p><p>{formatCurrency(lens.postLoanExposure)} ({formatPercent(lens.postLoanShare)})</p></div>
                </div>
              </>
            )}
            {lens.delinquencyRate !== undefined && (
              <p className="mt-3 text-xs font-semibold text-slate-500">
                Delinquency {formatPercent(lens.delinquencyRate)} / Default {formatPercent(lens.defaultRate)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PortfolioRiskSection({ portfolioRiskSummary }) {
  if (!portfolioRiskSummary) return null;

  const summary = portfolioRiskSummary.portfolioSummary || {};
  const source = portfolioRiskSummary.source === 'sqlite_portfolio_exposure'
    ? 'SQLite portfolio_exposure'
    : 'Unavailable';

  return (
    <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-indigo-500">account_balance</span>
            <h3 className="text-lg font-headline font-bold text-slate-800">Portfolio-Aware Collateral Risk</h3>
            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded font-mono border border-indigo-100">PORTFOLIO_LAYER</span>
          </div>
          <p className="text-sm text-slate-500 font-medium">
            How much of this risk do we already hold? This layer checks whether approving this case would increase exposure to the same micro-market, asset type, or low-liquidity collateral cluster.
          </p>
        </div>
        <div className="flex flex-wrap lg:justify-end gap-2">
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest border bg-slate-50 text-slate-600 border-slate-200">
            Source: {source}
          </span>
          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest border ${RISK_CLASS[summary.riskLevel] || RISK_CLASS.Unavailable}`}>
            Risk level: {displayValue(summary.riskLevel)}
          </span>
        </div>
      </div>

      {portfolioRiskSummary.source !== 'sqlite_portfolio_exposure' && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] font-semibold text-slate-600">
          Portfolio concentration data unavailable. Single-case assessment still available.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <SummaryMetric label="Risk score" value={`${summary.portfolioRiskScore ?? 0}/100`} />
        <SummaryMetric label="Proposed exposure" value={formatCurrency(summary.proposedExposure)} />
        <SummaryMetric label="Recommended LTV" value={formatLtv(summary.recommendedLtv)} />
        <SummaryMetric label="Review" value={portfolioRiskSummary.decisionImpact?.seniorReviewRequired ? 'Senior review' : 'Standard'} />
      </div>

      <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
        <p className="text-xs text-indigo-500 font-bold uppercase tracking-wider mb-1">Review recommendation</p>
        <p className="text-sm font-semibold text-indigo-900">{displayValue(summary.reviewRecommendation)}</p>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] font-semibold leading-relaxed text-slate-600">
        Historical reliability measures past performance. Portfolio risk measures current exposure concentration.
        {summary.riskLevel === 'Moderate' && portfolioRiskSummary.decisionImpact?.seniorReviewRequired && (
          <span> Overall risk is moderate, but senior review is triggered because a specific exposure lens breaches an internal cap.</span>
        )}
      </div>

      <RiskLensCards riskLenses={portfolioRiskSummary.riskLenses || []} />

      {portfolioRiskSummary.riskFlags?.length > 0 && (
        <div className="mt-5">
          <h4 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">Portfolio Risk Flags</h4>
          <div className="flex flex-wrap gap-2">
            {portfolioRiskSummary.riskFlags.map((flag) => (
              <span key={flag} className="px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600">
                {flag}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
