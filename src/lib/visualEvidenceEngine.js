import { summarizePacketMetadata } from './imageMetadata.js';

// Visual Collateral Evidence — deterministic rule engine.
//
// PropIntel does NOT build the secure capture layer. We consume a standardized
// image packet + metadata and convert it into auditable, bounded scoring
// effects. If anything is missing or fails, image impact is zero.
//
// Hard contract:
//   - No images           -> image impact = 0
//   - Incomplete packet   -> image impact = 0
//   - Model unavailable   -> image impact = 0 (UI must say so)
//   - Detection below thr -> ignored
//   - Strong signal       -> bounded confidence + valuation effect + inspection route
//   - Caps in IMG_CAP_001 are absolute.

export const REQUIRED_CATEGORIES = [
  { id: 'front_exterior',       label: 'Front Exterior' },
  { id: 'entrance_identity',    label: 'Entrance / Nameplate / Building Identity' },
  { id: 'main_interior',        label: 'Main Interior Area' },
  { id: 'wet_utility_area',     label: 'Kitchen / Bathroom / Utility Area' },
  { id: 'damage_or_no_damage',  label: 'Damage Evidence or No-Damage Declaration' },
];

export const OPTIONAL_CATEGORIES = [
  { id: 'parking_or_common_area',   label: 'Parking / Common Area' },
  { id: 'basement_or_ground_floor', label: 'Basement / Ground Floor' },
  { id: 'terrace_or_roof',          label: 'Terrace / Roof' },
  { id: 'shop_frontage',            label: 'Shop Frontage' },
  { id: 'additional_damage_evidence', label: 'Additional Damage Evidence' },
];

// Hard caps — final image-derived effects always clamp to these bounds.
export const HARD_CAPS = {
  confidenceDelta:      { min: -0.05, max: 0.06 },
  valuationModifierPct: { min: -0.05, max: 0.03 },
  liquidityModifierPct: { min: -0.03, max: 0.02 },
};

// Labels sent to the optional zero-shot detection model.
export const MODEL_LABELS = [
  'wall crack',
  'large wall crack',
  'damp wall',
  'seepage',
  'water stain',
  'damaged plaster',
  'broken wall',
  'fire damage',
  'unfinished construction',
  'abandoned room',
  'severe visible damage',
  'building exterior',
  'building entrance',
  'room interior',
  'kitchen',
  'bathroom',
];

// Per-signal definitions. Only damage / water / quality signals carry scoring
// effects; identity / coverage labels are positive-context only.
const SIGNAL_DEFINITIONS = {
  // Severe — structural engineer route
  large_crack:           { label: 'Large crack',              category: 'damage',       threshold: 0.12, route: 'structural_engineer_inspection', confidenceDelta: -0.04, valuationModifier: -0.04 },
  broken_wall:           { label: 'Broken wall',              category: 'damage',       threshold: 0.12, route: 'structural_engineer_inspection', confidenceDelta: -0.04, valuationModifier: -0.04 },
  fire_damage:           { label: 'Fire damage',              category: 'damage',       threshold: 0.12, route: 'structural_engineer_inspection', confidenceDelta: -0.05, valuationModifier: -0.05 },
  severe_visible_damage: { label: 'Severe visible damage',    category: 'damage',       threshold: 0.12, route: 'structural_engineer_inspection', confidenceDelta: -0.05, valuationModifier: -0.05 },

  // Moderate — technical valuer route
  possible_crack:          { label: 'Possible crack',           category: 'damage',        threshold: 0.15, route: 'technical_valuer_inspection',  confidenceDelta: -0.02,  valuationModifier: -0.015 },
  dampness:                { label: 'Dampness',                 category: 'water_impact',  threshold: 0.15, route: 'technical_valuer_inspection',  confidenceDelta: -0.02,  valuationModifier: -0.015 },
  seepage:                 { label: 'Seepage',                  category: 'water_impact',  threshold: 0.15, route: 'technical_valuer_inspection',  confidenceDelta: -0.025, valuationModifier: -0.02  },
  water_stain:             { label: 'Water stain',              category: 'water_impact',  threshold: 0.15, route: 'technical_valuer_inspection',  confidenceDelta: -0.02,  valuationModifier: -0.015 },
  damaged_plaster:         { label: 'Damaged plaster',          category: 'water_impact',  threshold: 0.15, route: 'technical_valuer_inspection',  confidenceDelta: -0.02,  valuationModifier: -0.015 },
  unfinished_construction: { label: 'Unfinished construction',  category: 'quality',       threshold: 0.18, route: 'technical_valuer_inspection',  confidenceDelta: -0.02,  valuationModifier: -0.015 },
  abandoned_condition:     { label: 'Abandoned condition',      category: 'quality',       threshold: 0.18, route: 'technical_valuer_inspection',  confidenceDelta: -0.025, valuationModifier: -0.02  },
};

