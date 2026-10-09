import { mockHistoricalCases } from '../data/mockHistoricalCases.js';
import { resolveHistoricalCasesFromBackend } from './api.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const round2 = (value) => Number(value.toFixed(2));

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function normalizeAgeBucket(value, ageYears) {
  const bucket = normalizeText(value);
  if (bucket.includes('new')) return 'New';
  if (bucket.includes('old')) return 'Old';
  if (bucket.includes('mid')) return 'Mid-age';
  if (Number.isFinite(ageYears)) {
    if (ageYears < 5) return 'New';
    if (ageYears <= 15) return 'Mid-age';
    return 'Old';
  }
  return 'Unknown';
}

function normalizeLegalProfile(value) {
  const text = normalizeText(value);
  if (!text || text === 'not_provided') return 'Not provided';
  if (text.includes('clear') || text.includes('freehold')) return 'Clear';
  if (text.includes('lease')) return 'Leasehold';
  if (text.includes('dispute') || text.includes('litigation') || text.includes('unclear')) return 'Disputed';
  return titleCase(value);
}

function normalizeBackendPropertyType(value) {
  const text = normalizeText(value);
  if (['apartment', 'flat', 'villa', 'house', 'residential'].includes(text)) return 'Residential';
  if (['commercial', 'office', 'shop', 'showroom', 'warehouse'].includes(text)) return 'Commercial';
  return value || 'Residential';
}

function normalizeBackendSubtype(currentProfile) {
  const config = String(currentProfile.config || '').trim();
  const compact = config.toUpperCase().replace(/\s+/g, '');
  if (['1BHK', '2BHK', '3BHK'].includes(compact)) return compact;
  return currentProfile.subtype;
}

function getSizeBand(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return { label: 'Size not resolved', min: null, max: null };
  }

  const bands = [
    { label: 'Under 700 sqft', min: 0, max: 700 },
    { label: '700-900 sqft', min: 700, max: 900 },
    { label: '900-1100 sqft', min: 900, max: 1100 },
    { label: '1100-1300 sqft', min: 1100, max: 1300 },
    { label: '1300-1600 sqft', min: 1300, max: 1600 },
    { label: '1600-2200 sqft', min: 1600, max: 2200 },
    { label: 'Over 2200 sqft', min: 2200, max: Infinity }
  ];

  return bands.find((band) => size > band.min && size <= band.max) || bands[bands.length - 1];
}

function extractCity(location) {
  const text = String(location || '');
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return normalizeText(parts[parts.length - 1]);
  if (normalizeText(text).includes('mumbai')) return 'mumbai';
  if (normalizeText(text).includes('pune')) return 'pune';
  return normalizeText(text);
}

function buildCurrentProfile({ stage1, inputs, microMarket }) {
  const profile = stage1?.normalizedPropertyProfile || {};
  const raw = stage1?.rawIntake || {};
  const details = inputs?.propertyDetails || {};
  const enrichment = inputs?.enrichment || {};
  const size = Number(profile.standardizedSizeSqft || details.area || 0);
  const ageYears = Number(profile.ageYears ?? details.age);
  const propertyType = profile.propertyType || details.type || 'Apartment';
  const propertySubtype = profile.propertySubtype || details.subtype || details.type || 'Apartment';
  const config = raw.config || details.config || propertySubtype;
  const address = profile.address || inputs?.location || 'Current property';

  return {
    address,
    city: extractCity(address),
    microMarket: microMarket?.bucketId || stage1?.bucketAssignment?.microMarketBucket?.id || 'Not resolved',
    propertyType,
    subtype: propertySubtype,
    config,
    size,
    sizeBand: getSizeBand(size),
    ageBucket: normalizeAgeBucket(profile.ageBucket || details.ageBucket, ageYears),
    legalProfile: normalizeLegalProfile(profile.legalStatus || enrichment.legalStatus)
  };
}

