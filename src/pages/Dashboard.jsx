import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import InputWizard from '../components/InputWizard';
import AgentTerminal from '../components/AgentTerminal';
import LandingHub from '../components/LandingHub';
import CaseHeader from '../components/Dashboard/CaseHeader';
import FinalDecisionStrip from '../components/Dashboard/FinalDecisionStrip';
import OverviewPanel from '../components/Dashboard/OverviewPanel';
import VerificationPanel from '../components/Dashboard/VerificationPanel';
import RiskValuationPanel from '../components/Dashboard/RiskValuationPanel';
import AuditEvidencePanel from '../components/Dashboard/AuditEvidencePanel';
import ReportPanel from '../components/Dashboard/ReportPanel';
import VisualEvidenceSection from '../components/Dashboard/VisualEvidenceSection';
import DeepIntelligencePanel from '../components/Dashboard/DeepIntelligencePanel';
import { emptyVisualEvidence } from '../lib/visualEvidenceEngine';
import { runValuation } from '../lib/valuationEngine';
import { generateUnderwriterSummary, scanPropertyImage } from '../lib/api';

const getStage1Payload = (payload) => payload?.normalizedPropertyProfile ? payload : payload?.stage1 || payload?.stage1Output || null;

const getPayloadAddress = (payload) => {
  const stage1 = getStage1Payload(payload);
  return stage1?.normalizedPropertyProfile?.address || payload?.location || 'Target';
};

const getPayloadCoordinates = (payload) => {
  const stage1 = getStage1Payload(payload);
  const profile = stage1?.normalizedPropertyProfile;
  if (Number.isFinite(profile?.lat) && Number.isFinite(profile?.lon)) return [profile.lat, profile.lon];
  return payload?.coordinates || [19.1136, 72.8697];
};

const payloadHasImages = (payload) => {
  const stage1 = getStage1Payload(payload);
  if (stage1) return (stage1.normalizedPropertyProfile?.imageCount || 0) > 0;
  return Boolean(payload?.enrichment?.images?.exterior);
};

const pickDefined = (source, keys) => keys.reduce((result, key) => {
  if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== '') {
    result[key] = source[key];
  }
  return result;
}, {});

const firstItems = (items, limit) => Array.isArray(items) ? items.slice(0, limit) : [];

const compactStage1ForSummary = (stage1 = {}) => {
  const profile = stage1.normalizedPropertyProfile || stage1.profile || {};
  const bucketAssignment = stage1.bucketAssignment || {};
  const coarseBucket = bucketAssignment.coarseBucket || stage1.coarseBucket || {};
  const microMarketBucket = bucketAssignment.microMarketBucket || stage1.microMarketBucket || {};
  const hyperlocalContext = stage1.hyperlocalContext || {};

  return {
    normalizedPropertyProfile: pickDefined(profile, [
      'address',
      'propertyType',
      'subtype',
      'sizeSqft',
      'ageBucket',
      'legalStatus',
      'titleClarity',
      'rentalStatus',
      'occupancyStatus',
      'imageCount',
    ]),
    bucketAssignment: {
      coarseBucket: pickDefined(coarseBucket, ['id', 'label']),
      microMarketBucket: pickDefined(microMarketBucket, [
        'id',
        'label',
        'commonSizeBand',
        'liquidityNorm',
        'localPriceBand',
      ]),
    },
    hyperlocalContext: pickDefined(hyperlocalContext, ['accessQuality']),
  };
};

const compactStage2ForSummary = (stage2 = {}) => ({
  decision: stage2.decision,
  scores: stage2.scores || pickDefined(stage2, ['dataSufficiencyScore', 'anomalyScore', 'suspicionScore']),
  flags: firstItems(stage2.flags, 4),
  localReferenceContext: stage2.localReferenceContext,
  evaluationRows: firstItems(stage2.evaluationRows || stage2.evaluationTable, 4),
});

const compactHistoricalForSummary = (historical = {}) => ({
  source: historical.source,
  overallSignal: historical.overallSignal,
  confidenceAdjustment: historical.confidenceAdjustment,
  displayedCount: historical.displayedCount || historical.similarCases?.length || historical.cases?.length,
  similarCases: firstItems(historical.similarCases || historical.cases, 2).map((item) => pickDefined(item, [
    'caseId',
    'similarityScore',
    'recencyWeight',
    'confidenceContribution',
    'outcomeSummary',
  ])),
});

const compactPortfolioForSummary = (portfolio = {}) => {
  const portfolioSummary = portfolio.portfolioSummary || {};
  return {
    source: portfolio.source,
    portfolioSummary: pickDefined(portfolioSummary, [
      'riskLevel',
      'portfolioRiskScore',
      'recommendedLtv',
      'reviewRecommendation',
    ]),
    riskFlags: firstItems(portfolio.riskFlags, 4),
  };
};

