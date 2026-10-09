import React from 'react';
import { cleanText, formatNumber, formatPercent } from '../ui/DashboardPrimitives';

const fmtDeltaPct = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return '0.0%';
  const pct = numeric * 100;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
};

const fmtScore = (value, digits = 2) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'NA';
};

const asArray = (value) => Array.isArray(value) ? value : [];

function recommendedLtv(data) {
  const value = data?.portfolioRiskSummary?.portfolioSummary?.recommendedLtv;
  return Number.isFinite(Number(value)) ? formatPercent(value) : `${data?.ltv ?? 'NA'}${Number.isFinite(data?.ltv) ? '%' : ''}`;
}

function decisionLabel(data) {
  return data?.verificationDecision?.label
    || cleanText(data?.verificationDecision?.decision || data?.stage2Output?.decision || 'Review');
}

function Page({ children, title, eyebrow, meta }) {
  return (
    <section className="report-page">
      <header className="mb-5 flex items-start justify-between gap-6 border-b border-slate-200 pb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-600">{eyebrow || 'PropIntel collateral intelligence'}</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{title}</h2>
        </div>
        {meta && <div className="text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">{meta}</div>}
      </header>
      {children}
    </section>
  );
}

function Section({ title, children, className = '' }) {
  return (
    <section className={`report-section ${className}`}>
      <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-extrabold uppercase tracking-wider text-slate-700">{title}</h3>
      {children}
    </section>
  );
}

function KeyValue({ label, value, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50',
    indigo: 'border-indigo-100 bg-indigo-50',
    emerald: 'border-emerald-100 bg-emerald-50',
    amber: 'border-amber-100 bg-amber-50',
    red: 'border-red-100 bg-red-50',
  }[tone] || 'border-slate-200 bg-slate-50';
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-extrabold leading-snug text-slate-950">{cleanText(value)}</p>
    </div>
  );
}