function buildBackendRequest(currentProfile, baseConfidence) {
  return {
    microMarketId: currentProfile.microMarket,
    localityName: currentProfile.address?.split(',')?.[0]?.trim() || currentProfile.address,
    propertyType: normalizeBackendPropertyType(currentProfile.propertyType),
    subtype: normalizeBackendSubtype(currentProfile),
    sizeSqft: currentProfile.size,
    ageBucket: currentProfile.ageBucket,
    legalProfile: currentProfile.legalProfile,
    baseConfidence
  };
}

function sizeSimilarity(currentBand, historicalCase) {
  if (!Number.isFinite(currentBand?.min) || !Number.isFinite(historicalCase.sizeMin)) return 0;
  const currentMid = currentBand.max === Infinity
    ? currentBand.min + 250
    : (currentBand.min + currentBand.max) / 2;
  const historicalMid = (historicalCase.sizeMin + historicalCase.sizeMax) / 2;
  const gap = Math.abs(currentMid - historicalMid);

  if (gap <= 150) return 1;
  if (gap <= 350) return 0.72;
  if (gap <= 650) return 0.42;
  return 0.15;
}

function scoreHistoricalCase(current, historicalCase) {
  const reasons = [];
  let score = 0;

  if (current.microMarket === historicalCase.microMarket) {
    score += 0.3;
    reasons.push('same micro-market');
  } else if (current.city && current.city === extractCity(historicalCase.location)) {
    score += 0.18;
    reasons.push('same city');
  } else {
    score += 0.06;
    reasons.push('same broad region data source');
  }

  if (normalizeText(current.propertyType) === normalizeText(historicalCase.propertyType)) {
    score += 0.15;
    reasons.push('same property type');
  }

  if (normalizeText(current.subtype) === normalizeText(historicalCase.subtype)) {
    score += 0.12;
    reasons.push('same subtype');
  }

  if (normalizeText(current.config) === normalizeText(historicalCase.config)) {
    score += 0.1;
    reasons.push('same configuration');
  }

  const sizeScore = sizeSimilarity(current.sizeBand, historicalCase);
  score += sizeScore * 0.15;
  if (sizeScore >= 0.72) reasons.push('similar size band');

  if (normalizeText(current.ageBucket) === normalizeText(historicalCase.ageBucket)) {
    score += 0.08;
    reasons.push('same age bucket');
  }

  if (normalizeText(current.legalProfile) === normalizeText(historicalCase.legalProfile)) {
    score += 0.1;
    reasons.push('similar legal profile');
  } else if (current.legalProfile === 'Not provided') {
    score += 0.04;
    reasons.push('legal profile not provided for current case');
  }

  const similarityScore = round2(clamp(score, 0, 1));
  const confidenceDelta = round2((historicalCase.contribution?.confidenceDelta || 0) * similarityScore);
  const liquidityDelta = round2((historicalCase.contribution?.liquidityDelta || 0) * similarityScore);
  const distressDelta = round2((historicalCase.contribution?.distressDelta || 0) * similarityScore);
  const direction = confidenceDelta > 0.01 ? 'Positive' : confidenceDelta < -0.01 ? 'Negative' : 'Mixed';

  return {
    ...historicalCase,
    similarityScore,
    similarityPct: Math.round(similarityScore * 100),
    matchReason: reasons,
    matchBasis: reasons.slice(0, 3).join(', ') || 'broad profile similarity',
    reliabilityDirection: direction,
    currentCaseImpact: {
      similarityWeight: similarityScore,
      reliabilityDirection: direction,
      confidenceContribution: confidenceDelta,
      liquidityEffect: liquidityDelta,
      distressEffect: distressDelta
    },
    outcomeSummary: [
      historicalCase.outcome.approvalStatus,
      historicalCase.outcome.defaultStatus,
      historicalCase.outcome.liquidationDays ? `sold in ${historicalCase.outcome.liquidationDays} days` : null
    ].filter(Boolean).join(', ')
  };
}

