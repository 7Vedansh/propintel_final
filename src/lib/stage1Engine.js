import {
  assignCoarseBucket,
  assignMicroMarketBucket,
  extractHyperlocalContext,
  resolveLocation
} from './locationIntelligence.js';
import { resolveStage1ContextFromBackend } from './api.js';

export const UNIT_CONVERSIONS = {
  sqft: { toSqft: 1, label: 'Sq.Ft' },
  sqm: { toSqft: 10.7639, label: 'Sq.M' },
  sqyd: { toSqft: 9, label: 'Sq.Yd' }
};

export const PROPERTY_SUBTYPES = {
  Apartment: ['Apartment', 'Penthouse', 'Duplex', 'Studio'],
  Villa: ['Villa', 'Row House', 'Bungalow', 'Independent House', 'Farmhouse'],
  Commercial: ['Office', 'Shop', 'Showroom', 'Warehouse', 'Co-working'],
  Plot: ['Residential Plot', 'Commercial Plot', 'Agricultural Land']
};

const DEFAULT_COORDINATES = [19.1136, 72.8697];
const EMPTY_OPTIONAL = 'not_provided';

const TYPE_ALIASES = {
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
  farmhouse: 'Villa',
  'independent house': 'Villa',
  commercial: 'Commercial',
  office: 'Commercial',
  shop: 'Commercial',
  showroom: 'Commercial',
  warehouse: 'Commercial',
  godown: 'Commercial',
  'co-working': 'Commercial',
  coworking: 'Commercial',
  plot: 'Plot',
  land: 'Plot',
  'residential plot': 'Plot',
  'commercial plot': 'Plot',
  agricultural: 'Plot',
  'agricultural land': 'Plot'
};

const SUBTYPE_ALIASES = {
  apartment: 'Apartment',
  flat: 'Apartment',
  condo: 'Apartment',
  penthouse: 'Penthouse',
  duplex: 'Duplex',
  triplex: 'Duplex',
  studio: 'Studio',
  villa: 'Villa',
  bungalow: 'Bungalow',
  'row house': 'Row House',
  townhouse: 'Row House',
  farmhouse: 'Farmhouse',
  'independent house': 'Independent House',
  office: 'Office',
  shop: 'Shop',
  showroom: 'Showroom',
  warehouse: 'Warehouse',
  godown: 'Warehouse',
  'co-working': 'Co-working',
  coworking: 'Co-working',
  plot: 'Residential Plot',
  land: 'Residential Plot',
  'residential plot': 'Residential Plot',
  'commercial plot': 'Commercial Plot',
  agricultural: 'Agricultural Land',
  'agricultural land': 'Agricultural Land'
};

