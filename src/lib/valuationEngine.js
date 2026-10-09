// PropIntel Valuation Engine v2
// Full 15-layer deterministic intelligence pipeline

import { assignCoarseBucket, assignMicroMarketBucket, extractHyperlocalContext } from './locationIntelligence.js';
import { runAnomalyPipeline } from './anomalyEngine.js';
import { adaptStage1ForValuation, isStage1Output } from './stage1Engine.js';
import { buildHistoricalCaseSummary } from './historicalReliabilityEngine.js';
import {
  resolveLocalityIntelligenceFromBackend,
  resolvePortfolioConcentrationFromBackend,
  scanPropertyImage,
} from './api.js';

const isKnownOptional = (value) => Boolean(value && value !== 'not_provided');

const PROPERTY_TYPE_ALIASES = {
  apartment: 'Apartment',
  flat: 'Apartment',
  condo: 'Apartment',
  residential: 'Apartment',
  penthouse: 'Apartment',
  duplex: 'Apartment',
  studio: 'Apartment',
  villa: 'Villa',
  bungalow: 'Villa',
  house: 'Villa',
  'row house': 'Villa',
  townhouse: 'Villa',
  'independent house': 'Villa',
  commercial: 'Commercial',
  office: 'Commercial',
  shop: 'Commercial',
  showroom: 'Commercial',
  warehouse: 'Commercial',
  godown: 'Commercial',
  plot: 'Plot',
  land: 'Plot',
  'residential plot': 'Plot',
  'commercial plot': 'Plot',
  'agricultural land': 'Plot'
};

const CONFIG_ALIASES = {
  studio: 'Studio',
  '1bhk': '1 BHK',
  '1 bhk': '1 BHK',
  '2bhk': '2 BHK',
  '2 bhk': '2 BHK',
  '3bhk': '3 BHK',
  '3 bhk': '3 BHK',
  '4bhk': '4 BHK+',
  '4 bhk': '4 BHK+',
  '4bhk+': '4 BHK+',
  '4+bhk': '4 BHK+',
  '4 bhk+': '4 BHK+'
};

function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function canonicalizePropertyInput(rawInput = {}) {
  const container = rawInput.propertyDetails || rawInput || {};
  const rawType = rawInput.propertyType ?? rawInput.type ?? container.type ?? container.propertyType;
  const rawSubtype = rawInput.propertySubtype ?? rawInput.subtype ?? container.subtype ?? container.propertySubtype;
  const rawConfig = rawInput.config ?? container.config ?? rawInput.bhk ?? container.bhk ?? rawInput.unitType ?? container.unitType;
  const rawArea = rawInput.areaSqft ?? rawInput.area_sqft ?? rawInput.area ?? rawInput.sqft ?? rawInput.carpet_area_sqft ?? rawInput.carpetAreaSqft ?? container.areaSqft ?? container.area_sqft ?? container.area ?? container.sqft ?? container.carpet_area_sqft ?? container.carpetAreaSqft;
  const rawAge = rawInput.ageYears ?? rawInput.age_years ?? rawInput.age ?? container.ageYears ?? container.age_years ?? container.age ?? rawInput.propertyAge ?? container.propertyAge;
  const rawFloor = rawInput.floor ?? rawInput.floor_number ?? container.floor ?? container.floor_number ?? rawInput.floorNumber ?? container.floorNumber;
  const rawTotalFloors = rawInput.totalFloors ?? rawInput.total_floors ?? rawInput.total_floor_count ?? container.totalFloors ?? container.total_floors ?? container.total_floor_count ?? rawInput.totalFloorCount ?? container.totalFloorCount;

  const typeText = normalizeText(rawType || rawSubtype || 'Apartment');
  const normalizedType = PROPERTY_TYPE_ALIASES[String(typeText).toLowerCase()] || 'Apartment';
  let configText = normalizeText(rawConfig || rawSubtype || '2 BHK');
  if (configText) {
    const alias = CONFIG_ALIASES[String(configText).toLowerCase().replace(/\s+/g, '')] || configText;
    configText = alias;
  }
  if (!['Studio', '1 BHK', '2 BHK', '3 BHK', '4 BHK+'].includes(configText)) {
    configText = '2 BHK';
  }

  const areaSqft = parseNumeric(rawArea);
  const ageYears = parseNumeric(rawAge);
  const floor = parseNumeric(rawFloor);
  const totalFloors = parseNumeric(rawTotalFloors);

  return {
    type: normalizedType,
    subtype: normalizeText(rawSubtype) || normalizedType,
    config: configText,
    areaSqft: areaSqft !== null ? Number(areaSqft) : null,
    areaUnit: 'sqft',
    ageYears: ageYears !== null ? Number(ageYears) : null,
    floor: floor !== null ? Number(floor) : null,
    totalFloors: totalFloors !== null ? Number(totalFloors) : null,
    areaSource: rawArea !== undefined && rawArea !== null && rawArea !== '' ? 'user_provided' : 'assumed',
    typeSource: rawType !== undefined && rawType !== null && rawType !== '' ? 'user_provided' : 'derived',
    configSource: rawConfig !== undefined && rawConfig !== null && rawConfig !== '' ? 'user_provided' : 'assumed',
    ageSource: rawAge !== undefined && rawAge !== null && rawAge !== '' ? 'user_provided' : 'assumed',
    floorSource: rawFloor !== undefined && rawFloor !== null && rawFloor !== '' ? 'user_provided' : 'assumed',
    totalFloorsSource: rawTotalFloors !== undefined && rawTotalFloors !== null && rawTotalFloors !== '' ? 'user_provided' : 'assumed'
  };
}