const INSPECTION_PRIORITY = {
  none: 0,
  field_officer_review: 1,
  technical_valuer_inspection: 2,
  structural_engineer_inspection: 3,
};

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

function worseRoute(a, b) {
  return INSPECTION_PRIORITY[a] >= INSPECTION_PRIORITY[b] ? a : b;
}

function mapModelLabelToSignal(label) {
  const text = String(label || '').toLowerCase().trim();
  if (!text) return null;
  if (text.includes('large') && text.includes('crack')) return 'large_crack';
  if (text.includes('broken') && text.includes('wall')) return 'broken_wall';
  if (text.includes('fire')) return 'fire_damage';
  if (text.includes('severe')) return 'severe_visible_damage';
  if (text.includes('crack')) return 'possible_crack';
  if (text.includes('damp')) return 'dampness';
  if (text.includes('seepage')) return 'seepage';
  if (text.includes('stain')) return 'water_stain';
  if (text.includes('damaged') && text.includes('plaster')) return 'damaged_plaster';
  if (text.includes('unfinished')) return 'unfinished_construction';
  if (text.includes('abandoned')) return 'abandoned_condition';
  return null; // identity / coverage labels and unrelated noise are ignored
}

function computeMetadataTrust(metadata = {}) {
  const gps = metadata.gpsMatchStatus || 'unknown';
  const role = metadata.uploadedByRole || 'unknown';
  const verification = metadata.captureVerificationStatus || 'unknown';
  const freshnessDays = Number.isFinite(Number(metadata.freshnessDays))
    ? Number(metadata.freshnessDays)
    : null;

  let score = 0.45;
  if (gps === 'pass') score += 0.25;
  else if (gps === 'fail') score -= 0.30;

  if (role === 'valuer' || role === 'bank_officer') score += 0.15;
  else if (role === 'borrower') score += 0.0;
  else score -= 0.05;

  if (verification === 'verified_capture') score += 0.15;
  else if (verification === 'metadata_verified') score += 0.10;
  else if (verification === 'unverified_upload') score -= 0.05;

  let freshness = 'unknown';
  if (freshnessDays !== null && Number(metadata.embeddedTimestampCount) > 0) {
    if (freshnessDays <= 14) { score += 0.05; freshness = 'fresh'; }
    else if (freshnessDays > 90) { score -= 0.10; freshness = 'stale'; }
    else freshness = 'fresh';
  }

  score = clamp(score, 0, 1);

  let sourceTrustLevel = 'low';
  if (score >= 0.75) sourceTrustLevel = 'high';
  else if (score >= 0.50) sourceTrustLevel = 'medium';

  return {
    gpsMatchStatus: gps,
    sourceTrustLevel,
    freshnessStatus: freshness,
    captureVerificationStatus: verification,
    metadataTrustScore: Number(score.toFixed(2)),
    capturedAt: metadata.capturedAt || null,
    freshnessDays,
    imageCount: Number(metadata.imageCount) || 0,
    verifiedImageCount: Number(metadata.verifiedImageCount) || 0,
    embeddedGpsCount: Number(metadata.embeddedGpsCount) || 0,
    embeddedTimestampCount: Number(metadata.embeddedTimestampCount) || 0,
  };
}

