/**
 * PropIntel API Client
 * 
 * Handles all communication with the backend valuation engine.
 * No hardcoded data - everything comes from the real backend.
 */

const viteEnv = typeof import.meta !== 'undefined' ? (import.meta.env || {}) : {};
export const API_BASE_URL = viteEnv.VITE_API_BASE_URL || viteEnv.VITE_API_URL || 'http://127.0.0.1:8000';

export async function resolveStage1ContextFromBackend({ lat, lon, propertyType, subtype }) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/stage1/resolve-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon, propertyType, subtype })
    });

    if (!response.ok) return null;
    const result = await response.json();
    return result?.source === 'sqlite' && !result.error ? result : null;
  } catch (error) {
    console.warn('Stage 1 SQLite context lookup unavailable; using fallback context.', error);
    return null;
  }
}

export async function resolveHistoricalCasesFromBackend(currentCase) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`${API_BASE_URL}/api/historical/similar-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentCase),
      signal: controller.signal
    });

    if (!response.ok) return null;
    const result = await response.json();
    return result?.source === 'sqlite_historical_cases' && !result.error ? result : null;
  } catch (error) {
    console.warn('Historical SQLite lookup unavailable; using fallback historical cases.', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolvePortfolioConcentrationFromBackend(currentCase) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`${API_BASE_URL}/api/portfolio/concentration-risk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentCase),
      signal: controller.signal
    });

    if (!response.ok) return null;
    const result = await response.json();
    return result?.source === 'sqlite_portfolio_exposure' && !result.error ? result : null;
  } catch (error) {
    console.warn('Portfolio concentration lookup unavailable; showing unavailable state.', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveLocalityIntelligenceFromBackend(currentCase) {
  const controller = new AbortController();
  // Live scraping is bounded server-side (~8s per source × few sources, parallel-ish).
  // Use a generous client timeout so genuine live results aren't cut off; the
  // backend itself never crashes the response.
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/locality/live-intelligence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentCase),
      signal: controller.signal
    });
    if (!response.ok) return buildLocalityContextFallback(currentCase, `Backend returned ${response.status}`);
    const result = await response.json();
    return result?.source === 'live_whitelisted_sources'
      ? result
      : buildLocalityContextFallback(currentCase, 'Backend returned an unexpected locality payload');
  } catch (error) {
    console.warn('Live locality intelligence unavailable; using zero-impact locality context.', error);
    return buildLocalityContextFallback(currentCase, error?.message || 'Backend unreachable');
  } finally {
    clearTimeout(timeout);
  }
}

function buildLocalityContextFallback(currentCase = {}, reason = 'Live sources unavailable') {
  return {
    source: 'local_context_fallback',
    status: 'baseline_context',
    runMode: 'baseline',
    locality: currentCase.locality || 'Current micro-market',
    microMarketId: currentCase.microMarketId || null,
    eventsFound: 0,
    acceptedEvents: 0,
    rejectedEvents: 0,
    growthSignals: 0,
    riskSignals: 0,
    neutralSignals: 0,
    propertyImpactEvents: 0,
    liquidityDelta: 0,
    marketabilityDelta: 0,
    confidenceDelta: 0,
    timeToLiquidateDeltaPct: 0,
    manualReviewRequired: false,
    inspectionRoute: 'none',
    riskFlags: [],
    sourceTierCounts: { official: 0, reputed_media: 0, local_media: 0 },
    corroborationCounts: {},
    watchlistSignals: [],
    events: [],
    sourceStatuses: [],
    auditTrail: [{
      ruleId: 'NEWS_BASELINE_CONTEXT_001',
      source: 'frontend_resilience',
      input: reason,
      effect: 'locality event deltas = 0',
      explanation: 'Live event sources were unavailable, so the case retained a zero-impact locality baseline instead of blocking valuation.',
    }],
    note: 'Live event sources were unavailable. Property location and infrastructure context remain available with zero event-based score impact.',
    generatedAt: new Date().toISOString(),
  };
}

export async function generateUnderwriterSummary(payload, options = {}) {
  const requestBody = {
    ...payload,
    mode: options.mode || 'auto'
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/llm/underwriter-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Underwriter summary failed: ${response.status}`);
    }

    const result = await response.json();
    if (result?.source) return result;
    throw new Error('Underwriter summary response was empty');
  } catch (error) {
    console.warn('AI underwriter summary unavailable; deterministic dashboard remains available.', error);
    return {
      source: 'unavailable',
      modelUsed: null,
      fallbackUsed: false,
      mode: requestBody.mode,
      summaryQuality: 'unavailable',
      upgradeAvailable: false,
      error: error?.message || 'AI underwriter summary unavailable',
      summary: null
    };
  }
}

export async function scanImageFile(file, options = {}) {
  const candidateLabels = options.candidateLabels || [
    'wall crack',
    'large wall crack',
    'damp wall',
    'seepage',
    'water stain',
    'damaged plaster',
    'broken wall',
    'fire damage',
    'severe visible damage'
  ];
  const formData = new FormData();
  formData.append('file', file);
  formData.append('candidateLabels', JSON.stringify(candidateLabels));
  if (options.threshold !== undefined) formData.append('threshold', String(options.threshold));
  const response = await fetch(`${API_BASE_URL}/api/vision/scan`, {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Vision scan failed: ${response.status}`);
  }
  return response.json();
}