function buildGeneratedHistoricalCaseSummary({ stage1, inputs, microMarket, baseConfidence }) {
  const currentProfile = buildCurrentProfile({ stage1, inputs, microMarket });
  const rankedCases = mockHistoricalCases
    .map((historicalCase) => scoreHistoricalCase(currentProfile, historicalCase))
    .sort((a, b) => b.similarityScore - a.similarityScore);

  const similarCases = rankedCases.filter((historicalCase) => historicalCase.similarityScore >= 0.45).slice(0, 5);
  const selectedCases = similarCases.length > 0 ? similarCases : rankedCases.slice(0, 3);
  const rawConfidenceAdjustment = selectedCases.reduce(
    (sum, historicalCase) => sum + historicalCase.currentCaseImpact.confidenceContribution,
    0
  );
  const confidenceAdjustment = round2(clamp(rawConfidenceAdjustment * 0.65, -0.1, 0.1));
  const liquidityAdjustment = round2(clamp(selectedCases.reduce(
    (sum, historicalCase) => sum + historicalCase.currentCaseImpact.liquidityEffect,
    0
  ), -0.08, 0.08));
  const distressAdjustment = round2(clamp(selectedCases.reduce(
    (sum, historicalCase) => sum + historicalCase.currentCaseImpact.distressEffect,
    0
  ), -0.08, 0.08));

  const overallSignal = confidenceAdjustment >= 0.03
    ? 'Positive'
    : confidenceAdjustment <= -0.03
      ? 'Caution'
      : 'Mixed';

  return {
    source: 'generated_fallback',
    candidateCount: rankedCases.length,
    displayedCount: selectedCases.length,
    casesFound: selectedCases.length,
    overallSignal,
    confidenceAdjustment,
    liquidityAdjustment,
    distressAdjustment,
    baseConfidence: Number.isFinite(baseConfidence) ? round2(baseConfidence) : null,
    finalConfidence: Number.isFinite(baseConfidence) ? round2(clamp(baseConfidence + confidenceAdjustment, 0.25, 0.95)) : null,
    currentCaseProfile: {
      location: currentProfile.address,
      microMarket: currentProfile.microMarket,
      propertyType: currentProfile.propertyType,
      subtype: currentProfile.subtype,
      config: currentProfile.config,
      sizeBand: currentProfile.sizeBand.label,
      ageBucket: currentProfile.ageBucket,
      legalProfile: currentProfile.legalProfile
    },
    sparse: selectedCases.length < 3 || selectedCases[0]?.similarityScore < 0.55,
    note: selectedCases.length < 3 || selectedCases[0]?.similarityScore < 0.55
      ? 'Limited historical matches found. Confidence impact is intentionally small.'
      : 'Similar internal loan cases found with enough overlap to influence confidence.',
    similarCases: selectedCases
  };
}

export async function buildHistoricalCaseSummary({ stage1, inputs, microMarket, baseConfidence }) {
  const currentProfile = buildCurrentProfile({ stage1, inputs, microMarket });
  const backendSummary = await resolveHistoricalCasesFromBackend(buildBackendRequest(currentProfile, baseConfidence));

  if (backendSummary) {
    return {
      liquidityAdjustment: 0,
      distressAdjustment: 0,
      ...backendSummary,
      casesFound: backendSummary.casesFound ?? backendSummary.displayedCount ?? backendSummary.similarCases?.length ?? 0,
      candidateCount: backendSummary.candidateCount ?? 0,
      displayedCount: backendSummary.displayedCount ?? backendSummary.similarCases?.length ?? 0,
      sparse: backendSummary.sparse ?? (backendSummary.similarCases?.length || 0) < 3,
      note: backendSummary.note || 'SQLite historical cases were used for confidence adjustment.'
    };
  }

  return buildGeneratedHistoricalCaseSummary({ stage1, inputs, microMarket, baseConfidence });
}
