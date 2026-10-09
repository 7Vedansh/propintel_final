import React from 'react';
import { SummaryStatRow } from '../ui/DashboardPrimitives';
import Stage1IntakeSection from './Stage1IntakeSection';
import Stage2VerificationSection from './Stage2VerificationSection';

/* ── helpers ─────────────────────────────────────────────────────────── */

const DECISION_CLASS = {
  REJECT_BLOCK: 'bg-red-50 text-red-700 border-red-200',
  ACCEPT_CLEAN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ACCEPT_WARNING: 'bg-amber-50 text-amber-700 border-amber-200',
  ACCEPT_CONFIDENCE_PENALTY: 'bg-amber-50 text-amber-700 border-amber-200',
  MANUAL_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
};
const DECISION_LABEL = {
  REJECT_BLOCK: 'Reject Block',
  ACCEPT_CLEAN: 'Accept Clean',
  ACCEPT_WARNING: 'Accept Warning',
  ACCEPT_CONFIDENCE_PENALTY: 'Accept With Confidence Penalty',
  MANUAL_REVIEW: 'Manual Review',
};

/* ── main component ──────────────────────────────────────────────────── */

export default function VerificationPanel({ data }) {
  if (!data) return null;

  const stage2 = data.stage2Output || {};
  const scores = stage2.scores || {};
  const decision = stage2.decision || '';

  const highSignalFlags = (stage2.flags || [])
    .filter((f) => !f?.protective && f?.severity !== 'warning')
    .slice(0, 3);

  return (
    <div className="space-y-6">

      {/* ── Stage 2 Gate Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-600 text-[24px]">fact_check</span>
          <h2 className="text-lg font-extrabold uppercase tracking-wider text-slate-800">Stage 2 Gate</h2>
        </div>
        <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border ${DECISION_CLASS[decision] || DECISION_CLASS.ACCEPT_WARNING}`}>
          {DECISION_LABEL[decision] || decision}
        </span>
      </div>

      {/* ── Stage 2 Decision banner ── */}
      <div className={`rounded-xl border p-4 shadow-sm ${DECISION_CLASS[decision] || DECISION_CLASS.ACCEPT_WARNING}`}>
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[24px]">
            {decision === 'REJECT_BLOCK' ? 'block' : decision === 'MANUAL_REVIEW' ? 'policy' : 'verified'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <p className="text-sm font-bold uppercase tracking-wider">
                {DECISION_LABEL[decision] || decision}
              </p>
              <SummaryStatRow
                items={[
                  { label: 'DSS', value: (scores.dataSufficiencyScore ?? 0).toFixed(2) },
                  { label: 'Anomaly', value: `${scores.anomalyScore ?? 0}/100` },
                  { label: 'Suspicion', value: `${scores.suspicionScore ?? 0}/100` },
                ]}
              />
            </div>
            <p className="text-sm font-medium leading-relaxed">{stage2.decisionExplanation}</p>
          </div>
        </div>
      </div>

      {/* ── Priority flags (always visible if any) ── */}
      {highSignalFlags.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Priority flags</p>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            {highSignalFlags.map((flag) => (
              <div key={flag.id} className={`rounded-lg border p-3 ${
                flag.severity === 'block' ? 'bg-red-50 border-red-200'
                : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className={`text-[12px] font-bold leading-tight ${flag.severity === 'block' ? 'text-red-950' : 'text-amber-950'}`}>{flag.title}</p>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shadow-sm ${
                    flag.severity === 'block' ? 'bg-red-600 text-white border-red-700 shadow-red-600/30'
                    : 'bg-amber-500 text-white border-amber-600 shadow-amber-500/20'
                  }`}>
                    {flag.severity}
                  </span>
                </div>
                <p className={`text-[12px] leading-snug ${flag.severity === 'block' ? 'text-red-800' : 'text-amber-800'}`}>{flag.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Verification Table ── */}
      <Stage2VerificationSection stage2Output={stage2} />

      {/* ── Stage 1 Intake & Buckets ── */}
      <Stage1IntakeSection stage1={data.stage1} />

    </div>
  );
}