const compactLocalityIntelligenceForSummary = (li = {}) => {
  const events = Array.isArray(li.events) ? li.events.filter((e) => e?.accepted) : [];
  return {
    status: li.status,
    eventsFound: li.eventsFound,
    acceptedEvents: li.acceptedEvents,
    growthSignals: li.growthSignals,
    riskSignals: li.riskSignals,
    neutralSignals: li.neutralSignals,
    propertyImpactEvents: li.propertyImpactEvents,
    sourceTierCounts: li.sourceTierCounts,
    corroborationCounts: li.corroborationCounts,
    watchlistCount: (li.watchlistSignals || []).length,
    liquidityDelta: li.liquidityDelta,
    marketabilityDelta: li.marketabilityDelta,
    confidenceDelta: li.confidenceDelta,
    timeToLiquidateDeltaPct: li.timeToLiquidateDeltaPct,
    manualReviewRequired: !!li.manualReviewRequired,
    inspectionRoute: li.inspectionRoute,
    riskFlags: li.riskFlags || [],
    topAcceptedEvents: events.slice(0, 4).map((e) => ({
      eventType: e.eventType,
      direction: e.direction,
      sourceName: e.sourceName,
      sourceTier: e.sourceTier,
      corroborationStatus: e.corroborationStatus,
      severity: e.severity,
      confidence: e.confidence,
      localityRelevance: e.localityRelevance,
      valuationRelevanceScore: e.valuationRelevanceScore,
      valuationImpactEligible: !!e.valuationImpactEligible,
      impactReason: e.impactReason,
      isWatchlist: !!e.isWatchlist,
      summary: (e.summary || e.title || '').slice(0, 180),
    })),
  };
};

const compactVisualEvidenceForSummary = (visualEvidence = {}) => {
  const effects = visualEvidence.deterministicEffects || {};
  return {
    packetStatus: visualEvidence.packetStatus,
    processingStatus: visualEvidence.processingStatus,
    source: visualEvidence.source,
    modelUsed: visualEvidence.modelUsed,
    missingCategories: visualEvidence.missingCategories || [],
    metadataTrust: visualEvidence.metadataTrust?.sourceTrustLevel,
    gpsMatchStatus: visualEvidence.metadataTrust?.gpsMatchStatus,
    confidenceDelta: effects.confidenceDelta,
    valuationModifierPct: effects.valuationModifierPct,
    manualInspectionRequired: !!effects.manualInspectionRequired,
    inspectionRoute: effects.inspectionRoute,
    evidenceStrength: effects.evidenceStrength,
    acceptedConcerns: (visualEvidence.visualSignals || [])
      .filter((s) => s.accepted)
      .slice(0, 4)
      .map((s) => `${s.label} in ${String(s.imageCategory || '').replace(/_/g, ' ')}`),
  };
};

const buildUnderwriterSummaryPayload = (data) => {
  const stage1 = data?.stage1 || data?.stage1Output || {};
  const stage2Output = data?.stage2Output || {};
  return {
    caseId: data?.caseId || data?.property_id || stage1?.stage1Metadata?.generatedAt || 'CURRENT_CASE',
    stage1: compactStage1ForSummary(stage1),
    stage2Output: compactStage2ForSummary(stage2Output),
    valuation: {
      marketValue: data?.marketValue,
      distressValue: data?.distressValue,
      timeToLiquidateDays: data?.timeToSell,
      confidenceScore: data?.confidence,
      liquidityScore: data?.PropIntel,
    },
    historicalCaseSummary: compactHistoricalForSummary(data?.historicalCaseSummary || {}),
    portfolioRiskSummary: compactPortfolioForSummary(data?.portfolioRiskSummary || {}),
    visualEvidence: compactVisualEvidenceForSummary(data?.visualEvidence || {}),
    localityIntelligence: compactLocalityIntelligenceForSummary(data?.localityIntelligence || {}),
    numericDecisionBoundary: 'All numeric scores, value estimates, LTV adjustments, and risk flags are computed by deterministic engines. The AI summary only explains those outputs and recommends evidence.',
  };
};

const getUnderwriterSummaryRequestKey = (data) => {
  if (!data) return null;
  return [
    data?.caseId || data?.property_id || data?.stage1?.stage1Metadata?.generatedAt || 'CURRENT_CASE',
    data?.stage1?.normalizedPropertyProfile?.address || data?.address || '',
    data?.stage1?.normalizedPropertyProfile?.sizeSqft || data?.size || data?.area || '',
    data?.stage2Output?.decision || data?.verificationDecision?.decision || '',
    data?.marketValue || ''
  ].join('|');
};

const normalizeUnderwriterSummaryResponse = (response, defaultMode = 'auto') => {
  const source = response?.source || 'unavailable';
  const mode = response?.mode || defaultMode;
  const summaryQuality = response?.summaryQuality || (
    source === 'rule_based_fallback'
      ? 'fallback'
      : mode === 'enhanced'
        ? 'enhanced'
        : mode === 'fast'
          ? 'fast'
          : 'unavailable'
  );

  return {
    source,
    modelUsed: response?.modelUsed ?? null,
    fallbackUsed: Boolean(response?.fallbackUsed),
    mode,
    summaryQuality,
    upgradeAvailable: Boolean(response?.upgradeAvailable),
    error: response?.error || null,
    summary: response?.summary || null,
    llmDebug: response?.llmDebug || null
  };
};

const isEnhancedUpgrade = (response) => (
  response?.source === 'ollama' &&
  response?.summaryQuality === 'enhanced' &&
  Boolean(response?.summary)
);