export function validatePropertyRecord(record = {}) {
  const fields = {};
  const errors = [];

  const setField = (key, value, { min, max, required = false, allowZero = false } = {}) => {
    const isMissing = value === null || value === undefined || value === '';
    const numeric = Number(value);
    const isValidNumber = Number.isFinite(numeric);

    fields[key] = {
      value,
      missing: isMissing,
      valid: !isMissing && isValidNumber && (allowZero || numeric > 0) && (!Number.isFinite(min) || numeric >= min) && (!Number.isFinite(max) || numeric <= max),
      source: record[`${key}Source`] || 'assumed'
    };

    if (required && isMissing) {
      errors.push(`${key} is required but was missing`);
      return;
    }

    if (!isMissing && !isValidNumber) {
      errors.push(`${key} must be numeric`);
      return;
    }

    if (!isMissing && !allowZero && numeric <= 0) {
      errors.push(`${key} must be greater than zero; zero is not a valid missing-value substitute`);
    }

    if (!isMissing && Number.isFinite(min) && numeric < min) {
      errors.push(`${key} must be at least ${min}`);
    }

    if (!isMissing && Number.isFinite(max) && numeric > max) {
      errors.push(`${key} must be at most ${max}`);
    }
  };

  setField('areaSqft', record.areaSqft, { required: true, min: 1, max: 15000, allowZero: false });
  setField('ageYears', record.ageYears, { min: 0, max: 200, allowZero: true });
  setField('floor', record.floor, { min: 0, max: 100, allowZero: true });
  setField('totalFloors', record.totalFloors, { min: 1, max: 200, allowZero: true });

  if (!record.type || !['Apartment', 'Villa', 'Commercial', 'Plot'].includes(record.type)) {
    errors.push('type must be one of Apartment, Villa, Commercial or Plot');
  }

  if (!record.config || !['Studio', '1 BHK', '2 BHK', '3 BHK', '4 BHK+'].includes(record.config)) {
    errors.push('config must be a supported BHK value');
  }

  if (
    Number.isFinite(record.floor) &&
    Number.isFinite(record.totalFloors) &&
    record.totalFloors > 0 &&
    record.floor > record.totalFloors
  ) {
    errors.push('floor cannot exceed totalFloors');
  }

  const result = {
    valid: errors.length === 0,
    errors,
    fields,
    canonicalRecord: {
      ...record,
      areaSqft: Number(record.areaSqft),
      ageYears: record.ageYears === null || record.ageYears === undefined ? null : Number(record.ageYears),
      floor: record.floor === null || record.floor === undefined ? null : Number(record.floor),
      totalFloors: record.totalFloors === null || record.totalFloors === undefined ? null : Number(record.totalFloors)
    }
  };

  if (!result.valid) {
    throw new Error(`Property schema validation failed: ${result.errors.join('; ')}`);
  }

  return result;
}

function normalizePortfolioPropertyType(type) {
  const value = String(type || '').toLowerCase();
  if (['apartment', 'villa', 'house', 'flat', 'residential'].includes(value)) return 'Residential';
  if (['commercial', 'office', 'shop', 'showroom', 'warehouse'].includes(value)) return 'Commercial';
  return type || 'Residential';
}

function normalizePortfolioSubtype(inputs) {
  const config = String(inputs.propertyDetails?.config || '').trim();
  const compact = config.toUpperCase().replace(/\s+/g, '');
  if (['1BHK', '2BHK', '3BHK'].includes(compact)) return compact;
  return inputs.propertyDetails?.subtype || inputs.propertyDetails?.type || null;
}