export async function scanPropertyImage(imageUrl, options = {}) {
  const candidateLabels = options.candidateLabels || [
    'wall crack',
    'ceiling crack',
    'water seepage stain',
    'mold or damp patch',
    'broken tile',
    'exposed wiring',
    'structural damage',
    'premium interior finish',
    'standard residential room'
  ];

  let response;
  try {
    const imageResponse = await fetch(imageUrl);
    const blob = await imageResponse.blob();
    const formData = new FormData();
    formData.append('file', blob, 'property-image.jpg');
    formData.append('candidateLabels', JSON.stringify(candidateLabels));
    if (options.threshold !== undefined) formData.append('threshold', String(options.threshold));
    response = await fetch(`${API_BASE_URL}/api/vision/scan`, {
      method: 'POST',
      body: formData
    });
  } catch (error) {
    response = await fetch(`${API_BASE_URL}/api/vision/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: imageUrl,
        candidateLabels,
        threshold: options.threshold
      })
    });
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Vision scan failed: ${response.status}`);
  }

  return response.json();
}

export class PropIntelAPI {
  /**
   * Health check - verify backend is running
   */
  static async checkHealth() {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
      });
      
      if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
      
      return await response.json();
    } catch (error) {
      console.error('Backend health check failed:', error);
      throw error;
    }
  }

  /**
   * Main valuation endpoint
   * 
   * Input: Property details + optional images
   * Output: Full valuation with fraud flags + confidence scores
   * 
   * This runs the entire parallel inference pipeline.
   */
  static async runValuation(propertyData, onProgress) {
    try {
      // Validate input
      if (!propertyData.address || !propertyData.carpet_area || !propertyData.pincode) {
        throw new Error('Missing required property fields');
      }

      // Report: Starting valuation
      if (onProgress) {
        onProgress({
          stage: 'initializing',
          message: 'Preparing valuation...',
          progress: 5
        });
      }

      // Build request payload
      const payload = {
        address: propertyData.address,
        latitude: propertyData.latitude,
        longitude: propertyData.longitude,
        property_type: propertyData.property_type || 'apartment',
        config: propertyData.config,
        carpet_area: propertyData.carpet_area,
        age_bucket: propertyData.age_bucket,
        occupancy_status: propertyData.occupancy_status,
        legal_status: propertyData.legal_status,
        pincode: propertyData.pincode,
        city: propertyData.city,
        images: propertyData.images || []
      };

      // Report: Sending to backend
      if (onProgress) {
        onProgress({
          stage: 'dispatching_agents',
          message: 'Sending to backend agents...',
          progress: 10
        });
      }

      const response = await fetch(`${API_BASE_URL}/valuate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Valuation failed: ${response.status}`);
      }

      const result = await response.json();

      // Report: Valuation complete
      if (onProgress) {
        onProgress({
          stage: 'complete',
          message: 'Valuation complete',
          progress: 100,
          result: result
        });
      }

      return result;

    } catch (error) {
      console.error('Valuation error:', error);
      throw error;
    }
  }



  /**
   * Validate address via geocoding
   */
  static async validateAddress(address, city) {
    try {
      const response = await fetch(`${API_BASE_URL}/geocode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, city })
      });

      if (!response.ok) throw new Error('Address validation failed');
      
      return await response.json();
    } catch (error) {
      console.error('Address validation error:', error);
      throw error;
    }
  }

  /**
   * Get market comparables for a property
   */
  static async getComparables(pincode, config, carpetArea) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/comparables?pincode=${pincode}&config=${config}&area=${carpetArea}`,
        { method: 'GET' }
      );

      if (!response.ok) throw new Error('Failed to fetch comparables');
      
      return await response.json();
    } catch (error) {
      console.error('Comparables fetch error:', error);
      throw error;
    }
  }

  /**
   * Batch valuation (for multiple properties)
   */
  static async batchValuate(propertyList) {
    try {
      const response = await fetch(`${API_BASE_URL}/batch-valuate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: propertyList })
      });

      if (!response.ok) throw new Error('Batch valuation failed');
      
      return await response.json();
    } catch (error) {
      console.error('Batch valuation error:', error);
      throw error;
    }
  }

  /**
   * Export backend audit report for stored /valuate runs.
   */
  static async generateReport(valuationId, format = 'json') {
    try {
      const response = await fetch(
        `${API_BASE_URL}/report/${valuationId}?format=${format}`,
        { method: 'GET' }
      );

      if (!response.ok) throw new Error('Report generation failed');

      if (format === 'pdf') {
        return await response.blob();
      }
      return await response.json();
    } catch (error) {
      console.error('Report generation error:', error);
      throw error;
    }
  }
}

export default PropIntelAPI;