const buildAuditExportPayload = (data, underwriterSummary) => {
  const stage1 = data?.stage1 || {};
  const portfolioSummary = data?.portfolioRiskSummary?.portfolioSummary || {};
  const stage2 = data?.stage2Output || {};

  return {
    generatedAt: new Date().toISOString(),
    reportType: 'PropIntel collateral audit pack',
    case: {
      address: data?.caseDetails?.address || stage1?.normalizedPropertyProfile?.address,
      asset: data?.caseDetails,
      marketValue: data?.marketValue,
      distressValue: data?.distressValue,
      liquidityScore: data?.PropIntel,
      confidence: data?.confidence,
      recommendedLtv: portfolioSummary.recommendedLtv ?? data?.ltv,
      verificationDecision: data?.verificationDecision || stage2?.decision,
    },
    sources: {
      stage1: stage1?.stage1Metadata,
      stage2: {
        normSource: stage2?.normSource,
        normSourceLabel: stage2?.normSourceLabel,
        decision: stage2?.decision,
      },
      historical: {
        source: data?.historicalCaseSummary?.source,
        candidateCount: data?.historicalCaseSummary?.candidateCount,
        displayedCount: data?.historicalCaseSummary?.displayedCount,
        overallSignal: data?.historicalCaseSummary?.overallSignal,
      },
      portfolio: {
        source: data?.portfolioRiskSummary?.source,
        riskLevel: portfolioSummary.riskLevel,
        score: portfolioSummary.portfolioRiskScore,
      },
      ai: {
        source: underwriterSummary?.source,
        modelUsed: underwriterSummary?.modelUsed,
        summaryQuality: underwriterSummary?.summaryQuality,
        fallbackUsed: underwriterSummary?.fallbackUsed,
      },
      vision: {
        source: data?.visualEvidence?.source || data?.visualAudit?.source,
        imageCount: data?.visualEvidence?.quality?.usableImageCount || data?.rawImages?.length || 0,
        packetStatus: data?.visualEvidence?.packetStatus,
        metadataTrust: data?.visualEvidence?.metadataTrust,
        deterministicEffects: data?.visualEvidence?.deterministicEffects,
      },
    },
    deterministicBoundary: 'Numeric scores, value estimates, LTV adjustments, and risk flags are deterministic. AI only explains computed outputs and recommends evidence.',
    reviewFlags: [
      ...(stage2?.flags || []).filter((flag) => !flag?.protective),
      ...(data?.portfolioRiskSummary?.riskFlags || []).map((flag) => ({ source: 'portfolio', text: flag })),
    ],
    recommendedEvidence: underwriterSummary?.summary?.recommendedEvidence || [],
    aiSummary: underwriterSummary?.summary || null,
  };
};

