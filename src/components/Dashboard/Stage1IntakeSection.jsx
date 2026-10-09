import React from 'react';

function displayValue(value) {
  if (value === null || value === undefined || value === '' || value === 'not_provided') return 'Not provided';
  return value;
}

function formatRental(value) {
  if (!Number(value)) return 'Not provided';
  return `INR ${Number(value).toLocaleString('en-IN')}/month`;
}

function formatConfidence(value) {
  if (!value || value === 'fallback') return 'Fallback';
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function formatPrevalence(value) {
  if (!Number(value)) return displayValue(value);
  return `${(Number(value) * 100).toFixed(1)}% market share`;
}

function InfoCell({ label, value }) {
  return (
    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium text-slate-800 break-words">{displayValue(value)}</p>
    </div>
  );
}

function HelpTip({ text }) {
  return (
    <span className="relative inline-flex group">
      <button
        type="button"
        className="w-5 h-5 rounded-full border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:border-slate-200 text-xs font-bold flex items-center justify-center"
        aria-label={text}
      >
        ?
      </button>
      <span className="pointer-events-none absolute right-0 top-7 z-20 hidden w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs font-medium leading-snug text-slate-600 shadow-xl group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}

function BucketCard({ icon, title, badge, helpText, items }) {
  return (
    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 min-h-[210px]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-slate-500 text-[22px]">{icon}</span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">{title}</h4>
            <span className="inline-block mt-1 px-1.5 py-0.5 bg-white text-slate-500 text-xs rounded font-mono border border-slate-200">{displayValue(badge)}</span>
          </div>
        </div>
        <HelpTip text={helpText} />
      </div>
      <div className="grid grid-cols-1 gap-3">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{item.label}</p>
            <p className="text-sm text-slate-700 font-semibold leading-snug">{displayValue(item.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Stage1IntakeSection({ stage1 }) {
  if (!stage1?.normalizedPropertyProfile) return null;

  const profile = stage1.normalizedPropertyProfile;
  const buckets = stage1.bucketAssignment || {};
  const metadata = stage1.stage1Metadata || {};
  const missingFields = profile.completenessStatus?.missingFields || [];
  const sourceLabel = metadata.contextSource === 'sqlite'
    ? 'SQLite reference DB'
    : 'fallback generated logic';

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
        <div>
          <h3 className="text-headline-sm font-headline font-bold text-slate-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-500">rule_settings</span>
            Stage 1: Data Normalization & Mapping
          </h3>
          <p className="text-sm text-slate-500 font-medium mt-1">The raw input is cleaned, standardized, and mapped to specific geographic and market zones in our database.</p>
        </div>
        <div className="flex flex-wrap md:justify-end gap-2">
          <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-widest border w-max ${
            profile.completenessStatus?.mandatoryComplete
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-600 border-red-200'
          }`}>
            {profile.completenessStatus?.mandatoryComplete ? 'Mandatory Complete' : `Missing: ${missingFields.join(', ')}`}
          </span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-widest border w-max bg-slate-50 text-slate-600 border-slate-200">
            Context source: {sourceLabel}
          </span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-widest border w-max bg-slate-50 text-slate-700 border-slate-100">
            Location match: {formatConfidence(metadata.locationMatchConfidence)}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Standardized Property Details</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <InfoCell label="Address" value={profile.address} />
            <InfoCell label="Coordinates" value={`${profile.lat}, ${profile.lon}`} />
            <InfoCell label="Type" value={profile.propertyType} />
            <InfoCell label="Subtype" value={profile.propertySubtype} />
            <InfoCell label="Size" value={`${profile.standardizedSizeSqft || '-'} sqft`} />
            <InfoCell label="Age Bucket" value={profile.ageBucket} />
            <InfoCell label="Legal" value={profile.legalStatus} />
            <InfoCell label="Title" value={profile.titleClarity} />
            <InfoCell label="Occupancy" value={profile.occupancy} />
            <InfoCell label="Rental" value={formatRental(profile.rentalAmount)} />
            <InfoCell label="Images" value={`${profile.imageCount} uploaded`} />
            <InfoCell label="Input Unit" value={`${profile.rawSize || '-'} ${profile.rawSizeUnit || ''}`.trim()} />
          </div>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2 flex items-center gap-2">
            Geographic & Market Zone Mapping
            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded font-mono border border-indigo-100 font-bold">LOCALITY_DATA</span>
          </h4>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BucketCard
              icon="map"
              title="City / Regional Zone"
              badge={buckets.coarseBucket?.id}
              helpText="Broad zone-level context used for government values, land-use, and regulatory context."
              items={[
                { label: 'Zone Name', value: buckets.coarseBucket?.label },
                { label: 'Govt. Value Zone', value: buckets.coarseBucket?.circleRateZone },
                { label: 'Primary Land Use', value: buckets.coarseBucket?.broadLandUse },
                { label: 'Regulatory Region', value: buckets.coarseBucket?.regulatoryRegion }
              ]}
            />
            <BucketCard
              icon="hub"
              title="Neighborhood / Micro-Market"
              badge={buckets.microMarketBucket?.id}
              helpText="Neighborhood-level context used for local size norms, subtype prevalence, price band, and liquidity patterns."
              items={[
                { label: 'Neighborhood Name', value: buckets.microMarketBucket?.label },
                { label: 'Property Type Demand', value: formatPrevalence(buckets.microMarketBucket?.subtypePrevalence) },
                { label: 'Typical Size', value: buckets.microMarketBucket?.commonSizeBand },
                { label: 'Market Liquidity', value: buckets.microMarketBucket?.liquidityNorm }
              ]}
            />
            <BucketCard
              icon="near_me"
              title="Street-Level / Hyperlocal"
              badge={buckets.hyperlocalContext?.id}
              helpText="Exact nearby context used for access quality, transit proximity, and surrounding infrastructure cues."
              items={[
                { label: 'Road Connectivity', value: buckets.hyperlocalContext?.roadAccess },
                { label: 'Transit Proximity', value: buckets.hyperlocalContext?.nearestTransit },
                { label: 'Nearby Infrastructure', value: buckets.hyperlocalContext?.infraProximity },
                { label: 'Access Quality', value: buckets.hyperlocalContext?.accessQuality }
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
