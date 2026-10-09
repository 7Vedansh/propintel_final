import React from 'react';
import CollapsibleSection from '../ui/CollapsibleSection';
import AuditPackSection from './AuditPackSection';
import XAIBubble from '../XAIBubble';

/* ── main component ──────────────────────────────────────────────────── */

export default function AuditEvidencePanel({
  data,
  underwriterSummary,
  isUnderwriterSummaryLoading,
  enhancementState,
}) {
  if (!data) return null;

  return (
    <div className="space-y-5">

      {/* ── Audit Pack ── */}
      <AuditPackSection data={data} underwriterSummary={underwriterSummary} />

    </div>
  );
}