const downloadJsonFile = (filename, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function Dashboard() {
  
  const [showWizard, setShowWizard] = useState(false);
  const [currentData, setCurrentData] = useState(null); 
  const [pendingPayload, setPendingPayload] = useState(null);
  
  const [fieldDataIncluded, setFieldDataIncluded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [underwriterSummary, setUnderwriterSummary] = useState(null);
  const [isUnderwriterSummaryLoading, setIsUnderwriterSummaryLoading] = useState(false);
  const [underwriterSummaryEnhancement, setUnderwriterSummaryEnhancement] = useState({ status: 'idle', message: '' });
  const underwriterSummaryRequestRef = useRef({
    key: null,
    fastPromise: null,
    enhancedPromise: null,
    enhancementTimerId: null,
    enhancedRequestStarted: false,
    enhancedSummaryCommitted: false,
    visibleSummarySource: null
  });
  const underwriterSummaryRequestKeyRef = useRef(null);
  const underwriterSummarySequenceRef = useRef(0);

  // Modal & Notification States
  const [toast, setToast] = useState(null); 
  const [selectedImage, setSelectedImage] = useState(null); 

  // Map Filter States
  const [showCircleRate, setShowCircleRate] = useState(false);
  const [showMetro, setShowMetro] = useState(true);
  const [showFlood, setShowFlood] = useState(false);
  const [showImpactFactors, setShowImpactFactors] = useState(true);
  
  // Dashboard Tabs State
  const [activeTab, setActiveTab] = useState('overview');

  // Optional Visual Collateral Evidence — state is lifted here so the pre-
  // evaluation step (overlay between wizard and AgentTerminal) and the
  // post-evaluation dashboard tab share one source of truth.
  const [packet, setPacket] = useState({});
  const [packetMetadata, setPacketMetadata] = useState({
    uploadedByRole: 'unknown',
    gpsMatchStatus: 'unknown',
    captureVerificationStatus: 'unknown',
    freshnessDays: '',
  });
  const [scanStatus, setScanStatus] = useState('not_run');
  const [modelResults, setModelResults] = useState([]);
  const [modelUsed, setModelUsed] = useState('none');
  const [visualEvidence, setVisualEvidence] = useState(() => emptyVisualEvidence());
  const [showEvidenceStep, setShowEvidenceStep] = useState(false);
  const [isProcessingEvidence, setIsProcessingEvidence] = useState(false);
  const [isEvidenceSectionBusy, setIsEvidenceSectionBusy] = useState(false);
  const visualEvidenceProcessorRef = useRef(null);

  // True CUDA Vision Backend State
  const [detectedBoxes, setDetectedBoxes] = useState({});
  const [visionStatus, setVisionStatus] = useState('idle');

  useEffect(() => {
     if (selectedImage) {
        const targetUrl = selectedImage === 'exterior' ? getImageUrl(0, defaultExterior) : 
                          selectedImage === 'living' ? getImageUrl(1, defaultLiving) : 
                          selectedImage === 'kitchen' ? getImageUrl(2, defaultKitchen) : null;
                          
        if (targetUrl && !detectedBoxes[targetUrl]) {
           const runCudaInference = async () => {
              setVisionStatus('scanning');
              try {
                 const apiData = await scanPropertyImage(targetUrl);
                 setDetectedBoxes(prev => ({ ...prev, [targetUrl]: apiData.results || [] }));
                 setVisionStatus('idle');
              } catch (err) {
                 console.error("Vision backend offline or failed:", err);
                 setVisionStatus('idle');
              }
           };
           runCudaInference();
        }
     }
  }, [selectedImage]);

  useEffect(() => {
    if (!selectedImage) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') setSelectedImage(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [selectedImage]);

  useEffect(() => {
    if (!currentData) {
      if (underwriterSummaryRequestRef.current.enhancementTimerId) {
        window.clearTimeout(underwriterSummaryRequestRef.current.enhancementTimerId);
      }
      underwriterSummaryRequestKeyRef.current = null;
      setUnderwriterSummary(null);
      setIsUnderwriterSummaryLoading(false);
      setUnderwriterSummaryEnhancement({ status: 'idle', message: '' });
      underwriterSummaryRequestRef.current = {
        key: null,
        fastPromise: null,
        enhancedPromise: null,
        enhancementTimerId: null,
        enhancedRequestStarted: false,
        enhancedSummaryCommitted: false,
        visibleSummarySource: null
      };
      return;
    }

    const requestKey = getUnderwriterSummaryRequestKey(currentData);
    if (underwriterSummaryRequestKeyRef.current === requestKey) {
      return;
    }
    underwriterSummaryRequestKeyRef.current = requestKey;
    const summaryPayload = buildUnderwriterSummaryPayload(augmentedData || currentData);
    const requestSequence = underwriterSummarySequenceRef.current + 1;
    underwriterSummarySequenceRef.current = requestSequence;

    const clearEnhancementTimer = () => {
      if (!underwriterSummaryRequestRef.current.enhancementTimerId) return;
      window.clearTimeout(underwriterSummaryRequestRef.current.enhancementTimerId);
      underwriterSummaryRequestRef.current = {
        ...underwriterSummaryRequestRef.current,
        enhancementTimerId: null
      };
    };

    const startEnhancedSummary = () => {
      if (underwriterSummarySequenceRef.current !== requestSequence) return;

      const requestState = underwriterSummaryRequestRef.current;
      if (requestState.key !== requestKey || requestState.enhancedRequestStarted) return;

      clearEnhancementTimer();

      let enhancedPromise = requestState.enhancedPromise;
      if (!enhancedPromise) {
        enhancedPromise = generateUnderwriterSummary(summaryPayload, { mode: 'enhanced' });
      }

      underwriterSummaryRequestRef.current = {
        ...requestState,
        enhancedPromise,
        enhancementTimerId: null,
        enhancedRequestStarted: true
      };
      setUnderwriterSummaryEnhancement({
        status: 'enhancing',
        message: 'Enhancing summary with qwen2.5:7b...'
      });

      enhancedPromise
        .then((enhancedResult) => {
          if (underwriterSummarySequenceRef.current !== requestSequence) return;

          const normalizedEnhanced = normalizeUnderwriterSummaryResponse(enhancedResult, 'enhanced');
          if (isEnhancedUpgrade(normalizedEnhanced)) {
            underwriterSummaryRequestRef.current = {
              ...underwriterSummaryRequestRef.current,
              enhancedSummaryCommitted: true,
              visibleSummarySource: 'ollama'
            };
            setUnderwriterSummary(normalizedEnhanced);
            setUnderwriterSummaryEnhancement({
              status: 'upgraded',
              message: 'Enhanced summary replaced the fast summary.'
            });
            return;
          }

          const currentSummarySource = underwriterSummaryRequestRef.current.visibleSummarySource || 'unavailable';

          if (currentSummarySource === 'ollama') {
            setUnderwriterSummaryEnhancement({
              status: 'unavailable',
              message: 'Enhanced model unavailable; fast summary retained.'
            });
          } else if (currentSummarySource === 'rule_based_fallback') {
            setUnderwriterSummaryEnhancement({
              status: 'unavailable',
              message: 'Enhanced model unavailable; rule-based fallback retained.'
            });
          } else {
            setUnderwriterSummaryEnhancement({
              status: 'unavailable',
              message: 'Enhanced model unavailable while the fast summary is still loading.'
            });
          }
        })
        .catch((error) => {
          if (underwriterSummarySequenceRef.current !== requestSequence) return;
          console.warn('Enhanced AI summary unavailable; retaining current summary.', error);
          const currentSummarySource = underwriterSummaryRequestRef.current.visibleSummarySource || 'unavailable';
          if (currentSummarySource === 'ollama') {
            setUnderwriterSummaryEnhancement({
              status: 'unavailable',
              message: 'Enhanced model unavailable; fast summary retained.'
            });
          } else if (currentSummarySource === 'rule_based_fallback') {
            setUnderwriterSummaryEnhancement({
              status: 'unavailable',
              message: 'Enhanced model unavailable; rule-based fallback retained.'
            });
          } else {
            setUnderwriterSummaryEnhancement({
              status: 'unavailable',
              message: 'Enhanced model unavailable while the fast summary is still loading.'
            });
          }
        })
        .finally(() => {
          if (underwriterSummarySequenceRef.current === requestSequence) {
            underwriterSummaryRequestRef.current = {
              ...underwriterSummaryRequestRef.current,
              enhancedPromise: null,
              enhancementTimerId: null,
            };
          }
        });
    };

    let fastPromise = (
      underwriterSummaryRequestRef.current.key === requestKey
      ? underwriterSummaryRequestRef.current.fastPromise
      : null
    );

    if (!fastPromise) {
      fastPromise = generateUnderwriterSummary(summaryPayload, { mode: 'fast' });
    }

    underwriterSummaryRequestRef.current = {
      key: requestKey,
      fastPromise,
      enhancedPromise: null,
      enhancementTimerId: null,
      enhancedRequestStarted: false,
      enhancedSummaryCommitted: false,
      visibleSummarySource: null
    };
    setUnderwriterSummary(null);
    setIsUnderwriterSummaryLoading(true);
    setUnderwriterSummaryEnhancement({ status: 'idle', message: '' });

    fastPromise
      .then((result) => {
        if (underwriterSummarySequenceRef.current !== requestSequence) return;

        const fastResponse = normalizeUnderwriterSummaryResponse(result, 'fast');
        if (!underwriterSummaryRequestRef.current.enhancedSummaryCommitted) {
          underwriterSummaryRequestRef.current = {
            ...underwriterSummaryRequestRef.current,
            visibleSummarySource: fastResponse.source
          };
          setUnderwriterSummary(fastResponse);
        }
        setIsUnderwriterSummaryLoading(false);

        if (fastResponse.source === 'rule_based_fallback') {
          // Toast removed per user request
        } else if (fastResponse.summary) {
          // Toast removed per user request
        }

        if (!fastResponse.upgradeAvailable) {
          clearEnhancementTimer();
          underwriterSummaryRequestRef.current = {
            ...underwriterSummaryRequestRef.current,
            fastPromise: null,
            enhancedPromise: null
          };
          return;
        }

        startEnhancedSummary();
      })
      .catch((error) => {
        if (underwriterSummarySequenceRef.current !== requestSequence) return;
        setUnderwriterSummary(
          normalizeUnderwriterSummaryResponse({
            source: 'unavailable',
            modelUsed: null,
            fallbackUsed: false,
            mode: 'fast',
            summaryQuality: 'unavailable',
            upgradeAvailable: false,
            error: error?.message || 'AI underwriter summary unavailable',
            summary: null
          }, 'fast')
        );
        clearEnhancementTimer();
        underwriterSummaryRequestRef.current = {
          ...underwriterSummaryRequestRef.current,
          fastPromise: null,
          enhancedPromise: null,
          enhancementTimerId: null
        };
        setUnderwriterSummaryEnhancement({ status: 'idle', message: '' });
        setIsUnderwriterSummaryLoading(false);
      })
      .finally(() => {
        if (underwriterSummarySequenceRef.current === requestSequence) {
          underwriterSummaryRequestRef.current = {
            ...underwriterSummaryRequestRef.current,
            fastPromise: null
          };
          setIsUnderwriterSummaryLoading(false);
        }
      });

    return () => {
      clearEnhancementTimer();
    };
  }, [currentData]);

  const resetUnderwriterSummary = () => {
    underwriterSummarySequenceRef.current += 1;
    if (underwriterSummaryRequestRef.current.enhancementTimerId) {
      window.clearTimeout(underwriterSummaryRequestRef.current.enhancementTimerId);
    }
    underwriterSummaryRequestRef.current = {
      key: null,
      fastPromise: null,
      enhancedPromise: null,
      enhancementTimerId: null,
      enhancedRequestStarted: false,
      enhancedSummaryCommitted: false,
      visibleSummarySource: null
    };
    underwriterSummaryRequestKeyRef.current = null;
    setUnderwriterSummary(null);
    setIsUnderwriterSummaryLoading(false);
    setUnderwriterSummaryEnhancement({ status: 'idle', message: '' });
  };

  const resetVisualEvidenceState = () => {
    Object.values(packet).forEach((entry) => {
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    });
    setPacket({});
    setPacketMetadata({
      uploadedByRole: 'unknown',
      gpsMatchStatus: 'unknown',
      captureVerificationStatus: 'unknown',
      freshnessDays: '',
    });
    setScanStatus('not_run');
    setModelResults([]);
    setModelUsed('none');
    setVisualEvidence(emptyVisualEvidence());
    visualEvidenceProcessorRef.current = null;
    setIsProcessingEvidence(false);
    setIsEvidenceSectionBusy(false);
  };

  const handleWizardSubmit = (payload) => {
    setShowWizard(false);
    setPendingPayload(payload);
    setActiveTab('overview');
    resetUnderwriterSummary();
    resetVisualEvidenceState();
    // Pause before evaluation: collect optional visual evidence first.
    setShowEvidenceStep(true);
  };

  const registerVisualEvidenceProcessor = useCallback((processor) => {
    visualEvidenceProcessorRef.current = processor;
  }, []);

  const handleEvidenceContinue = async () => {
    if (isProcessingEvidence || isEvidenceSectionBusy) return;
    setIsProcessingEvidence(true);
    try {
      const nextEvidence = await visualEvidenceProcessorRef.current?.();
      if (nextEvidence) setVisualEvidence(nextEvidence);
    } finally {
      setIsProcessingEvidence(false);
      setShowEvidenceStep(false);
      setIsLoading(true); // Triggers AgentTerminal + finalizeValuation
    }
  };

  // Augment dashboard data with bounded visual-evidence + locality cross-rule effects.
  // confidence is clamped; market value is NOT altered (visualModifier shows separately).
  const augmentedData = useMemo(() => {
    if (!currentData) return null;
    const visualDelta = visualEvidence?.deterministicEffects?.confidenceDelta || 0;
    const visualLiquidityDelta = visualEvidence?.deterministicEffects?.liquidityModifierPct || 0;

    // Cross-rule — media waterlogging + visual seepage/dampness → technical inspection.
    const li = currentData.localityIntelligence;
    const acceptedEvents = li?.events?.filter((e) => e?.accepted) || [];
    const hasMediaWaterRisk = acceptedEvents.some(
      (e) => ['waterlogging_risk', 'flood_warning', 'weather_water_risk', 'heavy_rain_alert'].includes(e.eventType)
    );
    const hasVisualWaterDamage = (visualEvidence?.visualSignals || []).some(
      (s) => s.accepted && ['seepage', 'dampness', 'water_stain', 'damaged_plaster'].includes(s.id)
    );
    const crossRuleFired = hasMediaWaterRisk && hasVisualWaterDamage;
    const crossRuleConfidencePenalty = crossRuleFired ? -0.02 : 0;

    const effectiveConfidence = Math.max(
      0.25,
      Math.min(0.95, (Number(currentData.confidence) || 0) + visualDelta + crossRuleConfidencePenalty)
    );
    const effectivePropIntel = Math.max(
      0,
      Math.min(100, Math.round((Number(currentData.PropIntel) || 0) * (1 + visualLiquidityDelta)))
    );

    const crossRuleAudit = crossRuleFired ? {
      ruleId: 'NEWS_VISUAL_CROSS_WATER_001',
      source: 'cross_rule_engine',
      input: 'media waterlogging/flood/heavy_rain + visual seepage/dampness/water_stain',
      effect: 'confidence -0.02 (clamped), technical_valuer_inspection',
      explanation: 'Locality-news water risk corroborated by accepted visual seepage/dampness signal. Triggered technical valuer inspection and a small bounded confidence penalty.',
    } : null;

    return {
      ...currentData,
      visualEvidence,
      confidence: effectiveConfidence,
      PropIntel: effectivePropIntel,
      PropIntelBreakdown: {
        base: Number(currentData.PropIntel) || 0,
        visualEvidenceModifierPct: visualLiquidityDelta,
      },
      confidenceBreakdown: {
        ...(currentData.confidenceBreakdown || {}),
        visualEvidenceDelta: visualDelta,
        crossRuleDelta: crossRuleConfidencePenalty,
      },
      crossRule: crossRuleFired ? {
        ruleId: 'NEWS_VISUAL_CROSS_WATER_001',
        inspectionRoute: 'technical_valuer_inspection',
        confidencePenalty: crossRuleConfidencePenalty,
        audit: crossRuleAudit,
      } : null,
    };
  }, [currentData, visualEvidence]);
  const finalizeValuation = async () => {
    try {
      const targetCenter = getPayloadCoordinates(pendingPayload); 
      
      const results = await runValuation(pendingPayload);
      results.coordinates = targetCenter;
      const visionDetections = {};
      (results.visualAudit?.detectionsByImage || []).forEach((item) => {
        const imageUrl = results.rawImages?.[item.index];
        if (imageUrl) visionDetections[imageUrl] = item.results || [];
      });
      
      setDetectedBoxes(visionDetections);
      setCurrentData(results);
      setActiveTab('overview');
      setFieldDataIncluded(payloadHasImages(pendingPayload) || Object.keys(packet).length > 0);
    } catch (error) {
      console.error("Valuation Engine Error:", error);
      showToast("Valuation Engine crashed. Check console.", "error");
    } finally {
      setIsLoading(false);
      setPendingPayload(null);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleExportAuditPack = () => {
    if (!currentData) {
      showToast('Generate a case before exporting an audit pack.', 'info');
      return;
    }

    const payload = buildAuditExportPayload(augmentedData || currentData, underwriterSummary);
    const slug = String(currentData.caseDetails?.address || 'PropIntel-case')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 48) || 'PropIntel-case';
    downloadJsonFile(`${slug}-audit-pack.json`, payload);
    showToast('Audit pack exported as JSON.', 'success');
  };


  const defaultExterior = "https://lh3.googleusercontent.com/aida-public/AB6AXuA1SApb750yQYbJtFHGRemWz--sEHdPwXTJr5nCpIK_cj6gKGKzRn7EHOVIynJu4gnSDq3IfgclBa-N1AYzotN_OSVnwAMma4ujpHUh6PDPe4gjWQb1MEx6gqZO4FW9Cc4WbRilA3v-rJq5JTdcCROu0y0vwZ9T6VLnU2AdSpJgX6OYZvhkgiGbtEJk51NG3_cjrWA3MU8R7JuotoyBjEjvq3_eLylkq3rv5ADbknUoRfFLNcsDjsC8P5DIRtZ9vF9z7kS7WAEPJTPv";
  const defaultLiving = "https://lh3.googleusercontent.com/aida-public/AB6AXuAjHoqaV86y19B2s3MLps2eYeM0bz5984kIaOpdLw4IvBDkDC8Ucna9rdaBgoijAwlZ5kTqU9WvU7ecUmTQixJG5IX2Ncnw2hgvZEcPBoaGf5HFE9G-_1eZ9ECF1U-5fRH_ko2gUVuoM5rwvH-GAfGTFJK--P42SyYdTSpkPZvoHuPiORe_F3HWI7JR5sWskKEZvjvPQugYLrLTFVp5ZcIUS5O7e8D5iykxzpKmWx54odKLNg2B7C3ih1NSaXzDKzI-EDBmlCcVqAU6";
  const defaultKitchen = "https://lh3.googleusercontent.com/aida-public/AB6AXuB8XGn5YwGAABpNvnbJvaA57CyQyc_Z3mlGZynB3mg1irAN1ZxTTr0ilTosQrAUIC_ELEFiXWlNwPMVxuIDSn_TQgzqWAAOxAlI_wYvLChOAVaHRutWGrkZ6UIo121roaZYD_xCgkx0mJgqXzgOOFsi0CqotflFpbDaBPHOo-Q2_mW3T53mUsn7-OJZcIQ_KZNF6UMwD4qIVzCVCIHbDMf31b3eBxx9G7xGTz9IaBCcd91Z1OW5DoUU2gkJimJHgMZv-ABprPcaEnsI";

  const getImageUrl = (index, fallback) => {
    return (currentData?.rawImages && currentData.rawImages[index]) ? currentData.rawImages[index] : fallback;
  };

  const selectedImageObj = selectedImage === 'exterior' ? getImageUrl(0, defaultExterior) : 
                           selectedImage === 'living' ? getImageUrl(1, defaultLiving) : 
                           selectedImage === 'kitchen' ? getImageUrl(2, defaultKitchen) : null;

  return (
    <div className="flex h-screen overflow-hidden relative">
      {/* Toast Notification Portal */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[999] px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 transition-all duration-300 ${
          toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-slate-700'
        } text-white`}>
          <span className="material-symbols-outlined text-xl">
            {toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info'}
          </span>
          <span className="text-sm font-semibold tracking-wide">{toast.message}</span>
        </div>
      )}

      {/* Modals & Overlays */}
      {showWizard && <InputWizard onSubmit={handleWizardSubmit} onCancel={() => setShowWizard(false)} />}

      {/* Image Annotation Modal */}
      {selectedImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged property image"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md p-6 animate-in fade-in"
        >
          <button
            type="button"
            onClick={() => setSelectedImage(null)}
            aria-label="Close image"
            className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors duration-150 bg-white/10 p-2 rounded-full"
          >
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
          
          <div className="max-w-4xl w-full h-[80vh] relative flex flex-col justify-center items-center">
            <div className="relative inline-block border-4 border-slate-800 rounded-xl overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.5)]">
               <img src={selectedImageObj} alt="Enlarged visualization" className="max-h-[75vh] w-auto max-w-full object-contain" />
              {/* Active ML Bounding Boxes mapping */}
              {selectedImageObj && detectedBoxes[selectedImageObj] && detectedBoxes[selectedImageObj].map((box, idx) => {
                 return (
                  <div key={idx} style={{ 
                      top: `${box.top_pct}%`, left: `${box.left_pct}%`, width: `${box.width_pct}%`, height: `${box.height_pct}%` 
                  }} className="absolute border-2 shadow-sm pointer-events-none rounded transition-all flex justify-center border-red-500 bg-red-500/10">
                    <span className="absolute -top-7 whitespace-nowrap px-2 py-0.5 text-xs font-bold text-white rounded shadow-sm bg-red-500">
                      {box.label} ({Math.round(box.score * 100)}%)
                    </span>
                  </div>
                 );
              })}
              
              {visionStatus === 'scanning' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-md text-white font-mono flex-col gap-3 rounded-xl z-50">
                      <div className="w-10 h-10 rounded-full border-4 border-amber-500 border-t-transparent animate-spin"></div>
                      <p className="font-bold text-amber-500 tracking-widest text-sm">RUNNING VISION SCAN...</p>
                  </div>
              )}
              
            </div>
            <p className="text-emerald-400 mt-4 font-mono text-sm">
                {visionStatus === 'scanning' ? "Vision Agent processing matrix... Do not close." : 
                 (detectedBoxes[selectedImageObj] ? `Analysis Complete: Detected ${detectedBoxes[selectedImageObj].length} Risk Element(s)` : "Vision Agent Diagnostics Connected")}
            </p>
          </div>
        </div>
      )}

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* TopNavBar — clean header without technical pills */}
        <header className="z-50 flex w-full items-center justify-between border-b border-slate-100 bg-white px-5 py-1 md:px-8">
          <div className="flex items-center gap-5">
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-950">PropIntel</h1>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Collateral intelligence</p>
            </div>
            <span className="hidden items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-700 md:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              Engines active
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              New Case
            </button>
            <button
              onClick={handleExportAuditPack}
              disabled={!currentData}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Audit Pack
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className={`flex-1 overflow-y-auto transition-opacity duration-300 relative ${(!currentData && !isLoading) ? '' : 'px-3 pb-4 md:px-4 md:pb-4'}`}>

          {/* Step 2: Visual Evidence (between wizard and AgentTerminal) */}
          {showEvidenceStep && pendingPayload && (
            <div className="fixed inset-0 z-50 flex flex-col bg-[#eef2f6]">
              <header className="border-b border-slate-200 bg-white px-6 py-4 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-semibold uppercase tracking-wider text-indigo-600">Step 2 of 2 · Optional</p>
                    <h2 className="text-lg font-bold text-slate-900">Visual Collateral Evidence</h2>
                    <p className="text-sm text-slate-500 max-w-3xl">
                      Add field images by category. PropIntel reads timestamp, GPS, and quality metadata from each file, then analyzes the completed packet automatically when you proceed.
                      You can continue without evidence or revise it later from Verification.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleEvidenceContinue}
                    disabled={isProcessingEvidence || isEvidenceSectionBusy}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors duration-150 hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70"
                  >
                    {isProcessingEvidence ? 'Processing evidence...' : isEvidenceSectionBusy ? 'Reading image metadata...' : 'Proceed to evaluation'}
                    <span aria-hidden="true" className={`material-symbols-outlined text-[18px] ${isProcessingEvidence || isEvidenceSectionBusy ? 'animate-spin' : ''}`}>
                      {isProcessingEvidence || isEvidenceSectionBusy ? 'progress_activity' : 'arrow_forward'}
                    </span>
                  </button>
                </div>
              </header>
              <div className="flex-1 overflow-y-auto p-5 md:p-8">
                <div className="max-w-7xl mx-auto">
                  <VisualEvidenceSection
                    packet={packet}
                    setPacket={setPacket}
                    packetMetadata={packetMetadata}
                    setPacketMetadata={setPacketMetadata}
                    scanStatus={scanStatus}
                    setScanStatus={setScanStatus}
                    modelResults={modelResults}
                    setModelResults={setModelResults}
                    modelUsed={modelUsed}
                    setModelUsed={setModelUsed}
                    onChange={setVisualEvidence}
                    propertyCoordinates={getPayloadCoordinates(pendingPayload)}
                    onRegisterProcessor={registerVisualEvidenceProcessor}
                    onBusyChange={setIsEvidenceSectionBusy}
                  />
                </div>
              </div>
            </div>
          )}

          {isLoading && pendingPayload && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/90 backdrop-blur-md px-4 py-6">
              <div className="w-full max-w-4xl">
              <div className="mb-5 flex flex-col items-center text-center">
                 <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
                 <h2 className="text-xl font-bold font-headline text-slate-800">Generating collateral intelligence</h2>
                 <p className="text-sm text-slate-500">The deterministic valuation and verification pipeline is running.</p>
              </div>
              <AgentTerminal 
              isActive={isLoading} 
              locationName={getPayloadAddress(pendingPayload).split(',')[0]} 
              hasImages={payloadHasImages(pendingPayload) || Object.keys(packet).length > 0}
               onComplete={finalizeValuation} 
            />
              </div>
            </div>
          )}

          {!currentData && !isLoading ? (
             <LandingHub onInitialize={() => setShowWizard(true)} />
          ) : (
              currentData && (

              <div className={`max-w-7xl mx-auto pt-3 md:pt-4 flex flex-col gap-0 ${isLoading ? 'opacity-0 scale-95 transition-all' : 'opacity-100 scale-100 transition-all duration-500'}`}>
                <CaseHeader data={augmentedData} />
                
                {/* Workflow Navigation */}
                <div className="sticky top-2 z-30 mb-6 bg-white shadow-md overflow-x-auto rounded-xl flex flex-row ps-nav">
                  {[
                    { id: 'overview',     label: 'Overview',          icon: 'monitoring' },
                    { id: 'intelligence', label: 'Deep Intelligence', icon: 'radar' },
                    { id: 'verification', label: 'Verification',      icon: 'verified_user' },
                    { id: 'risk',         label: 'Risk & Valuation',  icon: 'account_balance' },
                    { id: 'audit',        label: 'Audit & Evidence',  icon: 'description' },
                    { id: 'report',       label: 'Report PDF',        icon: 'picture_as_pdf' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide transition-colors whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'text-indigo-700 border-b-2 border-indigo-600'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === 'overview' && (
                  <OverviewPanel 
                    data={augmentedData} 
                    underwriterSummary={underwriterSummary}
                    isUnderwriterSummaryLoading={isUnderwriterSummaryLoading}
                    coordinates={currentData.coordinates}
                    showCircleRate={showCircleRate}
                    setShowCircleRate={setShowCircleRate}
                    showMetro={showMetro}
                    setShowMetro={setShowMetro}
                    showFlood={showFlood}
                    showImpactFactors={showImpactFactors}
                    setShowImpactFactors={setShowImpactFactors}
                    hyperlocalPOIs={currentData.hyperlocalContext?.pois || []}
                  />
                )}

                {activeTab === 'intelligence' && (
                  <DeepIntelligencePanel
                    data={augmentedData}
                    packet={packet}
                    setPacket={setPacket}
                    packetMetadata={packetMetadata}
                    setPacketMetadata={setPacketMetadata}
                    scanStatus={scanStatus}
                    setScanStatus={setScanStatus}
                    modelResults={modelResults}
                    setModelResults={setModelResults}
                    modelUsed={modelUsed}
                    setModelUsed={setModelUsed}
                    onVisualEvidenceChange={setVisualEvidence}
                    propertyCoordinates={currentData?.coordinates}
                    underwriterSummary={underwriterSummary}
                    isUnderwriterSummaryLoading={isUnderwriterSummaryLoading}
                    underwriterSummaryEnhancement={underwriterSummaryEnhancement}
                  />
                )}

                {activeTab === 'verification' && (
                  <VerificationPanel data={augmentedData} />
                )}

                {activeTab === 'risk' && (
                  <RiskValuationPanel data={augmentedData} />
                )}

                {activeTab === 'audit' && (
                  <AuditEvidencePanel
                    data={augmentedData}
                    underwriterSummary={underwriterSummary}
                    isUnderwriterSummaryLoading={isUnderwriterSummaryLoading}
                    enhancementState={underwriterSummaryEnhancement}
                  />
                )}

                {activeTab === 'report' && (
                  <ReportPanel
                    data={augmentedData}
                    underwriterSummary={underwriterSummary}
                  />
                )}

              </div>
             )
          )}
        </main>

        {/* Bottom Decision Bar */}
        {currentData && !isLoading && (
          <FinalDecisionStrip
            data={augmentedData}
            underwriterSummary={underwriterSummary}
          />
        )}

      </div>
    </div>
  );
}