function unavailablePortfolioRiskSummary() {
  return {
    source: 'unavailable',
    portfolioSummary: {
      riskLevel: 'Unavailable',
      portfolioRiskScore: 0,
      proposedExposure: null,
      recommendedLtv: null,
      ltvAdjustmentPct: 0,
      reviewRecommendation: 'Portfolio concentration data unavailable. Single-case assessment still available.'
    },
    riskLenses: [],
    riskFlags: [],
    decisionImpact: {
      confidencePenalty: 0,
      ltvPenaltyPct: 0,
      seniorReviewRequired: false
    }
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function buildLiquidityAssessment({
  inputs = {},
  microMarket = {},
  localityIntelligence = null,
  infra = {},
  age = 5,
  type = 'Apartment',
  config = '2 BHK',
  demandScore = 0.6,
  cityTier = 1,
  hasKnownLegalStatus = false,
  hasImages = false,
  ipi = 0.5,
  marketPointEstimate = 0,
  propertyAreaSqft = 0,
  fallbackMode = false,
}) {
  const localityData = localityIntelligence || {};
  const localityObserved = Boolean(localityData && (localityData.source || localityData.eventsFound || localityData.acceptedEvents));
  const comparableCount = Number(microMarket?.comparableCount || 0);
  const demandNorm = clamp(Number(demandScore) || 0.6, 0, 1);
  const connectivityScore = clamp(Number(ipi) || 0.5, 0, 1);

  const localityDemandScore = (() => {
    const demandMap = { very_high: 0.9, high: 0.75, moderate: 0.55, low: 0.3 };
    const microDemand = demandMap[String(microMarket.demand || '').toLowerCase()] || 0.6;
    const localityBoost = localityObserved ? clamp((Number(localityIntelligence.marketabilityDelta) || 0) / 100 + 0.5, 0, 1) : 0.5;
    return clamp((microDemand * 0.7) + (localityBoost * 0.3), 0, 1);
  })();

  const configurationScore = (() => {
    const configMap = { '1 BHK': 0.75, '2 BHK': 0.82, '3 BHK': 0.78, '4 BHK+': 0.68, Studio: 0.62 };
    const base = configMap[config] ?? 0.72;
    const buyerPoolBoost = type === 'Commercial' ? 0.68 : 0.88;
    return clamp((base + buyerPoolBoost) / 2, 0, 1);
  })();

  const supplyBalanceScore = (() => {
    const marketPressure = clamp((comparableCount - 15) / 90, 0, 1);
    const oversupplyPenalty = (marketPressure > 0.7 ? (marketPressure - 0.7) * 0.6 : 0);
    return clamp(1 - oversupplyPenalty - (demandNorm < 0.45 ? 0.15 : 0), 0, 1);
  })();

  const ageScore = (() => {
    if (!Number.isFinite(Number(age)) || Number(age) < 0) return 0.65;
    if (Number(age) <= 5) return 0.9;
    if (Number(age) <= 10) return 0.8;
    if (Number(age) <= 20) return 0.65;
    if (Number(age) <= 30) return 0.5;
    return 0.35;
  })();

  const momentumScore = (() => {
    const localityGrowth = Number(localityData.growthSignals || 0);
    const riskPenalty = Number(localityData.riskSignals || 0) * 0.02;
    return clamp((localityObserved ? 0.5 + Math.min(0.5, localityGrowth / 10) - riskPenalty : 0.5), 0, 1);
  })();

  const legalAndStatusScore = (() => {
    if (!hasKnownLegalStatus) return 0.68;
    return hasKnownLegalStatus && inputs?.enrichment?.legalStatus === 'clear' ? 0.9 : 0.56;
  })();

  const weights = {
    localityDemand: 0.25,
    configuration: 0.15,
    connectivity: 0.20,
    supplyBalance: 0.15,
    age: 0.10,
    momentum: 0.10,
    legal: 0.05,
  };

  const factorScores = [
    { key: 'localityDemand', label: 'Locality demand & absorption', score: localityDemandScore, weight: weights.localityDemand, source: localityObserved ? 'micro_market + locality_intelligence' : 'micro_market_heuristic', status: localityObserved ? 'observed' : 'fallback' },
    { key: 'configuration', label: 'Property configuration and buyer pool', score: configurationScore, weight: weights.configuration, source: 'property_profile', status: 'observed' },
    { key: 'connectivity', label: 'Connectivity and infrastructure', score: connectivityScore, weight: weights.connectivity, source: infra?.metroDistance ? 'distance_to_infra' : 'heuristic_default', status: infra?.metroDistance ? 'observed' : 'fallback' },
    { key: 'supplyBalance', label: 'Supply pressure', score: supplyBalanceScore, weight: weights.supplyBalance, source: comparableCount ? 'micro_market_comparable_count' : 'fallback_heuristic', status: comparableCount ? 'observed' : 'fallback' },
    { key: 'age', label: 'Age and building profile', score: ageScore, weight: weights.age, source: 'property_metadata', status: 'observed' },
    { key: 'momentum', label: 'Local market momentum', score: momentumScore, weight: weights.momentum, source: localityObserved ? 'locality_events' : 'fallback_default', status: localityObserved ? 'observed' : 'fallback' },
    { key: 'legal', label: 'Legal status and title confidence', score: legalAndStatusScore, weight: weights.legal, source: hasKnownLegalStatus ? 'legal_status' : 'assumed_default', status: hasKnownLegalStatus ? 'observed' : 'fallback' },
  ];

  const weightedScore = factorScores.reduce((sum, factor) => sum + (factor.score * factor.weight), 0);
  const resalePotentialIndex = clamp(Math.round(weightedScore * 100), 0, 100);

  const fallbackStatus = factorScores.some((factor) => factor.status === 'fallback') ? 'heuristic_estimate' : 'observed_model';

  const timeToSellBase = (() => {
    const qualityModifier = resalePotentialIndex >= 75 ? 0.75 : resalePotentialIndex >= 55 ? 1 : resalePotentialIndex >= 35 ? 1.4 : 2.0;
    const demandModifier = demandNorm < 0.45 ? 1.3 : 1;
    const ageModifier = age > 25 ? 1.5 : age > 15 ? 1.2 : 1;
    const minDays = Math.round(45 * qualityModifier * demandModifier * ageModifier);
    const maxDays = Math.round(95 * qualityModifier * demandModifier * ageModifier + (hasImages ? 0 : 20));
    return { minDays: Math.max(20, minDays), maxDays: Math.max(minDays + 10, maxDays) };
  })();

  const timeToSell = {
    minDays: timeToSellBase.minDays,
    maxDays: timeToSellBase.maxDays,
    label: `${timeToSellBase.minDays} - ${timeToSellBase.maxDays} days`,
    fallback: fallbackStatus === 'heuristic_estimate',
    definition: 'Listing-to-accepted-offer window under normal market conditions',
    variance: 'Estimated range based on locality demand, connectivity, property profile and data coverage'
  };

  const forcedSaleDiscount = clamp(
    0.12 + (1 - resalePotentialIndex / 100) * 0.25 + (age > 20 ? 0.04 : 0) + (!hasKnownLegalStatus ? 0.04 : 0),
    0.12,
    0.42
  );
  const grossForcedSaleProceeds = marketPointEstimate * (1 - forcedSaleDiscount);
  const transactionCostPct = hasKnownLegalStatus && inputs?.enrichment?.legalStatus === 'clear' ? 0.06 : 0.08;
  const legalExposurePct = !hasKnownLegalStatus ? 0.04 : (inputs?.enrichment?.legalStatus === 'clear' ? 0.02 : 0.08);
  const netRecoveryPct = clamp(1 - forcedSaleDiscount - transactionCostPct - legalExposurePct, 0.20, 0.82);
  const netRecoveryValue = marketPointEstimate * netRecoveryPct;

  const distressLiquidation = {
    grossProceeds: Math.round(grossForcedSaleProceeds),
    netRecoveryValue: Math.round(netRecoveryValue),
    netRecoveryPct: Number(netRecoveryPct.toFixed(3)),
    forcedSaleDiscountPct: Number(forcedSaleDiscount.toFixed(3)),
    transactionCostPct: Number(transactionCostPct.toFixed(3)),
    legalExposurePct: Number(legalExposurePct.toFixed(3)),
    assumptions: [
      'Gross proceeds are estimated from the current market-value anchor and adjusted for a forced-sale discount.',
      'Net recovery deducts transaction costs and legal/encumbrance exposure where available.',
      'Missing legal and locality evidence keeps the scenario conservative.'
    ],
    scenario: fallbackStatus === 'heuristic_estimate' ? 'conservative_heuristic' : 'observed_market_scenario',
    status: fallbackStatus,
    range: {
      min: Math.round(netRecoveryValue * 0.92),
      max: Math.round(netRecoveryValue * 1.08)
    }
  };

  return {
    resalePotentialIndex,
    timeToSell,
    distressLiquidation,
    factors: factorScores,
    provenance: {
      localitySource: localityObserved ? (localityData.source || 'locality_live') : 'missing_locality_data',
      fallbackMode,
      freshness: localityObserved ? (localityData.generatedAt || 'unknown') : 'unknown',
      dataCoverage: localityObserved ? 'partial_market_corroboration' : 'weak_coverage',
    },
    summary: {
      resaleLabel: resalePotentialIndex >= 75 ? 'Strong resale potential' : resalePotentialIndex >= 50 ? 'Moderate resale potential' : 'Weak resale potential',
      timeLabel: timeToSell.label,
      distressLabel: distressLiquidation.netRecoveryPct >= 0.55 ? 'Recoverable under a distressed exit' : 'Low recovery expected under distress'
    }
  };
}

async function runVisionAudit(rawImages = []) {
  if (!rawImages.length) {
    return {
      source: 'no_images',
      conditionScore: 6.0,
      conditionFindings: 'No images uploaded. Adopting locality average.',
      qualityFindings: 'No interior imagery provided.',
      featuresFindings: 'Cannot verify feature count without imagery.',
      detectionsByImage: []
    };
  }

  const settled = await Promise.allSettled(rawImages.slice(0, 3).map((imageUrl) => scanPropertyImage(imageUrl)));
  const successful = settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  if (!successful.length) {
    return {
      source: 'unavailable',
      conditionScore: 6.0,
      conditionFindings: 'Vision model scan was unavailable. Manual visual verification is required.',
      qualityFindings: 'Image quality and finish classification unavailable.',
      featuresFindings: 'No object detections could be produced from uploaded imagery.',
      detectionsByImage: [],
      failures: settled
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason?.message || 'Vision scan failed')
    };
  }

  const allDetections = successful.flatMap((scan) => scan.results || []);
  const conditionScores = successful
    .map((scan) => Number(scan.conditionScore))
    .filter(Number.isFinite);
  const avgCondition = conditionScores.length
    ? conditionScores.reduce((sum, value) => sum + value, 0) / conditionScores.length
    : 7;
  const mediumOrHigh = allDetections.filter((item) => ['medium', 'high'].includes(item.severity));

  return {
    source: 'owlvit',
    model: successful[0]?.model,
    device: successful[0]?.device,
    conditionScore: Number(avgCondition.toFixed(1)),
    conditionFindings: mediumOrHigh.length
      ? `${mediumOrHigh.length} visual risk marker(s) detected by OWL-ViT. Review boxes in the visual audit.`
      : 'No high-confidence structural damage markers detected by OWL-ViT.',
    qualityFindings: successful.find((scan) => scan.qualityFindings)?.qualityFindings || 'Finish quality signals processed from uploaded images.',
    featuresFindings: `${allDetections.length} object detection(s) passed the configured threshold across uploaded images.`,
    detectionsByImage: successful.map((scan, index) => ({
      index,
      results: scan.results || [],
      conditionScore: scan.conditionScore
    }))
  };
}

export const runValuation = async (payload) => {
  const stage1 = isStage1Output(payload) ? payload : payload?.stage1 || null;
  const inputs = stage1 ? adaptStage1ForValuation(stage1) : payload;
  const canonicalProperty = canonicalizePropertyInput(inputs);
  const validation = validatePropertyRecord(canonicalProperty);
  if (!validation.valid) {
    throw new Error(`Property schema validation failed: ${validation.errors.join('; ')}`);
  }

  inputs.propertyDetails = {
    ...(inputs.propertyDetails || {}),
    ...canonicalProperty,
    area: canonicalProperty.areaSqft,
    areaSqft: canonicalProperty.areaSqft,
    areaUnit: canonicalProperty.areaUnit,
    age: canonicalProperty.ageYears,
    ageYears: canonicalProperty.ageYears,
    floor: canonicalProperty.floor,
    totalFloors: canonicalProperty.totalFloors,
    subtype: canonicalProperty.subtype,
    type: canonicalProperty.type,
    config: canonicalProperty.config,
  };

  const lat = inputs.coordinates?.[0] || 19.1136;
  const lon = inputs.coordinates?.[1] || 72.8697;
  const cityTier = inputs.cityTier || 1;

  // ─── LAYER 6: Coarse Bucket Assignment ───
  const coarseBucket = stage1?.locationIntelligence?.coarseBucket || assignCoarseBucket(lat, lon, cityTier);

  // ─── LAYER 7: Micro-Market Bucket Assignment ───
  const microMarket = stage1?.locationIntelligence?.microMarket || assignMicroMarketBucket(lat, lon);

  // ─── LAYER 8: Hyperlocal Context Extraction (async — Overpass API) ───
  let hyperlocalContext = stage1?.locationIntelligence?.hyperlocalContext;
  if (!hyperlocalContext?.summary) {
    try {
      hyperlocalContext = await extractHyperlocalContext(lat, lon);
    } catch (e) {
      console.warn('Hyperlocal extraction failed, using defaults');
      hyperlocalContext = {
        pois: [],
        summary: { metroDistance: 2000, schoolDistance: 2000, hospitalDistance: 3000, commercialDistance: 2000, totalPOIsFound: 0, transitCount: 0, amenityScore: 30 }
      };
    }
  }

  // Use real hyperlocal distances instead of hardcoded ones
  const infra = {
    metroDistance: hyperlocalContext.summary.metroDistance,
    highwayDistance: inputs.infrastructure?.highwayDistance || 2000,
    commercialHubDistance: hyperlocalContext.summary.commercialDistance,
    schoolDistance: hyperlocalContext.summary.schoolDistance,
    hospitalDistance: hyperlocalContext.summary.hospitalDistance
  };

  // 1. INFRASTRUCTURE & IPI ENGINE
  let ipiPoints = 0;
  if (infra.metroDistance <= 500) ipiPoints += 15;
  else if (infra.metroDistance <= 2000) ipiPoints += 10;
  else if (infra.metroDistance <= 5000) ipiPoints += 5;

  if (infra.highwayDistance <= 1000) ipiPoints += 8;
  if (infra.commercialHubDistance <= 2000) ipiPoints += 7;
  if (infra.schoolDistance <= 1000) ipiPoints += 5;
  if (infra.hospitalDistance <= 2000) ipiPoints += 5;
  
  const ipi = Math.min(ipiPoints / 50, 1.0);

  // 2. BASE VALUE ENGINE (uses coarse bucket circle rate)
  const effectiveCircleRate = coarseBucket.circleRate || inputs.circleRate || 15000;
  const effectiveArea = Number(inputs.propertyDetails.areaSqft ?? inputs.propertyDetails.area ?? 0);
  if (!effectiveArea || effectiveArea <= 0) {
    throw new Error('Property area is missing or invalid; valuation requires a valid area in sqft.');
  }
  const baseValue = effectiveCircleRate * effectiveArea;

  // 3. MARKET ADJUSTMENT ENGINE
  const demandMap = { 'very_high': 0.9, 'high': 0.75, 'moderate': 0.55, 'low': 0.3 };
  const demandScore = demandMap[microMarket.demand] || inputs.demandScore || 0.6;
  const marketLocationMultiplier = 1 + (ipi * 0.30) + (demandScore * 0.20);

  // 4. PROPERTY & CONDITION ENGINE
  const age = Number(inputs.propertyDetails.ageYears ?? inputs.propertyDetails.age ?? 5);
  const type = inputs.propertyDetails.type || "Apartment";
  
  let depreciation = 1;
  if (type === "Apartment" || type === "Villa" || type === "Penthouse" || type === "Duplex") {
    depreciation = Math.max(0.60, 1 - (age * 0.015));
  } else if (type === "Commercial") {
    depreciation = Math.max(0.50, 1 - (age * 0.012));
  }
  
  const floor = Number.isFinite(Number(inputs.propertyDetails.floor)) ? Number(inputs.propertyDetails.floor) : 0;
  const floorPremiums = [0.90, 0.93, 0.97, 1.00, 1.02, 1.04, 1.03, 1.01, 0.99];
  const floorMult = type === "Apartment" ? (floor < floorPremiums.length ? floorPremiums[floor] : 0.99) : 1.0;

  const config = inputs.propertyDetails.config || "2 BHK";
  const configMap = { "1 BHK": 0.95, "2 BHK": 1.00, "3 BHK": 1.07, "4 BHK+": 1.12, "Studio": 0.90 };
  let configMult = configMap[config] || 1.0;
  if (type === "Villa") configMult = 1.20;

  const marketPointEstimate = baseValue * marketLocationMultiplier * depreciation * floorMult * configMult;

  // 5. UNCERTAINTY & CONFIDENCE ENGINE
  let confidence = 0.50;
  const enrich = inputs.enrichment || {};
  const hasKnownLegalStatus = isKnownOptional(enrich.legalStatus);
  
  if (hasKnownLegalStatus) confidence += 0.05;
  if (enrich.occupancy) confidence += 0.05;
  if (enrich.rental > 0) confidence += 0.05;
  confidence += 0.05;
  confidence += 0.05;
  
  let hasImages = false;
  if (enrich.images?.exterior) { confidence += 0.08; hasImages = true; }
  if (enrich.images?.interior) { confidence += 0.07; hasImages = true; }
  // NOTE: the wizard-side `runVisionAudit` is kept only for display compatibility.
  // It must NOT alter confidence — the only auditable image-evidence path is the
  // separate Visual Collateral Evidence layer (visualEvidenceEngine.js), applied
  // with hard caps at the Dashboard level. See ABSOLUTE CORE RULES.
  const visionAudit = await runVisionAudit(enrich.rawImages || []);

  confidence = Math.min(confidence, 0.90);

  let buffer = 0.08;
  if (!hasImages) buffer += 0.05;

  const spreadPct = Math.max(0.08, Math.min(0.22, buffer + (1 - confidence) * 0.22));
  const marketValueRange = [
    Math.round(marketPointEstimate * (1 - spreadPct)),
    Math.round(marketPointEstimate * (1 + spreadPct))
  ];

  // Locality intelligence may be supplied by Stage 1 or resolved asynchronously later.
  let localityIntelligence = stage1?.locationIntelligence || null;

  // 6. LIQUIDITY ENGINE (resale potential, time to sell, distress recovery)
  const liquidityAssessment = buildLiquidityAssessment({
    inputs,
    microMarket,
    localityIntelligence,
    infra,
    age,
    type,
    config,
    demandScore,
    cityTier,
    hasKnownLegalStatus,
    hasImages,
    ipi,
    marketPointEstimate,
    propertyAreaSqft: Number(inputs.propertyDetails.areaSqft ?? inputs.propertyDetails.area ?? 0),
    fallbackMode: !localityIntelligence || !localityIntelligence.source
  });

  const rpi = liquidityAssessment.resalePotentialIndex;
  const distressRange = [
    liquidityAssessment.distressLiquidation.range.min,
    liquidityAssessment.distressLiquidation.range.max
  ];
  const ttlBaseMin = liquidityAssessment.timeToSell.minDays;
  const ttlBaseMax = liquidityAssessment.timeToSell.maxDays;

  // ─── LAYERS 9–14: Anomaly Detection & Decision Engine ───
  const anomalyResults = runAnomalyPipeline(
    { area: inputs.propertyDetails.area, config, type, subtype: inputs.propertyDetails.subtype, age },
    coarseBucket,
    microMarket,
    hyperlocalContext,
    hasImages,
    hasKnownLegalStatus,
    {
      stage1,
      fieldCompleteness: inputs.fieldCompleteness,
      coordinates: inputs.coordinates,
      location: inputs.location
    }
  );
  const stage2Output = anomalyResults.stage2Output;

  // FRAUD ENGINE — merge anomaly flags with legacy risk flags
  const riskFlags = [...anomalyResults.flags];
  
  if (config === "2 BHK" && (inputs.propertyDetails.area < 500 || inputs.propertyDetails.area > 1400)) {
    riskFlags.push({ id: 'SIZE_CONFIG_MISMATCH', title: 'Size-Config Mismatch', text: `Size mismatch: ${inputs.propertyDetails.area} sqft is an anomaly for 2 BHK.`, severity: "critical", source: 'fraud_engine', anomalyScore: 25 });
  }
  if (!hasImages) {
    riskFlags.push({ id: 'NO_IMAGES', title: 'No Visual Verification', text: "No images provided: Physical site inspection recommended.", severity: "low", source: 'fraud_engine', anomalyScore: 5 });
  }
  if (hasKnownLegalStatus && enrich.legalStatus !== "clear") {
    riskFlags.push({ id: 'LEGAL_RISK', title: 'Legal Complexity', text: "Legal complexity detected. Detailed title search required.", severity: "high", source: 'fraud_engine', anomalyScore: 15 });
  }

  const keyDrivers = [];
  if (infra.metroDistance <= 500) keyDrivers.push({ name: "Proximity to Metro", impact: "+15%", positive: true });
  else if (infra.metroDistance <= 2000) keyDrivers.push({ name: "Metro Access", impact: "+8%", positive: true });
  if (age < 5) keyDrivers.push({ name: "New Construction Premium", impact: "+8%", positive: true });
  if (age > 20) keyDrivers.push({ name: "Age Depreciation", impact: "-10%", positive: false });
  if (ipi > 0.7) keyDrivers.push({ name: "High Infra Access", impact: "+12%", positive: true });
  if (microMarket.demand === 'very_high') keyDrivers.push({ name: "High Demand Micro-Market", impact: "+10%", positive: true });
  if (microMarket.demand === 'low') keyDrivers.push({ name: "Low Demand Penalty", impact: "-8%", positive: false });

  const formatINR = (value) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(0)}L`;
    return `₹${value.toLocaleString('en-IN')}`;
  };

  // Apply decision-based confidence penalty
  if (stage2Output?.decision === 'ACCEPT_CONFIDENCE_PENALTY') {
    confidence = Math.max(0.35, confidence - 0.15);
  }

  const confidenceBeforeHistorical = confidence;
  const historicalCaseSummary = await buildHistoricalCaseSummary({
    stage1,
    inputs,
    microMarket,
    baseConfidence: confidenceBeforeHistorical
  });
  const historicalConfidence = historicalCaseSummary.finalConfidence;
  confidence = Math.min(0.95, Math.max(0.25, Number.isFinite(historicalConfidence) ? historicalConfidence : confidence));
  const estimatedMarketValue = Math.round((marketValueRange[0] + marketValueRange[1]) / 2);
  const portfolioRiskSummary = await resolvePortfolioConcentrationFromBackend({
    microMarketId: stage1?.bucketAssignment?.microMarketBucket?.id || microMarket?.bucketId,
    localityName: inputs.location,
    propertyType: normalizePortfolioPropertyType(type),
    subtype: normalizePortfolioSubtype(inputs),
    estimatedMarketValue,
    requestedLoanAmount: null,
    baseLtv: 0.65,
    liquidityTier: stage1?.bucketAssignment?.microMarketBucket?.liquidityNorm,
    liquidityIndex: stage1?.marketNorms?.liquidityIndex ?? microMarket?.norms?.liquidityIndex
  }) || unavailablePortfolioRiskSummary();

  // Hyperlocal Event Intelligence — runs after Stage 1 context, AFTER existing
  // SQLite-backed engines. Soft-fails to null → dashboard shows degraded state.
  // Never alters base marketValue / circleRate / historical comps.
  localityIntelligence = await resolveLocalityIntelligenceFromBackend({
    locality: stage1?.bucketAssignment?.microMarketBucket?.label
      || stage1?.normalizedPropertyProfile?.address?.split(',')[0]?.trim()
      || inputs.location,
    microMarketId: stage1?.bucketAssignment?.microMarketBucket?.id || microMarket?.bucketId,
    city: 'Mumbai',
    zone: stage1?.bucketAssignment?.coarseBucket?.label || coarseBucket?.adminRegion,
    lat,
    lon,
    aliases: [],
  }) || localityIntelligence;
  // Apply bounded confidence overlay from accepted locality events (already capped server-side).
  if (localityIntelligence && Number.isFinite(localityIntelligence.confidenceDelta)) {
    confidence = Math.min(0.95, Math.max(0.25, confidence + localityIntelligence.confidenceDelta));
  }

  return {
    caseDetails: {
      address: inputs.location,
      type,
      config,
      area: inputs.propertyDetails.areaSqft ?? inputs.propertyDetails.area,
      age: `${age} years`,
      ageBucket: inputs.propertyDetails.ageBucket || 'mid',
      subtype: inputs.propertyDetails.subtype || null,
      areaUnit: inputs.propertyDetails.areaUnit || 'sqft',
      areaRaw: inputs.propertyDetails.areaRaw || inputs.propertyDetails.areaSqft || inputs.propertyDetails.area,
      facing: "Not Spec"
    },
    PropIntel: rpi,
    confidence,
    confidenceBreakdown: {
      base: 0.60,
      legal: hasKnownLegalStatus && enrich.legalStatus === 'clear' ? 0.05 : 0,
      visual: hasImages ? 0.15 : 0,
      historical: Math.max(historicalCaseSummary.confidenceAdjustment, 0),
      historicalDelta: historicalCaseSummary.confidenceAdjustment
    },
    marketValue: `${formatINR(marketValueRange[0])} - ${formatINR(marketValueRange[1])}`,
    distressValue: `${formatINR(distressRange[0])} - ${formatINR(distressRange[1])}`,
    timeToSell: `${ttlBaseMin} - ${ttlBaseMax} days`,
    liquidityAssessment,
    resalePotentialIndex: rpi,
    estimatedTimeToSell: liquidityAssessment.timeToSell,
    distressLiquidation: liquidityAssessment.distressLiquidation,
    drivers: keyDrivers.length > 0 ? keyDrivers : [{name: "Standard Config", impact: "0%", positive: true}],
    risks: riskFlags.length > 0 ? riskFlags.map(r => ({ text: r.text || r.explanation || r.title, severity: r.severity, ...r })) : [{text: "Standard local competition", severity: "low"}],
    ltv: Math.round(100 * (1 - (liquidityAssessment.distressLiquidation.forcedSaleDiscountPct || 0.2) - 0.1)),
    visualAudit: visionAudit,
    rawImages: enrich.rawImages || [],
    featureSchema: {
      canonicalFields: ['type', 'subtype', 'config', 'areaSqft', 'ageYears', 'floor', 'totalFloors'],
      assumptions: [
        `Type normalized from ${canonicalProperty.typeSource || 'derived'} input`,
        `Area standardized to sqft from ${canonicalProperty.areaSource || 'assumed'} source`,
        `Config normalized to ${config}`,
        `Age normalized from ${canonicalProperty.ageSource || 'assumed'} input`
      ],
      validation,
      uncertainty: {
        method: 'confidence-driven interval',
        lowerBound: marketValueRange[0],
        upperBound: marketValueRange[1],
        spreadPct: Number(spreadPct.toFixed(3))
      }
    },

    // ─── New: Intelligence pipeline outputs ───
    coarseBucket,
    microMarket,
    hyperlocalContext,
    anomalyResults,
    dataSufficiency: anomalyResults.dataSufficiency,
    verificationDecision: anomalyResults.decision,
    stage2Output,
    historicalCaseSummary,
    localityIntelligence,
    portfolioRiskSummary,
    fieldCompleteness: inputs.fieldCompleteness || null,
    stage1,
    stage1Output: stage1,
    ipi,
    effectiveCircleRate
  };
};

