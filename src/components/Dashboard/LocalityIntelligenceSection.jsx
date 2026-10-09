import React, { useState } from 'react';

const STATUS_LABEL = {
  completed: 'Live scan completed',
  completed_no_accepted_events: 'Live scan completed — no accepted events',
  cached_baseline: 'Validated locality baseline',
  baseline_context: 'Location context retained',
  live_unavailable_cached: 'Live unavailable — cached official + media events shown',
  live_unavailable_no_cached_events: 'No locality events available',
  partial: 'Partial live scan',
};
const STATUS_TONE = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed_no_accepted_events: 'bg-slate-50 text-slate-600 border-slate-200',
  cached_baseline: 'bg-slate-50 text-slate-700 border-slate-200',
  baseline_context: 'bg-amber-50 text-amber-700 border-amber-200',
  live_unavailable_cached: 'bg-amber-50 text-amber-700 border-amber-200',
  live_unavailable_no_cached_events: 'bg-slate-50 text-slate-600 border-slate-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
};
const SOURCE_STATUS_TONE = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  skipped: 'bg-slate-50 text-slate-600 border-slate-200',
};
const TIER_TONE = {
  official: 'bg-slate-50 text-slate-700 border-slate-200',
  reputed_media: 'bg-sky-50 text-sky-700 border-sky-200',
  local_media: 'bg-slate-50 text-slate-600 border-slate-200',
};
const TIER_LABEL = {
  official: 'Official',
  reputed_media: 'Reputed Media',
  local_media: 'Local Media',
};
const CORROBORATION_TONE = {
  official_plus_media: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  official_only: 'bg-slate-50 text-slate-700 border-slate-200',
  media_corroborated: 'bg-sky-50 text-sky-700 border-sky-200',
  media_only: 'bg-amber-50 text-amber-700 border-amber-200',
  local_media_only: 'bg-slate-50 text-slate-600 border-slate-200',
  unconfirmed: 'bg-slate-50 text-slate-500 border-slate-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};
const CORROBORATION_LABEL = {
  official_plus_media: 'Official + Media',
  official_only: 'Official Confirmed',
  media_corroborated: 'Media Corroborated',
  media_only: 'Media-only Watchlist',
  local_media_only: 'Local Media Watchlist',
  unconfirmed: 'Unconfirmed',
  rejected: 'Rejected',
};
const DIRECTION_TONE = {
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  negative: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
};
const ROUTE_LABEL = {
  none: 'No inspection required',
  field_officer_review: 'Field Officer Review',
  technical_valuer_inspection: 'Technical Valuer Inspection',
  legal_review: 'Legal Review',
  senior_credit_review: 'Senior Credit Review',
  structural_engineer_inspection: 'Structural Engineer Inspection',
};
const ROUTE_TONE = {
  none: 'bg-slate-50 text-slate-600 border-slate-200',
  field_officer_review: 'bg-amber-50 text-amber-700 border-amber-200',
  technical_valuer_inspection: 'bg-amber-50 text-amber-700 border-amber-200',
  legal_review: 'bg-red-50 text-red-700 border-red-200',
  senior_credit_review: 'bg-amber-50 text-amber-700 border-amber-200',
  structural_engineer_inspection: 'bg-red-50 text-red-700 border-red-200',
};

const fmtSigned = (v, digits = 4) => {
  if (!Number.isFinite(Number(v)) || Number(v) === 0) return '0.0000';
  const n = Number(v);
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;
};
const fmtSignedPct = (v) => {
  if (!Number.isFinite(Number(v)) || Number(v) === 0) return '0.0%';
  const n = Number(v) * 100;
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
};
const fmtScore = (v, digits = 2) => {
  if (!Number.isFinite(Number(v))) return 'NA';
  return Number(v).toFixed(digits);
};

function isCached(li) {
  return ['live_unavailable_cached', 'cached_baseline'].includes(li?.status);
}

const REJECTION_LABEL = {
  weak_locality_relevance: 'Weak locality relevance',
  low_confidence: 'Low confidence',
  missing_evidence_quote: 'Missing evidence quote',
  irrelevant_event_type: 'Irrelevant event type',
  unsupported_source: 'Unsupported source',
  other: 'Other',
};

function RelevanceMeter({ value }) {
  const score = Math.max(0, Math.min(1, Number(value) || 0));
  const tone = score >= 0.35 ? 'bg-emerald-500' : score >= 0.12 ? 'bg-amber-500' : 'bg-slate-300';
  return (
    <div className="min-w-[120px]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Valuation relevance</span>
        <span className="font-mono text-[11px] font-bold text-slate-700">{fmtScore(score, 3)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${score * 100}%` }} />
      </div>
    </div>
  );
}

export default function LocalityIntelligenceSection({ localityIntelligence }) {
  const [auditOpen, setAuditOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState(new Set());

  const toggleEvent = (idx) => {
    const next = new Set(expandedEvents);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setExpandedEvents(next);
  };

  if (!localityIntelligence) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span aria-hidden="true" className="material-symbols-outlined text-slate-500 text-[22px]">public</span>
          <h3 className="text-lg font-bold text-slate-900">Property-Impact Locality Intelligence</h3>
        </div>
        <p className="text-sm font-semibold text-slate-500">
          Locality intelligence unavailable — backend did not return a payload. Core valuation is unaffected.
        </p>
      </section>
    );
  }

  const li = localityIntelligence;
  const status = li.status || 'live_unavailable_no_cached_events';
  const cached = isCached(li);
  const events = li.events || [];
  const accepted = events.filter((e) => e.accepted);
  const ignored = events.filter((e) => !e.accepted);
  const sources = li.sourceStatuses || [];
  const tierCounts = li.sourceTierCounts || { official: 0, reputed_media: 0, local_media: 0 };
  const corrCounts = li.corroborationCounts || {};
  const watchlist = li.watchlistSignals || [];
  const baselineOnly = status === 'baseline_context';
  const propertyImpactEvents = li.propertyImpactEvents ?? accepted.filter((e) => e.valuationImpactEligible).length;
  const detectedNoImpact = Math.max(0, accepted.length - propertyImpactEvents);

  return (
    <section className="space-y-6">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span aria-hidden="true" className="material-symbols-outlined text-slate-500 text-[22px]">public</span>
              <h3 className="text-lg font-bold text-slate-900">Property-Impact Locality Intelligence</h3>
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500">OPTIONAL</span>
            </div>
            <p className="max-w-3xl text-sm font-medium leading-relaxed text-slate-500">
              Live scan of whitelisted official and reputed media sources for locality-level infrastructure, development, and risk signals.
              Media-only signals are treated as lower-trust watchlist signals. Events affect liquidity, confidence, and review routing only — not base market value.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${STATUS_TONE[status] || STATUS_TONE.live_unavailable_no_cached_events}`}>
              {STATUS_LABEL[status] || status}
            </span>
            {cached && (
              <span className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border bg-amber-50 text-amber-700 border-amber-200">
                Cached
              </span>
            )}
            {baselineOnly && (
              <span className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border bg-amber-50 text-amber-700 border-amber-200">
                Zero event impact
              </span>
            )}
            {li.runMode && (
              <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                li.runMode === 'live' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {li.runMode === 'live' ? 'Live run' : 'Cache run'}
              </span>
            )}
            {li.capPolicy?.band && (
              <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                li.capPolicy.relaxPositiveCaps
                  ? 'bg-slate-50 text-slate-700 border-slate-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}>
                Caps: {li.capPolicy.relaxPositiveCaps ? 'Relaxed' : 'Tight'}
              </span>
            )}
          </div>
        </div>
      </div>

      {li.note && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold leading-relaxed ${
          baselineOnly
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-slate-100 bg-slate-50/60 text-slate-800'
        }`}>
          {li.note}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Event detection</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{accepted.length}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">validated event(s) from whitelisted sources</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Property impact</p>
          <p className="mt-2 text-3xl font-black text-emerald-950">{propertyImpactEvents}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-800">event(s) with plausible valuation channels</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Filtered context</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{detectedNoImpact}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">detected but zero-impact for this collateral</p>
        </div>
      </div>

      {/* Tier counts + corroboration counts */}
      <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700">Source quality details</h4>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {li.eventsFound || 0} scanned / {li.acceptedEvents || 0} accepted / {watchlist.length} watchlist
            </p>
          </div>
          <span className="material-symbols-outlined text-slate-400 transition-transform group-open:rotate-180">expand_more</span>
        </summary>
      <div className="mt-4 grid grid-cols-1 gap-6 border-t border-slate-100 pt-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">Sources by tier</h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-700">Official</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{tierCounts.official || 0}</p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-sky-700">Reputed Media</p>
              <p className="mt-1 text-xl font-bold text-sky-900">{tierCounts.reputed_media || 0}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Local Media</p>
              <p className="mt-1 text-xl font-bold text-slate-700">{tierCounts.local_media || 0}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] font-mono text-slate-400 font-medium">
            {li.eventsFound || 0} events scanned · {li.acceptedEvents || 0} accepted · {li.rejectedEvents || 0} rejected · {watchlist.length} on watchlist
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">Corroboration breakdown</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['official_plus_media',  'Official + Media'],
              ['official_only',        'Official only'],
              ['media_corroborated',   'Media corroborated'],
              ['media_only',           'Media-only watchlist'],
              ['local_media_only',     'Local-media watchlist'],
              ['unconfirmed',          'Unconfirmed'],
            ].map(([key, label]) => (
              <div key={key} className={`rounded-md px-2.5 py-1.5 border ${CORROBORATION_TONE[key]}`}>
                <p className="font-bold uppercase tracking-wider opacity-80">{label}</p>
                <p className="mt-0.5 font-mono text-sm font-bold">{corrCounts[key] || 0}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      </details>

      {/* Decision impact */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
        <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">Decision impact</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Liquidity</p>
            <p className={`mt-1 text-lg font-bold ${(li.liquidityDelta || 0) < 0 ? 'text-red-700' : (li.liquidityDelta || 0) > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
              {fmtSignedPct(li.liquidityDelta)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Marketability</p>
            <p className={`mt-1 text-lg font-bold ${(li.marketabilityDelta || 0) < 0 ? 'text-red-700' : (li.marketabilityDelta || 0) > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
              {fmtSignedPct(li.marketabilityDelta)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Confidence</p>
            <p className={`mt-1 text-lg font-bold ${(li.confidenceDelta || 0) < 0 ? 'text-red-700' : (li.confidenceDelta || 0) > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
              {fmtSigned(li.confidenceDelta, 3)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Time-to-liquidate</p>
            <p className={`mt-1 text-lg font-bold ${(li.timeToLiquidateDeltaPct || 0) > 0 ? 'text-red-700' : (li.timeToLiquidateDeltaPct || 0) < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
              {fmtSignedPct(li.timeToLiquidateDeltaPct)}
            </p>
          </div>
        </div>
        <div className={`mt-4 rounded-lg border px-3 py-2 ${ROUTE_TONE[li.inspectionRoute || 'none']}`}>
          <p className="text-xs font-bold uppercase tracking-wider opacity-80">Inspection route</p>
          <p className="text-sm font-bold mt-0.5">{ROUTE_LABEL[li.inspectionRoute || 'none'] || li.inspectionRoute}</p>
        </div>
        {(li.preCapDeltas || li.capPolicy) && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            <p className="font-bold text-slate-700 mb-1">Cap policy: <span className="font-mono">{li.capPolicy?.band || (li.runMode === 'live' ? 'relaxed' : 'tight')}</span></p>
            {li.preCapDeltas && (
              <p className="font-mono text-slate-500">
                pre-cap: liq {fmtSignedPct(li.preCapDeltas.liquidityDelta)} · mkt {fmtSignedPct(li.preCapDeltas.marketabilityDelta)} · conf {fmtSigned(li.preCapDeltas.confidenceDelta, 3)} · TTL {fmtSignedPct(li.preCapDeltas.timeToLiquidateDeltaPct)}
              </p>
            )}
            {li.cacheDampenerApplied && (
              <p className="mt-1 font-mono text-amber-700">
                cache dampener applied — official ×0.75 · media-only ×0.40 · local-media ×0.20 (severe-risk only)
              </p>
            )}
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          <strong>Cached events are dampened. Live official-confirmed events receive stronger weighting.</strong>{' '}
          Positive caps default to ±5% (liquidity / marketability) and −7% (TTL improvement). They expand to ±8% / −10% only when this run has at least one live official-tier event. Negative-risk caps are constant (−8% / +15%). Base market value is never altered by this layer.
        </p>
      </div>

      {/* Watchlist panel */}
      {watchlist.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 md:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span aria-hidden="true" className="material-symbols-outlined text-amber-600 text-[20px]">visibility</span>
            <h4 className="text-sm font-bold uppercase tracking-wider text-amber-800">Watchlist signals ({watchlist.length})</h4>
          </div>
          <p className="text-xs text-amber-900/80 mb-3">
            Single-source media signals. Tracked for context but do not trigger manual review unless the event is a severe risk type.
          </p>
          <ul className="space-y-2">
            {watchlist.map((w, idx) => (
              <li key={idx} className="rounded-lg border border-amber-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">{w.summary || w.eventType}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border ${TIER_TONE[w.sourceTier] || TIER_TONE.local_media}`}>
                      {TIER_LABEL[w.sourceTier] || w.sourceTier}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border ${CORROBORATION_TONE[w.corroborationStatus]}`}>
                      {CORROBORATION_LABEL[w.corroborationStatus] || w.corroborationStatus}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-[11px] font-mono text-slate-400 font-medium">
                  {w.sourceName} · {w.eventType} · confidence {Number(w.confidence || 0).toFixed(2)} · valuation relevance {fmtScore(w.valuationRelevanceScore ?? w.localityRelevance, 3)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sources checked */}
      <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700">Sources checked</h4>
            <p className="mt-1 text-xs font-semibold text-slate-500">{sources.length} source status records</p>
          </div>
          <span className="material-symbols-outlined text-slate-400 transition-transform group-open:rotate-180">expand_more</span>
        </summary>
        <div className="mt-4 border-t border-slate-100 pt-4">
        {sources.length === 0 ? (
          <p className="text-sm font-semibold text-slate-500">No source status reported.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sources.map((s) => (
              <li key={s.sourceName} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{s.sourceName}</p>
                  <p className="text-[11px] font-mono text-slate-400 font-medium mt-0.5">
                    {TIER_LABEL[s.sourceTier] || s.sourceTier || '—'} · docs {s.documentsFetched ?? 0}
                    {s.errorMessage ? ` · ${s.errorMessage}` : ''}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${SOURCE_STATUS_TONE[s.status] || SOURCE_STATUS_TONE.skipped}`}>
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
        )}
        </div>
      </details>

      {/* Live Scan Diagnostics (compact, default collapsed) */}
      {li.diagnostics && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
          <button
            type="button"
            onClick={() => setDiagnosticsOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 text-left transition-colors duration-150 hover:opacity-80"
            aria-expanded={diagnosticsOpen}
          >
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold uppercase tracking-wider text-slate-700">Live Scan Diagnostics</span>
              <span className="text-[11px] font-mono text-slate-400 font-medium">
                {li.diagnostics.liveDocumentsFetched || 0} fetched · {li.diagnostics.liveDocumentsAccepted || 0} accepted · {li.diagnostics.liveDocumentsRejected || 0} rejected
              </span>
            </span>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-slate-500">
              {diagnosticsOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {diagnosticsOpen && (
            <div className="mt-4 space-y-4">
              {/* Headline counts */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Live docs fetched</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{li.diagnostics.liveDocumentsFetched || 0}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Accepted live events</p>
                  <p className="mt-1 text-lg font-bold text-emerald-900">{li.diagnostics.liveDocumentsAccepted || 0}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Rejected live docs</p>
                  <p className="mt-1 text-lg font-bold text-amber-900">{li.diagnostics.liveDocumentsRejected || 0}</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Live RSS scraping ran across whitelisted sources. Only validated, locality-relevant events are allowed to affect scoring — most fetched docs are correctly rejected.
              </p>

              {/* Top rejection reasons */}
              {li.diagnostics.rejectionReasonCounts && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Top rejection reasons</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    {Object.entries(li.diagnostics.rejectionReasonCounts)
                      .filter(([, n]) => n > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([key, n]) => (
                        <div key={key} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                          <span className="font-bold text-slate-700">{REJECTION_LABEL[key] || key}</span>
                          <span className="font-mono text-slate-500">{n}</span>
                        </div>
                      ))}
                    {Object.values(li.diagnostics.rejectionReasonCounts).every((n) => !n) && (
                      <div className="col-span-full text-slate-500">No rejected events in this run.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Source-wise fetched vs accepted */}
              {Array.isArray(li.diagnostics.perSourceCounts) && li.diagnostics.perSourceCounts.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Source-wise fetched vs accepted</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="font-mono font-semibold py-1 pr-3">source</th>
                          <th className="font-mono font-semibold py-1 pr-3">tier</th>
                          <th className="font-mono font-semibold py-1 pr-3">status</th>
                          <th className="font-mono font-semibold py-1 pr-3 text-right">fetched</th>
                          <th className="font-mono font-semibold py-1 pr-3 text-right">accepted</th>
                          <th className="font-mono font-semibold py-1 text-right">rejected</th>
                        </tr>
                      </thead>
                      <tbody>
                        {li.diagnostics.perSourceCounts.map((r, idx) => (
                          <tr key={idx} className="border-t border-slate-200">
                            <td className="py-1.5 pr-3 font-semibold text-slate-800 truncate max-w-[180px]" title={r.sourceName}>{r.sourceName}</td>
                            <td className="py-1.5 pr-3 font-mono text-slate-500">{r.sourceTier || '—'}</td>
                            <td className="py-1.5 pr-3">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${SOURCE_STATUS_TONE[r.status] || SOURCE_STATUS_TONE.skipped}`}>{r.status}</span>
                            </td>
                            <td className="py-1.5 pr-3 font-mono text-right text-slate-700">{r.fetched ?? 0}</td>
                            <td className={`py-1.5 pr-3 font-mono text-right ${(r.accepted ?? 0) > 0 ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>{r.accepted ?? 0}</td>
                            <td className="py-1.5 font-mono text-right text-slate-500">{r.rejected ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Raw scraped text is intentionally not exposed here — only counts.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Accepted events */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
        <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">
          Accepted events ({accepted.length})
        </h4>
        {accepted.length === 0 ? (
          <p className="text-sm font-semibold text-slate-500">
            No accepted locality events from whitelisted sources. Core valuation unaffected.
          </p>
        ) : (
          <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {accepted.map((ev, idx) => {
              const tier = ev.sourceTier || 'official';
              const corr = ev.corroborationStatus || 'official_only';
              const watch = ev.isWatchlist;
              const isExpanded = expandedEvents.has(idx);

              return (
                <li
                  key={ev.eventId || idx}
                  className={`${watch ? 'bg-amber-50/30' : 'bg-white'}`}
                >
                  <div onClick={() => toggleEvent(idx)} className="cursor-pointer flex items-center justify-between p-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${DIRECTION_TONE[ev.direction] || DIRECTION_TONE.neutral}`}>
                        {ev.direction}
                      </span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${ev.valuationImpactEligible ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                        {ev.valuationImpactEligible ? 'Impact' : 'No Impact'}
                      </span>
                      <p className="text-[13px] font-bold text-slate-800 truncate">{ev.title || ev.summary || ev.eventType}</p>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] font-mono shrink-0 pl-4">
                      <span className={(ev.liquidityDelta || 0) < 0 ? 'text-red-700 font-bold' : (ev.liquidityDelta || 0) > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                        Liq {fmtSignedPct(ev.liquidityDelta)}
                      </span>
                      <span className={(ev.marketabilityDelta || 0) < 0 ? 'text-red-700 font-bold' : (ev.marketabilityDelta || 0) > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                        Mkt {fmtSignedPct(ev.marketabilityDelta)}
                      </span>
                      <span className={(ev.confidenceDelta || 0) < 0 ? 'text-red-700 font-bold' : (ev.confidenceDelta || 0) > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                        Conf {fmtSigned(ev.confidenceDelta, 2)}
                      </span>
                      <span className={(ev.timeToLiquidateDeltaPct || 0) > 0 ? 'text-red-700 font-bold' : (ev.timeToLiquidateDeltaPct || 0) < 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                        TTL {fmtSignedPct(ev.timeToLiquidateDeltaPct)}
                      </span>
                      <span className="material-symbols-outlined text-[16px] text-slate-400">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 bg-slate-50/50 border-t border-slate-100">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between mb-3">
                        <div className="min-w-0">
                          {ev.summary && ev.summary !== ev.title && (
                            <p className="text-xs text-slate-700">{ev.summary}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${TIER_TONE[tier]}`}>
                            {TIER_LABEL[tier]}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${CORROBORATION_TONE[corr]}`}>
                            {CORROBORATION_LABEL[corr]}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-slate-50 text-slate-700 border-slate-200">
                            {ev.eventType?.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px] font-mono text-slate-500">
                        <span>severity {Number(ev.severity || 0).toFixed(2)}</span>
                        <span>conf {Number(ev.confidence || 0).toFixed(2)}</span>
                        <span>locality {fmtScore(ev.localityMatchScore ?? ev.localityRelevance, 2)}</span>
                        <span>distance {ev.distanceToPropertyLabel || (Number.isFinite(Number(ev.distanceToPropertyKm)) ? `${Number(ev.distanceToPropertyKm).toFixed(2)} km` : 'not localized')}</span>
                        <span>corrWt {Number(ev.corroborationWeight || 0).toFixed(2)}</span>
                      </div>

                      <div className={`mt-3 rounded-lg border p-3 ${
                        ev.valuationImpactEligible
                          ? 'border-emerald-100 bg-white'
                          : 'border-slate-200 bg-white'
                      }`}>
                        <div className="border-l-2 border-slate-200 pl-3">
                          <p className="text-xs text-slate-600 font-mono italic mb-2">
                            "{ev.rationale || ev.impactReason || ev.summary || "No specific rationale provided by source."}"
                          </p>
                          <div className="flex items-center gap-3">
                            {ev.sourceUrl ? (
                              <a href={ev.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors group">
                                {ev.sourceName || 'Source'} 
                                <span className="material-symbols-outlined text-[12px] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">north_east</span>
                              </a>
                            ) : (
                              <span className="text-[11px] font-bold text-slate-700">{ev.sourceName || 'Source'}</span>
                            )}
                            {ev.eventType && (
                              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">{ev.eventType.replace(/_/g, '_')}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm mt-6">
        <button
          type="button"
          onClick={() => setAuditOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 text-left transition-colors duration-150 hover:opacity-80"
          aria-expanded={auditOpen}
        >
          <span className="text-sm font-bold uppercase tracking-wider text-slate-700">Locality Audit Trail</span>
          <span className="flex items-center gap-2 text-[11px] font-mono text-slate-400 font-medium">
            {(li.auditTrail || []).length} entr{(li.auditTrail || []).length === 1 ? 'y' : 'ies'}
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              {auditOpen ? 'expand_less' : 'expand_more'}
            </span>
          </span>
        </button>
        {auditOpen && (
          <ul className="mt-3 space-y-2">
            {(li.auditTrail || []).map((rule, idx) => (
              <li key={`${rule.ruleId}-${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <p className="text-sm font-bold text-slate-800">{rule.ruleId}</p>
                  <span className="text-[11px] font-mono text-slate-400 font-medium">
                    {rule.source}{rule.sourceTier ? ` · ${rule.sourceTier}` : ''}
                  </span>
                </div>
                {rule.corroborationStatus && (
                  <p className="text-[11px] font-mono text-slate-400 font-medium">
                    corroboration: {rule.corroborationStatus}
                  </p>
                )}
                <p className="text-[11px] font-mono text-slate-400 font-medium">input: {rule.input}</p>
                {rule.formula && <p className="text-[11px] font-mono text-slate-400 font-medium mt-0.5">formula: {rule.formula}</p>}
                <p className="text-[11px] font-mono text-slate-400 font-medium mt-0.5">effect: {rule.effect}</p>
                <p className="text-sm text-slate-700 mt-1">{rule.explanation}</p>
              </li>
            ))}
            {(li.auditTrail || []).length === 0 && (
              <li className="text-sm text-slate-500">No audit entries yet.</li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