const SUBTYPE_TYPE = Object.entries(PROPERTY_SUBTYPES).reduce((acc, [type, subtypes]) => {
  subtypes.forEach((subtype) => {
    acc[subtype.toLowerCase()] = type;
  });
  return acc;
}, {});

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function toDisplayText(value) {
  if (value === null || value === undefined || value === '') return EMPTY_OPTIONAL;
  return String(value).trim();
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidCoordinatePair(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function roundCoordinate(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
}

function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return 'Not resolved';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatINRPerSqft(value) {
  if (!Number.isFinite(value)) return 'INR not resolved';
  return `INR ${Math.round(value).toLocaleString('en-IN')}/sqft`;
}

function deterministicCoordinatesFromAddress(address) {
  const source = String(address || 'default');
  const seed = [...source].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const latOffset = ((seed % 160) - 80) / 10000;
  const lonOffset = (((seed * 7) % 160) - 80) / 10000;
  return [roundCoordinate(DEFAULT_COORDINATES[0] + latOffset), roundCoordinate(DEFAULT_COORDINATES[1] + lonOffset)];
}

function withTimeout(promise, fallback, timeoutMs = 6500) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

function getInputCoordinates(input) {
  const lat = parseNumber(input.lat ?? input.latitude ?? input.coordinates?.[0] ?? input.locationCoordinates?.[0]);
  const lon = parseNumber(input.lon ?? input.lng ?? input.longitude ?? input.coordinates?.[1] ?? input.locationCoordinates?.[1]);
  return isValidCoordinatePair(lat, lon) ? [roundCoordinate(lat), roundCoordinate(lon)] : null;
}

function normalizeDbPropertyType(propertyType) {
  const key = normalizeKey(propertyType);
  if (['apartment', 'villa', 'residential', 'flat', 'house'].includes(key)) return 'Residential';
  if (['commercial', 'office', 'shop', 'showroom', 'warehouse'].includes(key)) return 'Commercial';
  return propertyType || 'Residential';
}

function normalizeDbSubtype(rawIntake, taxonomy) {
  const config = String(rawIntake.config || '').trim();
  const compactConfig = config.toUpperCase().replace(/\s+/g, '');
  if (['1BHK', '2BHK', '3BHK'].includes(compactConfig)) return compactConfig;
  return taxonomy.propertySubtype === 'Unspecified' ? null : taxonomy.propertySubtype;
}

export function normalizeSizeToSqft(rawSize, rawUnit = 'sqft') {
  const size = parseNumber(rawSize);
  const unit = normalizeKey(rawUnit) || 'sqft';
  const conversion = UNIT_CONVERSIONS[unit] || UNIT_CONVERSIONS.sqft;

  return {
    rawSize: size,
    rawSizeUnit: UNIT_CONVERSIONS[unit] ? unit : 'sqft',
    standardizedSizeSqft: size !== null ? Math.round(size * conversion.toSqft) : null
  };
}

export function deriveAgeBucket(ageInput) {
  if (ageInput === null || ageInput === undefined || ageInput === '') {
    return { ageYears: null, ageBucket: 'Unknown' };
  }

  const ageText = String(ageInput).trim();
  const rangeMatch = ageText.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/i);
  const years = rangeMatch
    ? (Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2
    : parseNumber(ageText);

  if (!Number.isFinite(years)) return { ageYears: null, ageBucket: 'Unknown' };
  if (years < 5) return { ageYears: years, ageBucket: 'New' };
  if (years <= 15) return { ageYears: years, ageBucket: 'Mid-age' };
  return { ageYears: years, ageBucket: 'Old' };
}

export function normalizeTaxonomy(input) {
  const rawType = input.propertyType ?? input.type ?? input.propertyDetails?.type;
  const rawSubtype = input.propertySubtype ?? input.subtype ?? input.propertyDetails?.subtype;

  const subtypeKey = normalizeKey(rawSubtype);
  const normalizedSubtype = SUBTYPE_ALIASES[subtypeKey] || toDisplayText(rawSubtype);
  const subtypeType = SUBTYPE_TYPE[normalizeKey(normalizedSubtype)];

  const typeKey = normalizeKey(rawType);
  const normalizedType = TYPE_ALIASES[typeKey] || subtypeType || toDisplayText(rawType);

  return {
    propertyType: normalizedType === EMPTY_OPTIONAL ? 'Unspecified' : normalizedType,
    propertySubtype: normalizedSubtype === EMPTY_OPTIONAL ? 'Unspecified' : normalizedSubtype
  };
}

export function computeCompletenessStatus(input, normalizedParts = {}) {
  const address = String(input.address ?? input.location ?? '').trim();
  const coords = getInputCoordinates(input);
  const size = normalizedParts.size ?? normalizeSizeToSqft(input.size ?? input.area ?? input.propertyDetails?.areaRaw ?? input.propertyDetails?.area, input.sizeUnit ?? input.areaUnit ?? input.propertyDetails?.areaUnit);
  const age = normalizedParts.age ?? deriveAgeBucket(input.ageYears ?? input.age ?? input.propertyDetails?.age);
  const taxonomy = normalizedParts.taxonomy ?? normalizeTaxonomy(input);

  const requiredFields = [
    { key: 'addressOrCoordinates', label: 'address or coordinates', complete: address.length >= 3 || Boolean(coords) },
    { key: 'propertyType', label: 'property type', complete: taxonomy.propertyType !== 'Unspecified' },
    { key: 'propertySubtype', label: 'property subtype', complete: taxonomy.propertySubtype !== 'Unspecified' },
    { key: 'size', label: 'size', complete: Number(size.standardizedSizeSqft) > 0 },
    { key: 'age', label: 'age', complete: age.ageYears !== null }
  ];

  const missingFields = requiredFields.filter((field) => !field.complete).map((field) => field.label);

  return {
    mandatoryComplete: missingFields.length === 0,
    missingFields
  };
}

async function resolveLocationPair(input) {
  const rawAddress = String(input.address ?? input.location ?? '').trim();
  const explicitCoords = getInputCoordinates(input);
  const fallback = { address: rawAddress, coordinates: explicitCoords };

  let resolved = fallback;
  if (rawAddress || explicitCoords) {
    try {
      resolved = await withTimeout(resolveLocation(rawAddress, explicitCoords), fallback);
    } catch (error) {
      console.warn('Stage 1 location resolution fallback used:', error);
      resolved = fallback;
    }
  }

  let coordinates = getInputCoordinates({ coordinates: resolved.coordinates }) || explicitCoords;
  if (!coordinates && rawAddress) coordinates = deterministicCoordinatesFromAddress(rawAddress);
  if (!coordinates) coordinates = DEFAULT_COORDINATES;

  const address = String(resolved.address || rawAddress || '').trim()
    || `Coordinate pin ${coordinates[0].toFixed(5)}, ${coordinates[1].toFixed(5)}`;

  return {
    address,
    lat: roundCoordinate(coordinates[0]),
    lon: roundCoordinate(coordinates[1])
  };
}

function fallbackHyperlocalContext(lat, lon) {
  return {
    pois: [],
    summary: {
      metroDistance: null,
      schoolDistance: null,
      hospitalDistance: null,
      commercialDistance: null,
      totalPOIsFound: 0,
      transitCount: 0,
      amenityScore: 0
    }
  };
}

async function resolveHyperlocalContext(lat, lon) {
  const fallback = fallbackHyperlocalContext(lat, lon);
  try {
    const result = await withTimeout(extractHyperlocalContext(lat, lon), fallback, 30000);
    return result?.summary ? result : fallback;
  } catch (error) {
    console.warn('Stage 1 hyperlocal fallback used:', error);
    return fallback;
  }
}

async function resolveSqliteStage1Context(location, rawIntake, taxonomy) {
  const sqliteContext = await resolveStage1ContextFromBackend({
    lat: location.lat,
    lon: location.lon,
    propertyType: normalizeDbPropertyType(taxonomy.propertyType),
    subtype: normalizeDbSubtype(rawIntake, taxonomy)
  });

  return sqliteContext?.bucketAssignment ? sqliteContext : null;
}

function demandTierToLegacyDemand(demandTier) {
  const key = normalizeKey(demandTier);
  if (key === 'prime') return 'very_high';
  if (key === 'high') return 'high';
  if (key === 'medium-high') return 'high';
  if (key === 'medium') return 'moderate';
  return 'moderate';
}

function buildSqliteLocationIntelligence(sqliteContext) {
  const locality = sqliteContext.locality || {};
  const marketNorms = sqliteContext.marketNorms || {};
  const circleRate = sqliteContext.circleRate || {};
  const coarseBucket = sqliteContext.bucketAssignment?.coarseBucket || {};

  return {
    coarseBucket: {
      zoneId: locality.coarseZoneId || coarseBucket.id,
      circleRate: circleRate.ratePerSqft || coarseBucket.circleRate || null,
      landUseType: locality.broadLandUse || coarseBucket.broadLandUse || 'Residential',
      adminRegion: locality.regulatoryRegion || coarseBucket.regulatoryRegion || 'Mumbai',
      source: 'sqlite_reference_database'
    },
    microMarket: {
      bucketId: locality.microMarketId,
      norms: {
        sizeP5: marketNorms.sizeP5,
        sizeP50: marketNorms.sizeP50,
        sizeP95: marketNorms.sizeP95,
        dominantSubtype: marketNorms.subtypePrevalence,
        avgPricePerSqft: marketNorms.pricePsfP50,
        medianRentalYield: null
      },
      demand: demandTierToLegacyDemand(locality.demandTier),
      comparableCount: marketNorms.comparableCount,
      dataFreshnessDays: 0,
      localityName: locality.localityName,
      liquidityIndex: marketNorms.liquidityIndex,
      source: 'sqlite_reference_database'
    }
  };
}

function buildBucketAssignment(coarseBucket, microMarket, hyperlocalContext, lat, lon) {
  const summary = hyperlocalContext.summary || {};
  const norms = microMarket.norms || {};

  const accessQuality = summary.amenityScore >= 70
    ? 'High'
    : summary.amenityScore >= 45
      ? 'Moderate'
      : 'Limited';

  return {
    coarseBucket: {
      id: coarseBucket.zoneId,
      label: `${coarseBucket.adminRegion} ${titleCase(coarseBucket.landUseType)} Zone`,
      circleRateZone: `${coarseBucket.zoneId} - ${formatINRPerSqft(coarseBucket.circleRate)}`,
      broadLandUse: titleCase(coarseBucket.landUseType),
      regulatoryRegion: coarseBucket.adminRegion,
      circleRate: coarseBucket.circleRate,
      source: coarseBucket.source
    },
    microMarketBucket: {
      id: microMarket.bucketId,
      label: `${titleCase(microMarket.demand)} Demand Cluster`,
      subtypePrevalence: norms.dominantSubtype || 'Not resolved',
      commonSizeBand: `${norms.sizeP5 || '-'}-${norms.sizeP95 || '-'} sqft`,
      localPriceBand: formatINRPerSqft(norms.avgPricePerSqft),
      liquidityNorm: titleCase(microMarket.demand),
      comparableCount: microMarket.comparableCount,
      dataFreshnessDays: microMarket.dataFreshnessDays
    },
    hyperlocalContext: {
      id: `HL-${Number(lat).toFixed(4)}-${Number(lon).toFixed(4)}`,
      roadAccess: summary.commercialDistance <= 1000 ? 'Strong arterial and commercial access' : 'Standard local road access',
      nearestTransit: formatDistance(summary.metroDistance),
      infraProximity: `School ${formatDistance(summary.schoolDistance)} | Hospital ${formatDistance(summary.hospitalDistance)} | Commercial ${formatDistance(summary.commercialDistance)}`,
      accessQuality,
      amenityScore: summary.amenityScore
    }
  };
}

function getImageList(input) {
  if (Array.isArray(input.images)) return input.images;
  if (Array.isArray(input.rawImages)) return input.rawImages;
  if (Array.isArray(input.enrichment?.rawImages)) return input.enrichment.rawImages;
  return [];
}

function getRawIntake(input) {
  const images = getImageList(input);
  return {
    address: input.address ?? input.location ?? '',
    lat: input.lat ?? input.latitude ?? input.coordinates?.[0] ?? '',
    lon: input.lon ?? input.lng ?? input.longitude ?? input.coordinates?.[1] ?? '',
    propertyType: input.propertyType ?? input.type ?? input.propertyDetails?.type ?? '',
    propertySubtype: input.propertySubtype ?? input.subtype ?? input.propertyDetails?.subtype ?? '',
    config: input.config ?? input.propertyDetails?.config ?? '',
    size: input.size ?? input.area ?? input.propertyDetails?.areaRaw ?? input.propertyDetails?.area ?? '',
    sizeUnit: input.sizeUnit ?? input.areaUnit ?? input.propertyDetails?.areaUnit ?? 'sqft',
    age: input.ageYears ?? input.age ?? input.propertyDetails?.age ?? '',
    floor: input.floor ?? input.propertyDetails?.floor ?? '',
    legalStatus: input.legalStatus ?? input.enrichment?.legalStatus ?? '',
    titleClarity: input.titleClarity ?? input.enrichment?.titleClarity ?? '',
    occupancy: input.occupancy ?? input.enrichment?.occupancy ?? '',
    rentalAmount: input.rentalAmount ?? input.enrichment?.rental ?? '',
    images,
    cityTier: input.cityTier ?? '',
    infrastructure: input.infrastructure || null
  };
}

export async function buildStage1Output(input = {}) {
  const rawIntake = getRawIntake(input);
  const location = await resolveLocationPair(rawIntake);
  const taxonomy = normalizeTaxonomy(rawIntake);
  const size = normalizeSizeToSqft(rawIntake.size, rawIntake.sizeUnit);
  const age = deriveAgeBucket(rawIntake.age);
  const completenessStatus = computeCompletenessStatus(rawIntake, { taxonomy, size, age });
  const cityTier = input.cityTier || 1;
  const sqliteContext = await resolveSqliteStage1Context(location, rawIntake, taxonomy);

  const sqliteLocationIntelligence = sqliteContext
    ? buildSqliteLocationIntelligence(sqliteContext)
    : null;
  const coarseBucketRaw = sqliteLocationIntelligence?.coarseBucket
    || assignCoarseBucket(location.lat, location.lon, cityTier);
  const microMarketRaw = sqliteLocationIntelligence?.microMarket
    || assignMicroMarketBucket(location.lat, location.lon);
  const hyperlocalRaw = await resolveHyperlocalContext(location.lat, location.lon);
  const bucketAssignment = sqliteContext?.bucketAssignment
    || buildBucketAssignment(coarseBucketRaw, microMarketRaw, hyperlocalRaw, location.lat, location.lon);

  const normalizedPropertyProfile = {
    address: location.address,
    lat: location.lat,
    lon: location.lon,
    propertyType: taxonomy.propertyType,
    propertySubtype: taxonomy.propertySubtype,
    standardizedSizeSqft: size.standardizedSizeSqft,
    rawSize: size.rawSize,
    rawSizeUnit: size.rawSizeUnit,
    ageYears: age.ageYears,
    ageBucket: age.ageBucket,
    legalStatus: toDisplayText(rawIntake.legalStatus),
    titleClarity: toDisplayText(rawIntake.titleClarity),
    occupancy: toDisplayText(rawIntake.occupancy),
    rentalAmount: parseNumber(rawIntake.rentalAmount),
    imageCount: rawIntake.images.length,
    completenessStatus
  };

  const completedFieldCount = 5 - completenessStatus.missingFields.length;

  return {
    normalizedPropertyProfile,
    bucketAssignment,
    rawIntake,
    marketNorms: sqliteContext?.marketNorms || null,
    circleRate: sqliteContext?.circleRate || null,
    locationIntelligence: {
      coarseBucket: coarseBucketRaw,
      microMarket: microMarketRaw,
      hyperlocalContext: hyperlocalRaw
    },
    stage1Metadata: {
      version: 'stage1.v1',
      completenessScore: completedFieldCount / 5,
      contextSource: sqliteContext ? 'sqlite' : 'fallback',
      contextSourceLabel: sqliteContext ? 'SQLite reference database' : 'Fallback generated context',
      locationMatchConfidence: sqliteContext?.matchConfidence || 'fallback',
      locationMatchDistanceKm: sqliteContext?.distanceKm ?? null,
      generatedAt: new Date().toISOString()
    }
  };
}

export function isStage1Output(input) {
  return Boolean(input?.normalizedPropertyProfile && input?.bucketAssignment);
}

function legacyAgeBucket(ageBucket) {
  if (ageBucket === 'New') return 'new';
  if (ageBucket === 'Old') return 'old';
  if (ageBucket === 'Mid-age') return 'mid';
  return 'unknown';
}

function demandScoreFromBucket(microMarket) {
  const demandMap = { very_high: 0.9, high: 0.75, moderate: 0.55, low: 0.3 };
  return demandMap[microMarket?.demand] || 0.6;
}

function buildLegacyFieldCompleteness(stage1) {
  const profile = stage1.normalizedPropertyProfile;
  const raw = stage1.rawIntake || {};
  const hasRental = Number(profile.rentalAmount) > 0;
  const fields = {
    address: { filled: Boolean(profile.address), mandatory: true, label: 'Address or Coordinates' },
    type: { filled: profile.propertyType !== 'Unspecified', mandatory: true, label: 'Property Type' },
    subtype: { filled: profile.propertySubtype !== 'Unspecified', mandatory: true, label: 'Property Subtype' },
    area: { filled: Number(profile.standardizedSizeSqft) > 0, mandatory: true, label: 'Area' },
    age: { filled: profile.ageYears !== null, mandatory: true, label: 'Age' },
    legal: { filled: profile.legalStatus !== EMPTY_OPTIONAL, mandatory: false, label: 'Legal Status' },
    title: { filled: profile.titleClarity !== EMPTY_OPTIONAL, mandatory: false, label: 'Title Clarity' },
    occupancy: { filled: profile.occupancy !== EMPTY_OPTIONAL, mandatory: false, label: 'Occupancy' },
    rental: { filled: hasRental, mandatory: false, label: 'Rental Amount' },
    images: { filled: profile.imageCount > 0, mandatory: false, label: 'Images' }
  };
  const filledCount = Object.values(fields).filter((field) => field.filled).length;

  return {
    mandatoryComplete: profile.completenessStatus.mandatoryComplete,
    score: filledCount / Object.keys(fields).length,
    fields,
    raw
  };
}

export function adaptStage1ForValuation(stage1) {
  const profile = stage1.normalizedPropertyProfile;
  const raw = stage1.rawIntake || {};
  const locationIntelligence = stage1.locationIntelligence || {};
  const hyperSummary = locationIntelligence.hyperlocalContext?.summary || {};

  return {
    location: profile.address,
    coordinates: [profile.lat, profile.lon],
    circleRate: locationIntelligence.coarseBucket?.circleRate || stage1.bucketAssignment?.coarseBucket?.circleRate || 15000,
    cityTier: raw.cityTier || 1,
    demandScore: demandScoreFromBucket(locationIntelligence.microMarket),
    infrastructure: {
      metroDistance: hyperSummary.metroDistance || 2000,
      highwayDistance: raw.infrastructure?.highwayDistance || 2000,
      commercialHubDistance: hyperSummary.commercialDistance || 2000,
      schoolDistance: hyperSummary.schoolDistance || 2000,
      hospitalDistance: hyperSummary.hospitalDistance || 3000
    },
    propertyDetails: {
      type: profile.propertyType === 'Unspecified' ? 'Apartment' : profile.propertyType,
      subtype: profile.propertySubtype === 'Unspecified' ? null : profile.propertySubtype,
      config: raw.config || '2 BHK',
      area: profile.standardizedSizeSqft || 0,
      areaRaw: profile.rawSize || profile.standardizedSizeSqft || 0,
      areaUnit: profile.rawSizeUnit || 'sqft',
      age: profile.ageYears || 0,
      ageBucket: legacyAgeBucket(profile.ageBucket),
      floor: parseNumber(raw.floor) || 0
    },
    enrichment: {
      legalStatus: profile.legalStatus,
      titleClarity: profile.titleClarity,
      occupancy: profile.occupancy,
      rental: profile.rentalAmount || 0,
      images: {
        exterior: profile.imageCount > 0,
        interior: profile.imageCount > 1
      },
      rawImages: raw.images || []
    },
    fieldCompleteness: buildLegacyFieldCompleteness(stage1),
    stage1
  };
}