function evaluateImageQuality(packet) {
  const entries = Object.values(packet || {}).filter(Boolean);
  const usableImageCount = entries.length;
  let goodCount = 0;
  let mediumCount = 0;
  let poorCount = 0;
  let totalPixels = 0;
  let resolutionCount = 0;
  for (const entry of entries) {
    const q = String(entry?.metadata?.qualityStatus || 'unknown').toLowerCase();
    if (q === 'good') goodCount++;
    else if (q === 'medium') mediumCount++;
    else if (q === 'poor') poorCount++;
    const width = Number(entry?.metadata?.width);
    const height = Number(entry?.metadata?.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      totalPixels += width * height;
      resolutionCount++;
    }
  }
  let qualityScore = 0.6;
  if (usableImageCount > 0) {
    qualityScore = clamp(
      0.5 + (goodCount * 0.10) + (mediumCount * 0.03) - (poorCount * 0.10),
      0,
      1,
    );
  }
  return {
    overallQualityScore: Number(qualityScore.toFixed(2)),
    usableImageCount,
    averageResolution: resolutionCount > 0 ? `${(totalPixels / resolutionCount / 1000000).toFixed(1)} MP` : 'unknown',
    qualityFlags: poorCount > 0 ? ['poor_quality_image'] : [],
  };
}

export function emptyVisualEvidence() {
  return {
    imagesProvided: false,
    packetStatus: 'not_uploaded',
    processingStatus: 'not_started',
    source: 'none',
    modelUsed: 'none',
    fallbackUsed: false,
    requiredCategories: REQUIRED_CATEGORIES.map((c) => c.id),
    missingCategories: REQUIRED_CATEGORIES.map((c) => c.id),
    metadataTrust: {
      gpsMatchStatus: 'unknown',
      sourceTrustLevel: 'low',
      freshnessStatus: 'unknown',
      captureVerificationStatus: 'unknown',
      metadataTrustScore: 0,
      capturedAt: null,
      freshnessDays: null,
      imageCount: 0,
      verifiedImageCount: 0,
      embeddedGpsCount: 0,
      embeddedTimestampCount: 0,
    },
    quality: {
      overallQualityScore: 0,
      usableImageCount: 0,
      averageResolution: 'unknown',
      qualityFlags: [],
    },
    visualSignals: [],
    deterministicEffects: {
      confidenceDelta: 0,
      valuationModifierPct: 0,
      liquidityModifierPct: 0,
      manualInspectionRequired: false,
      inspectionRoute: 'none',
      evidenceStrength: 'none',
    },
    auditTrail: [],
    userFacingSummary: {
      headline: 'No visual evidence packet uploaded.',
      positives: [],
      concerns: [],
      requiredFollowUp: [],
    },
  };
}

/**
 * Build the visualEvidence object from a packet + metadata + (optional) model results.
 *
 * @param {Object} args
 * @param {Object} args.packet         { categoryId: { imageId, fileName, fileType, fileSize, metadata, ... } }
 * @param {Object} args.metadata       packet-level metadata fallback (uploadedByRole / gpsMatchStatus / captureVerificationStatus / freshnessDays)
 * @param {Array}  args.modelResults   [{ category, imageId, results: [{label, score, ...}] }]
 * @param {string} args.modelStatus    'not_run' | 'running' | 'completed' | 'failed' | 'unavailable'
 * @param {string} args.modelUsed      model identifier string
 * @returns {Object} visualEvidence
 */