function SimpleTable({ columns, rows, emptyText }) {
  if (!rows.length) return <p className="text-sm font-semibold text-slate-500">{emptyText || 'No records available.'}</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-left text-[11px]">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="p-2 font-bold uppercase tracking-wider">{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id || rowIndex} className="border-t border-slate-200 align-top">
              {columns.map((column) => (
                <td key={column.key} className="p-2 font-semibold leading-snug text-slate-700">
                  {column.render ? column.render(row) : cleanText(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventTable({ events }) {
  return (
    <SimpleTable
      emptyText="No locality events returned for this case."
      columns={[
        { key: 'eventType', label: 'Detected event', render: (e) => (
          <div>
            <p className="font-extrabold text-slate-900">{cleanText(e.detectedEvent || e.eventType).replace(/_/g, ' ')}</p>
            <p className="mt-1 text-slate-500">{cleanText(e.summary || e.title)}</p>
          </div>
        ) },
        { key: 'locality', label: 'Locality evidence', render: (e) => (
          <div className="font-mono">
            <p>match {fmtScore(e.localityMatchScore ?? e.localityRelevance, 2)}</p>
            <p>{e.distanceToPropertyLabel || (Number.isFinite(Number(e.distanceToPropertyKm)) ? `${Number(e.distanceToPropertyKm).toFixed(2)} km` : 'not localized')}</p>
          </div>
        ) },
        { key: 'valuationRelevanceScore', label: 'Property relevance', render: (e) => (
          <div>
            <p className="font-mono font-extrabold text-slate-950">{fmtScore(e.valuationRelevanceScore, 4)}</p>
            <p className="mt-1 text-slate-500">{cleanText(e.impactReason)}</p>
          </div>
        ) },
        { key: 'impact', label: 'Final adjustment', render: (e) => (
          <div className="font-mono">
            <p>Liq {fmtDeltaPct(e.liquidityDelta)}</p>
            <p>Mkt {fmtDeltaPct(e.marketabilityDelta)}</p>
            <p>Conf {fmtScore(e.confidenceDelta, 3)}</p>
            <p>TTL {fmtDeltaPct(e.timeToLiquidateDeltaPct)}</p>
          </div>
        ) },
      ]}
      rows={events}
    />
  );
}

export default function ReportPanel({ data, underwriterSummary }) {
  if (!data) return null;

  const stage1 = data.stage1 || {};
  const profile = stage1.normalizedPropertyProfile || {};
  const stage2 = data.stage2Output || {};
  const locality = data.localityIntelligence || {};
  const portfolio = data.portfolioRiskSummary || {};
  const portfolioSummary = portfolio.portfolioSummary || {};
  const historical = data.historicalCaseSummary || {};
  const visual = data.visualEvidence || {};
  const visualEffects = visual.deterministicEffects || {};
  const reportDate = new Date().toLocaleString('en-IN');

  const activeFlags = [
    ...asArray(stage2.flags).filter((flag) => !flag?.protective).map((flag) => cleanText(flag.title || flag.explanation || flag.text || flag)),
    ...asArray(portfolio.riskFlags).map((flag) => `Portfolio: ${cleanText(flag)}`),
    ...asArray(locality.riskFlags).map((flag) => `Locality: ${cleanText(flag).replace(/_/g, ' ')}`),
    ...asArray(visual.visualSignals).filter((signal) => signal.accepted).map((signal) => `Visual: ${cleanText(signal.label || signal.id)}`),
  ].filter(Boolean);

  const handlePrint = () => window.print();

  return (
    <div className="space-y-5">
      <div className="no-print rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600">Final report generator</p>
            <h3 className="mt-1 text-xl font-extrabold text-slate-950">Industry Collateral Report</h3>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Multi-page collateral report for credit committee, audit, and compliance review. Click Generate PDF to save.
            </p>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="group relative inline-flex items-center justify-center gap-3 rounded-xl bg-indigo-600 px-8 py-4 text-lg font-black tracking-wide text-white shadow-lg transition-all duration-300 hover:bg-indigo-700 hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0"
          >
            <span className="material-symbols-outlined text-[24px] transition-transform group-hover:scale-110">picture_as_pdf</span>
            Generate PDF Report
          </button>
        </div>
      </div>

      <article className="ps-report-print hidden print:block rounded-xl border border-slate-200 bg-white shadow-sm">
        <Page title="Secured Lending Valuation Report" meta={reportDate}>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-700">Executive credit memo</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{cleanText(data.caseDetails?.address || profile.address)}</h1>
            <p className="mt-3 text-sm font-semibold leading-7 text-slate-700">
              {cleanText(underwriterSummary?.summary?.executiveSummary || 'The case has been evaluated through deterministic valuation, verification, locality intelligence, visual evidence, historical reliability, and portfolio concentration engines.')}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KeyValue label="Decision" value={decisionLabel(data)} tone="indigo" />
            <KeyValue label="Market value" value={data.marketValue} />
            <KeyValue label="Distress value" value={data.distressValue} />
            <KeyValue label="Recommended LTV" value={recommendedLtv(data)} />
            <KeyValue label="Liquidity score" value={`${data.PropIntel ?? 'NA'}/100`} />
            <KeyValue label="Confidence" value={formatNumber(data.confidence, 2)} />
            <KeyValue label="Time to liquidate" value={data.timeToSell} />
            <KeyValue label="Portfolio risk" value={portfolioSummary.riskLevel || 'NA'} />
          </div>

          <Section title="Required review actions" className="mt-5">
            {activeFlags.length ? (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {activeFlags.slice(0, 8).map((flag, index) => (
                  <div key={index} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-relaxed text-amber-950">
                    {flag}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-semibold text-slate-500">No active non-protective review flags.</p>
            )}
          </Section>
        </Page>

        <Page title="Property, Location, And Valuation Basis" meta="Stage 1 + valuation">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Section title="Property profile">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <KeyValue label="Address" value={data.caseDetails?.address || profile.address} />
                <KeyValue label="Asset type" value={data.caseDetails?.type || profile.propertyType} />
                <KeyValue label="Subtype/config" value={data.caseDetails?.config || data.caseDetails?.subtype || profile.subtype} />
                <KeyValue label="Area" value={`${data.caseDetails?.area || profile.sizeSqft || 'NA'} sqft`} />
                <KeyValue label="Age" value={data.caseDetails?.age || profile.ageBucket} />
                <KeyValue label="Legal/title" value={profile.legalStatus || profile.titleClarity || 'Not provided'} />
              </div>
            </Section>

            <Section title="Location bucket">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <KeyValue label="Micro-market" value={stage1.bucketAssignment?.microMarketBucket?.label} />
                <KeyValue label="Micro-market id" value={stage1.bucketAssignment?.microMarketBucket?.id} />
                <KeyValue label="Coarse zone" value={stage1.bucketAssignment?.coarseBucket?.label} />
                <KeyValue label="Circle rate zone" value={stage1.bucketAssignment?.coarseBucket?.circleRateZone || stage1.bucketAssignment?.coarseBucket?.id} />
                <KeyValue label="Liquidity norm" value={stage1.bucketAssignment?.microMarketBucket?.liquidityNorm} />
                <KeyValue label="Access quality" value={stage1.hyperlocalContext?.accessQuality || data.hyperlocalContext?.summary?.accessQuality} />
              </div>
            </Section>
          </div>

          <Section title="Valuation and liquidity outputs" className="mt-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <KeyValue label="Market range" value={data.marketValue} />
              <KeyValue label="Distress range" value={data.distressValue} />
              <KeyValue label="RPI / PropIntel" value={`${data.PropIntel ?? 'NA'}/100`} />
              <KeyValue label="Time to sell" value={data.timeToSell} />
              <KeyValue label="Effective circle rate" value={data.effectiveCircleRate ? `INR ${Number(data.effectiveCircleRate).toLocaleString('en-IN')}/sqft` : 'NA'} />
            </div>
          </Section>

          <Section title="Key valuation drivers" className="mt-5">
            <SimpleTable
              emptyText="No driver rows available."
              columns={[
                { key: 'name', label: 'Driver' },
                { key: 'impact', label: 'Impact' },
                { key: 'direction', label: 'Direction', render: (r) => r.positive ? 'Positive' : 'Negative' },
              ]}
              rows={asArray(data.drivers)}
            />
          </Section>
        </Page>

        <Page title="Verification, Confidence, And Evidence Controls" meta="Stage 2">
          <Section title="Verification decision">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KeyValue label="Decision" value={decisionLabel(data)} tone="indigo" />
              <KeyValue label="Data sufficiency" value={fmtScore(stage2.scores?.dataSufficiencyScore ?? stage2.dataSufficiencyScore, 2)} />
              <KeyValue label="Anomaly score" value={fmtScore(stage2.scores?.anomalyScore ?? stage2.anomalyScore, 2)} />
              <KeyValue label="Suspicion score" value={fmtScore(stage2.scores?.suspicionScore ?? stage2.suspicionScore, 2)} />
            </div>
          </Section>

          <Section title="Verification checks" className="mt-5">
            <SimpleTable
              emptyText="No verification table returned."
              columns={[
                { key: 'label', label: 'Check', render: (r) => cleanText(r.label || r.title || r.id) },
                { key: 'status', label: 'Status', render: (r) => cleanText(r.status || r.result || r.severity) },
                { key: 'detail', label: 'Explanation', render: (r) => cleanText(r.detail || r.explanation || r.text) },
              ]}
              rows={asArray(stage2.evaluationRows || stage2.evaluationTable || stage2.flags)}
            />
          </Section>

          <Section title="Confidence composition" className="mt-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {Object.entries(data.confidenceBreakdown || {}).map(([key, value]) => (
                <KeyValue key={key} label={key.replace(/([A-Z])/g, ' $1')} value={fmtScore(value, 3)} />
              ))}
            </div>
          </Section>
        </Page>

        <Page title="Property-Impact Locality Intelligence" meta={`${locality.acceptedEvents || 0} detected`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KeyValue label="Detected events" value={locality.acceptedEvents ?? locality.eventsFound ?? 0} />
            <KeyValue label="Property-impact events" value={locality.propertyImpactEvents || 0} tone="emerald" />
            <KeyValue label="Zero-impact context" value={Math.max(0, (locality.acceptedEvents || 0) - (locality.propertyImpactEvents || 0))} />
            <KeyValue label="Liquidity delta" value={fmtDeltaPct(locality.liquidityDelta)} />
            <KeyValue label="Inspection route" value={(locality.inspectionRoute || 'none').replace(/_/g, ' ')} />
          </div>

          <Section title="Event detection versus valuation relevance" className="mt-5">
            <EventTable events={asArray(locality.events)} />
          </Section>

          <Section title="Source and corroboration quality" className="mt-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SimpleTable
                columns={[
                  { key: 'sourceName', label: 'Source' },
                  { key: 'status', label: 'Status' },
                  { key: 'documentsFetched', label: 'Docs' },
                ]}
                rows={asArray(locality.sourceStatuses)}
                emptyText="No source status records."
              />
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(locality.corroborationCounts || {}).map(([key, value]) => (
                  <KeyValue key={key} label={key.replace(/_/g, ' ')} value={value} />
                ))}
              </div>
            </div>
          </Section>
        </Page>

        <Page title="Visual, Historical, And Portfolio Evidence" meta="Supporting engines">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Section title="Visual collateral evidence">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <KeyValue label="Packet status" value={visual.packetStatus || 'not uploaded'} />
                <KeyValue label="Processing source" value={visual.source || data.visualAudit?.source || 'none'} />
                <KeyValue label="Metadata trust" value={visual.metadataTrust?.sourceTrustLevel || 'not available'} />
                <KeyValue label="GPS match" value={visual.metadataTrust?.gpsMatchStatus || 'unknown'} />
                <KeyValue label="Confidence delta" value={fmtScore(visualEffects.confidenceDelta, 3)} />
                <KeyValue label="Inspection route" value={(visualEffects.inspectionRoute || 'none').replace(/_/g, ' ')} />
              </div>
            </Section>

            <Section title="Portfolio concentration">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <KeyValue label="Risk level" value={portfolioSummary.riskLevel || 'NA'} />
                <KeyValue label="Risk score" value={portfolioSummary.portfolioRiskScore} />
                <KeyValue label="Recommended LTV" value={recommendedLtv(data)} />
                <KeyValue label="LTV adjustment" value={fmtDeltaPct(portfolioSummary.ltvAdjustmentPct)} />
                <KeyValue label="Review" value={portfolioSummary.reviewRecommendation} />
                <KeyValue label="Senior review" value={portfolio.decisionImpact?.seniorReviewRequired ? 'Required' : 'Not required'} />
              </div>
            </Section>
          </div>

          <Section title="Historical reliability cases" className="mt-5">
            <SimpleTable
              columns={[
                { key: 'caseId', label: 'Case', render: (r) => cleanText(r.caseId || r.historical_case_id || r.historicalCaseId) },
                { key: 'similarityScore', label: 'Similarity', render: (r) => fmtScore(r.similarityScore, 2) },
                { key: 'confidenceContribution', label: 'Confidence', render: (r) => fmtScore(r.confidenceContribution, 3) },
                { key: 'outcomeSummary', label: 'Outcome', render: (r) => cleanText(r.outcomeSummary || r.outcome?.summary || r.default_status) },
              ]}
              rows={asArray(historical.similarCases || historical.cases)}
              emptyText="No historical case rows displayed."
            />
          </Section>

          <Section title="Portfolio risk lenses" className="mt-5">
            <SimpleTable
              columns={[
                { key: 'label', label: 'Lens' },
                { key: 'value', label: 'Value', render: (r) => cleanText(r.value ?? r.currentValue ?? r.exposureShare) },
                { key: 'signal', label: 'Signal' },
                { key: 'explanation', label: 'Explanation', render: (r) => cleanText(r.explanation || r.reason) },
              ]}
              rows={asArray(portfolio.riskLenses)}
              emptyText="No portfolio risk lenses returned."
            />
          </Section>
        </Page>

        <Page title="Audit Trail And Model-Risk Boundary" meta="Traceability">
          <Section title="AI underwriter narrative">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold leading-7 text-slate-700">
                {cleanText(underwriterSummary?.summary?.detailedRationale || underwriterSummary?.summary?.executiveSummary || 'AI summary unavailable. Deterministic outputs remain valid.')}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <KeyValue label="AI source" value={underwriterSummary?.source || 'pending'} />
                <KeyValue label="Model" value={underwriterSummary?.modelUsed || 'not available'} />
                <KeyValue label="Quality" value={underwriterSummary?.summaryQuality || 'pending'} />
              </div>
            </div>
          </Section>

          <Section title="Recommended evidence" className="mt-5">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {asArray(underwriterSummary?.summary?.recommendedEvidence).length ? (
                asArray(underwriterSummary.summary.recommendedEvidence).map((item, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">{cleanText(item)}</div>
                ))
              ) : (
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">Confirm ownership, title, area evidence, and field verification packet.</div>
              )}
            </div>
          </Section>

          <Section title="Locality audit trail" className="mt-5">
            <SimpleTable
              columns={[
                { key: 'ruleId', label: 'Rule' },
                { key: 'source', label: 'Source' },
                { key: 'effect', label: 'Effect' },
                { key: 'explanation', label: 'Explanation' },
              ]}
              rows={asArray(locality.auditTrail).slice(0, 16)}
              emptyText="No locality audit records."
            />
          </Section>

          <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-sm font-semibold leading-7 text-slate-700">
            Numeric scores, valuation ranges, LTV recommendations, risk flags, and locality valuation adjustments are deterministic. Ollama/AI is used only to explain already-computed outputs and recommend evidence. Broad city-level events are retained as detected context but do not affect valuation unless property relevance is established.
          </div>
        </Page>
      </article>
    </div>
  );
}
