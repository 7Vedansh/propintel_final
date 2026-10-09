function text(value, fallback = 'Not available') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function dedupe(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeFlag(flag) {
  return text(flag?.title || flag?.explanation || flag?.text || flag, '').trim();
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Not available';
  return `${(numeric <= 1 ? numeric * 100 : numeric).toFixed(0)}%`;
}

function sentence(value) {
  const clean = text(value, '').trim();
  return clean && !/[.!?]$/.test(clean) ? `${clean}.` : clean;
}

function getAction(decision) {
  if (decision.includes('REJECT')) return 'Do not proceed';
  if (decision.includes('MANUAL')) return 'Manual review required';
  if (decision.includes('PENALTY')) return 'Proceed after evidence remediation';
  if (decision.includes('WARNING')) return 'Proceed with conditions';
  return 'Proceed to underwriting';
}

function getTone(decision) {
  if (decision.includes('REJECT')) return 'red';
  if (decision.includes('MANUAL')) return 'orange';
  if (decision.includes('PENALTY')) return 'amber';
  if (decision.includes('WARNING')) return 'amber';
  return 'emerald';
}

function getReviewRoutes(data, stageFlags) {
  const flagText = stageFlags.join(' ').toLowerCase();
  const routes = [];
  const visualEvidence = data?.visualEvidence || {};
  const visual = visualEvidence.deterministicEffects || {};
  const locality = data?.localityIntelligence || {};
  const portfolio = data?.portfolioRiskSummary || {};

  if (flagText.includes('legal') || flagText.includes('title')) routes.push('Legal review');
  if (flagText.includes('size') || flagText.includes('area') || flagText.includes('sqft')) routes.push('Area verification');
  if (visualEvidence.metadataTrust?.gpsMatchStatus === 'fail') routes.push('Field officer review');
  if (visual.manualInspectionRequired) routes.push(text(visual.inspectionRoute).replace(/_/g, ' '));
  if (locality.manualReviewRequired) routes.push(text(locality.inspectionRoute).replace(/_/g, ' '));
  if (portfolio.decisionImpact?.seniorReviewRequired) routes.push('Senior credit review');
  if (!routes.length) routes.push('Standard underwriting review');
  return dedupe(routes);
}

function getConditions(data, stageFlags) {
  const flagText = stageFlags.join(' ').toLowerCase();
  const conditions = [];
  const visual = data?.visualEvidence || {};
  const locality = data?.localityIntelligence || {};
  const portfolio = data?.portfolioRiskSummary || {};

  if (flagText.includes('size') || flagText.includes('area') || flagText.includes('sqft')) {
    conditions.push('Verify carpet area against measurement evidence.');
  }
  if (flagText.includes('legal') || flagText.includes('title')) {
    conditions.push('Complete title and legal-document review.');
  }
  if (visual.packetStatus !== 'complete') {
    conditions.push('Complete the categorized visual evidence packet or record a field-inspection waiver.');
  }
  if (visual.metadataTrust?.gpsMatchStatus === 'fail') {
    conditions.push('Resolve the uploaded-image GPS mismatch through field-officer review.');
  }
  if (visual.deterministicEffects?.manualInspectionRequired) {
    conditions.push(`Complete ${text(visual.deterministicEffects.inspectionRoute).replace(/_/g, ' ')} for visual concerns.`);
  }
  if (locality.manualReviewRequired) {
    conditions.push(`Review hyperlocal event flags through ${text(locality.inspectionRoute).replace(/_/g, ' ')}.`);
  }
  if (portfolio.decisionImpact?.seniorReviewRequired) {
    conditions.push('Document senior credit approval for portfolio concentration exposure.');
  }
  return dedupe(conditions).slice(0, 4);
}

export function buildDecisionMemo(data = {}, underwriterSummary = null) {
  const stage2 = data.stage2Output || {};
  const decision = data.verificationDecision?.decision || stage2.decision || 'REVIEW';
  const decisionLabel = data.verificationDecision?.label || text(decision).replace(/_/g, ' ');
  const stageFlags = (stage2.flags || []).filter((flag) => !flag?.protective).map(normalizeFlag).filter(Boolean);
  const portfolioFlags = (data.portfolioRiskSummary?.riskFlags || []).map(normalizeFlag).filter(Boolean);
  const localityFlags = (data.localityIntelligence?.riskFlags || []).map(normalizeFlag).filter(Boolean);
  const visualConcerns = (data.visualEvidence?.userFacingSummary?.concerns || []).map(normalizeFlag).filter(Boolean);
  const risks = dedupe([...stageFlags, ...visualConcerns, ...localityFlags, ...portfolioFlags]).slice(0, 4);
  const conditions = getConditions(data, stageFlags);
  const reviewRoutes = getReviewRoutes(data, stageFlags);
  const recommendedLtv = data.portfolioRiskSummary?.portfolioSummary?.recommendedLtv;
  const aiSummary = underwriterSummary?.summary?.executiveSummary;
  const primaryReason = risks[0] || 'No material contradiction surfaced in the deterministic screening checks.';
  const action = getAction(decision);

  return {
    action,
    tone: getTone(decision),
    decision,
    decisionLabel,
    headline: `${action}: ${decisionLabel}`,
    primaryReason,
    conditions,
    reviewRoute: reviewRoutes.join(' + '),
    narrative: [
      `Estimated market value is ${text(data.marketValue)} with distress recovery of ${text(data.distressValue)}.`,
      `Liquidity is ${text(data.PropIntel)}/100 with an expected exit window of ${text(data.timeToSell)}.`,
      sentence(primaryReason),
      `Recommended LTV is ${formatPercent(recommendedLtv ?? data.ltv)}.`,
    ].join(' '),
    aiSummary,
  };
}