export function buildVisualEvidence({
  packet = null,
  metadata = {},
  modelResults = [],
  modelStatus = 'not_run',
  modelUsed = 'none',
} = {}) {
  // IMG_PKT_000 — no images
  const presentKeys = packet ? Object.keys(packet).filter((k) => packet[k]) : [];
  if (presentKeys.length === 0) {
    const ev = emptyVisualEvidence();
    ev.auditTrail.push({
      ruleId: 'IMG_PKT_000',
      ruleName: 'No images uploaded',
      input: 'packet=empty',
      effect: 'image impact = 0',
      explanation: 'Visual evidence packet not uploaded; image impact is zero.',
    });
    return ev;
  }

  const missingCategories = REQUIRED_CATEGORIES
    .filter((c) => !packet[c.id])
    .map((c) => c.id);
  const packetComplete = missingCategories.length === 0;

  // Packet trust is file-derived. A single GPS mismatch wins over matching
  // images so a mixed-location packet cannot receive a confidence boost.
  const metadataTrust = computeMetadataTrust({
    ...metadata,
    ...summarizePacketMetadata(packet),
  });
  const quality = evaluateImageQuality(packet);

  // IMG_PKT_001 — incomplete packet
  if (!packetComplete) {
    const ev = emptyVisualEvidence();
    ev.imagesProvided = true;
    ev.packetStatus = 'incomplete';
    ev.processingStatus = 'partial';
    ev.source = 'standardized_packet';
    ev.missingCategories = missingCategories;
    ev.metadataTrust = metadataTrust;
    ev.quality = quality;
    ev.auditTrail = [{
      ruleId: 'IMG_PKT_001',
      ruleName: 'Visual evidence packet incomplete',
      input: `missing=${missingCategories.join(',')}`,
      effect: 'image impact = 0',
      explanation: 'Visual evidence packet is incomplete; ignored for scoring.',
    }];
    ev.userFacingSummary = {
      headline: 'Visual evidence packet incomplete — image impact set to zero.',
      positives: [],
      concerns: [`${missingCategories.length} required image categor${missingCategories.length === 1 ? 'y' : 'ies'} missing`],
      requiredFollowUp: missingCategories.map((id) =>
        `Upload ${REQUIRED_CATEGORIES.find((c) => c.id === id)?.label || id}`,
      ),
    };
    return ev;
  }

  // Packet is complete from here on
  const auditTrail = [];
  let confidenceDelta = 0;
  let valuationModifierPct = 0;
  let liquidityModifierPct = 0;
  let inspectionRoute = 'none';
  let manualInspectionRequired = false;
  const visualSignals = [];

  if (modelStatus === 'failed' || modelStatus === 'unavailable') {
    // IMG_MODEL_000
    auditTrail.push({
      ruleId: 'IMG_MODEL_000',
      ruleName: 'Visual model unavailable',
      input: `modelStatus=${modelStatus}`,
      effect: 'image impact = 0',
      explanation: 'Visual model unavailable; image-based condition scoring skipped. Core valuation unaffected.',
    });
  } else if (modelStatus === 'completed') {
    for (const result of (modelResults || [])) {
      const category = result?.category || 'unknown';
      const imageId = result?.imageId || category;
      const detections = Array.isArray(result?.results) ? result.results : [];
      for (const det of detections) {
        const signalId = mapModelLabelToSignal(det?.label);
        if (!signalId) continue;
        const def = SIGNAL_DEFINITIONS[signalId];
        if (!def) continue;
        const confidence = Number(det?.score ?? 0);
        const accepted = confidence >= def.threshold;
        visualSignals.push({
          id: signalId,
          label: def.label,
          category: def.category,
          confidence: Number(confidence.toFixed(3)),
          threshold: def.threshold,
          accepted,
          imageCategory: category,
          imageId,
          detector: 'vision_model',
        });
        if (!accepted) {
          auditTrail.push({
            ruleId: 'IMG_MODEL_001',
            ruleName: 'Detection below threshold ignored',
            input: `${def.label} @ ${confidence.toFixed(2)} < ${def.threshold}`,
            effect: 'no scoring effect',
            explanation: `${def.label} detection below threshold; ignored.`,
          });
          continue;
        }
        const isSevere = def.route === 'structural_engineer_inspection';
        const ruleId = isSevere ? 'IMG_DMG_002' : 'IMG_DMG_001';
        confidenceDelta += def.confidenceDelta;
        valuationModifierPct += def.valuationModifier;
        liquidityModifierPct += -0.01;
        manualInspectionRequired = true;
        inspectionRoute = worseRoute(inspectionRoute, def.route);
        auditTrail.push({
          ruleId,
          ruleName: isSevere ? 'Severe damage signal accepted' : 'Concerning damage signal accepted',
          input: `${def.label} @ ${confidence.toFixed(2)} in ${category}`,
          effect: `confidence ${def.confidenceDelta}, valuation ${(def.valuationModifier * 100).toFixed(1)}%, route=${def.route}`,
          explanation: `${def.label} detected above threshold; triggers ${def.route.replace(/_/g, ' ')}.`,
        });
      }
    }

    const acceptedConcerns = visualSignals.filter((s) => s.accepted);
    if (acceptedConcerns.length === 0) {
      if (metadataTrust.gpsMatchStatus === 'fail') {
        auditTrail.push({
          ruleId: 'IMG_META_001',
          ruleName: 'GPS metadata mismatch',
          input: 'gpsMatchStatus=fail',
          effect: 'confidence boost blocked',
          explanation: 'GPS metadata mismatch; visual evidence cannot improve confidence.',
        });
      } else if (metadataTrust.sourceTrustLevel === 'high') {
        confidenceDelta += 0.05;
        liquidityModifierPct += 0.02;
        auditTrail.push({
          ruleId: 'IMG_CONF_002',
          ruleName: 'Complete packet + high trust + clean model',
          input: 'complete packet, high metadata trust, no concerns',
          effect: 'confidenceDelta +0.05, liquidityModifierPct +0.02',
          explanation: 'Complete packet with high metadata trust and a clean vision pass; modest confidence and liquidity boosts applied.',
        });
      } else if (metadataTrust.sourceTrustLevel === 'medium') {
        confidenceDelta += 0.03;
        liquidityModifierPct += 0.01;
        auditTrail.push({
          ruleId: 'IMG_CONF_001',
          ruleName: 'Complete packet + adequate metadata + clean model',
          input: 'complete packet, medium metadata trust, no concerns',
          effect: 'confidenceDelta +0.03, liquidityModifierPct +0.01',
          explanation: 'Complete packet with adequate metadata trust and no damage signals; small confidence and liquidity boosts applied.',
        });
      } else {
        auditTrail.push({
          ruleId: 'IMG_CONF_NONE',
          ruleName: 'Complete packet but weak metadata trust',
          input: 'complete packet, low metadata trust',
          effect: 'no confidence boost',
          explanation: 'Metadata trust is low; visual evidence is accepted but cannot improve confidence.',
        });
      }
    }
  } else {
    // not_run / running — packet complete, scan not invoked yet
    auditTrail.push({
      ruleId: 'IMG_MODEL_PENDING',
      ruleName: 'Vision scan not run',
      input: `modelStatus=${modelStatus}`,
      effect: 'image impact = 0 until model runs',
      explanation: 'Visual evidence packet is complete; run vision scan to evaluate condition signals.',
    });
  }

  // GPS-fail safety: never let visual evidence improve scoring when GPS mismatches.
  if (metadataTrust.gpsMatchStatus === 'fail') {
    if (confidenceDelta > 0) confidenceDelta = 0;
    if (valuationModifierPct > 0) valuationModifierPct = 0;
    if (inspectionRoute === 'none') inspectionRoute = 'field_officer_review';
    manualInspectionRequired = true;
    if (!auditTrail.some((a) => a.ruleId === 'IMG_META_001')) {
      auditTrail.push({
        ruleId: 'IMG_META_001',
        ruleName: 'GPS metadata mismatch',
        input: 'gpsMatchStatus=fail',
        effect: 'positive image impact blocked; field officer review recommended',
        explanation: 'GPS metadata mismatch detected; visual evidence cannot improve confidence and field-officer review is recommended.',
      });
    }
  }

  // IMG_CAP_001 — clamp to hard caps
  const before = { confidenceDelta, valuationModifierPct, liquidityModifierPct };
  confidenceDelta      = clamp(confidenceDelta,      HARD_CAPS.confidenceDelta.min,      HARD_CAPS.confidenceDelta.max);
  valuationModifierPct = clamp(valuationModifierPct, HARD_CAPS.valuationModifierPct.min, HARD_CAPS.valuationModifierPct.max);
  liquidityModifierPct = clamp(liquidityModifierPct, HARD_CAPS.liquidityModifierPct.min, HARD_CAPS.liquidityModifierPct.max);
  if (
    before.confidenceDelta      !== confidenceDelta ||
    before.valuationModifierPct !== valuationModifierPct ||
    before.liquidityModifierPct !== liquidityModifierPct
  ) {
    auditTrail.push({
      ruleId: 'IMG_CAP_001',
      ruleName: 'Image effects clamped to hard caps',
      input: JSON.stringify(before),
      effect: JSON.stringify({ confidenceDelta, valuationModifierPct, liquidityModifierPct }),
      explanation: 'Image-derived effects clamped to product-level safety caps.',
    });
  }

  if (manualInspectionRequired === false && (confidenceDelta < 0 || valuationModifierPct < 0)) {
    manualInspectionRequired = true;
  }

  // Evidence strength
  let evidenceStrength = 'none';
  if (packetComplete && modelStatus === 'completed') {
    const acceptedConcerns = visualSignals.filter((s) => s.accepted);
    if (acceptedConcerns.length > 0) evidenceStrength = 'moderate';
    else if (metadataTrust.sourceTrustLevel === 'high') evidenceStrength = 'strong';
    else if (metadataTrust.sourceTrustLevel === 'medium') evidenceStrength = 'moderate';
    else evidenceStrength = 'weak';
  } else if (packetComplete) {
    evidenceStrength = 'weak';
  }

  let processingStatus = 'completed';
  if (modelStatus === 'failed' || modelStatus === 'unavailable') processingStatus = 'failed';
  else if (modelStatus === 'not_run' || modelStatus === 'running') processingStatus = 'partial';

  const acceptedConcerns = visualSignals.filter((s) => s.accepted);
  const headline = (() => {
    if (modelStatus === 'failed' || modelStatus === 'unavailable')
      return 'Visual model unavailable. Image-based condition scoring skipped. Core valuation unaffected.';
    if (modelStatus === 'not_run' || modelStatus === 'running')
      return 'Packet complete. Run the vision scan to evaluate condition signals.';
    if (acceptedConcerns.length > 0)
      return `${acceptedConcerns.length} visual concern${acceptedConcerns.length > 1 ? 's' : ''} accepted; inspection route triggered.`;
    return 'Visual evidence packet clean; no material concerns detected.';
  })();

  const positives = [];
  const concerns = [];
  const requiredFollowUp = [];
  if (modelStatus === 'completed' && acceptedConcerns.length === 0 && metadataTrust.gpsMatchStatus !== 'fail') {
    positives.push('All required images present with no accepted damage signals.');
  }
  if (metadataTrust.sourceTrustLevel === 'high') {
    positives.push('Metadata trust is high (verified capture + good freshness/role).');
  }
  for (const c of acceptedConcerns) {
    concerns.push(`${c.label} detected in ${c.imageCategory.replace(/_/g, ' ')} (${(c.confidence * 100).toFixed(0)}%).`);
  }
  if (metadataTrust.gpsMatchStatus === 'fail') {
    concerns.push('GPS metadata mismatch — visual evidence cannot improve confidence.');
  }
  if (modelStatus === 'failed' || modelStatus === 'unavailable') {
    concerns.push('Visual model unavailable for this case.');
  }
  if (manualInspectionRequired) {
    requiredFollowUp.push(`Trigger ${inspectionRoute.replace(/_/g, ' ')}.`);
  }

  return {
    imagesProvided: true,
    packetStatus: 'complete',
    processingStatus,
    source: modelStatus === 'completed' ? 'vision_model' : 'standardized_packet',
    modelUsed: modelStatus === 'completed' ? (modelUsed || 'Xenova/owlvit-base-patch32') : 'none',
    fallbackUsed: modelStatus !== 'completed',
    requiredCategories: REQUIRED_CATEGORIES.map((c) => c.id),
    missingCategories: [],
    metadataTrust,
    quality,
    visualSignals,
    deterministicEffects: {
      confidenceDelta:      Number(confidenceDelta.toFixed(3)),
      valuationModifierPct: Number(valuationModifierPct.toFixed(3)),
      liquidityModifierPct: Number(liquidityModifierPct.toFixed(3)),
      manualInspectionRequired,
      inspectionRoute,
      evidenceStrength,
    },
    auditTrail,
    userFacingSummary: {
      headline,
      positives,
      concerns,
      requiredFollowUp,
    },
  };
}
