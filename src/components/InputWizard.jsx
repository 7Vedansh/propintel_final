import React, { useEffect, useRef, useState } from 'react';
import {
  PROPERTY_SUBTYPES,
  UNIT_CONVERSIONS,
  buildStage1Output,
  computeCompletenessStatus,
  deriveAgeBucket,
  normalizeSizeToSqft,
  normalizeTaxonomy
} from '../lib/stage1Engine';

function isValidCoordinatePair(lat, lon) {
  const parsedLat = Number(lat);
  const parsedLon = Number(lon);
  return Number.isFinite(parsedLat) && Number.isFinite(parsedLon)
    && parsedLat >= -90 && parsedLat <= 90
    && parsedLon >= -180 && parsedLon <= 180;
}

// Shared input field style. Keeps every input/select in this wizard visually consistent.
const FIELD_BASE = "w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none shadow-sm focus:ring-2 focus:ring-indigo-500 text-slate-800";
const FIELD_DISABLED = `${FIELD_BASE} disabled:opacity-50`;

export default function InputWizard({ onSubmit, onCancel }) {
  const [step, setStep] = useState(1);

  const [locationName, setLocationName] = useState('Lotus Heights, Andheri East, Mumbai');
  const [lat, setLat] = useState('19.1136');
  const [lon, setLon] = useState('72.8697');
  const [type, setType] = useState('Apartment');
  const [propertySubtype, setPropertySubtype] = useState('Apartment');
  const [config, setConfig] = useState('2 BHK');
  const [area, setArea] = useState(950);
  const [areaUnit, setAreaUnit] = useState('sqft');
  const [age, setAge] = useState('12');
  const [floor, setFloor] = useState(3);

  const [legalStatus, setLegalStatus] = useState('clear');
  const [titleClarity, setTitleClarity] = useState('verified');
  const [occupancy, setOccupancy] = useState('owner');
  const [rentalAmount, setRentalAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeout = useRef(null);

  const subtypeOptions = PROPERTY_SUBTYPES[type] || [];
  const coordinatesReady = isValidCoordinatePair(lat, lon);

  const rawIntake = {
    address: locationName,
    lat,
    lon,
    propertyType: type,
    propertySubtype,
    config,
    size: area,
    sizeUnit: areaUnit,
    age,
    floor,
    legalStatus,
    titleClarity,
    occupancy,
    rentalAmount
  };

  const normalizedSize = normalizeSizeToSqft(area, areaUnit);
  const ageBucket = deriveAgeBucket(age);
  const taxonomy = normalizeTaxonomy(rawIntake);
  const completenessStatus = computeCompletenessStatus(rawIntake, {
    taxonomy,
    size: normalizedSize,
    age: ageBucket
  });

  const fieldStatus = {
    location: { filled: locationName.trim().length >= 3 || coordinatesReady, mandatory: true, label: 'Location' },
    type: { filled: taxonomy.propertyType !== 'Unspecified', mandatory: true, label: 'Property Type' },
    subtype: { filled: taxonomy.propertySubtype !== 'Unspecified', mandatory: true, label: 'Subtype' },
    area: { filled: Number(normalizedSize.standardizedSizeSqft) > 0, mandatory: true, label: 'Size' },
    age: { filled: ageBucket.ageYears !== null, mandatory: true, label: 'Age' },
    legal: { filled: Boolean(legalStatus), mandatory: false, label: 'Legal' },
    title: { filled: Boolean(titleClarity), mandatory: false, label: 'Title' },
    occupancy: { filled: Boolean(occupancy), mandatory: false, label: 'Occupancy' },
    rental: { filled: Number(rentalAmount) > 0, mandatory: false, label: 'Rental' }
  };
  const mandatoryComplete = completenessStatus.mandatoryComplete;
  const completenessScore = Object.values(fieldStatus).filter((field) => field.filled).length / Object.values(fieldStatus).length;

  useEffect(() => {
    const nextOptions = PROPERTY_SUBTYPES[type] || [];
    if (nextOptions.length > 0 && !nextOptions.includes(propertySubtype)) {
      setPropertySubtype(nextOptions[0]);
    }
  }, [type, propertySubtype]);

  const fetchSuggestions = async (query) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`);
      const data = await res.json();
      let finalSuggestions = data.features || [];

      if (finalSuggestions.length === 0) {
        const hashOffsetLat = (query.length * 0.002) - 0.04;
        const hashOffsetLon = (query.charCodeAt(0) * 0.002) - 0.04;
        finalSuggestions = [{
          properties: {
            name: query.split(',')[0],
            city: query.split(',').slice(1).join(',').trim() || 'Maharashtra',
            state: 'PropIntel Interpolated'
          },
          geometry: { coordinates: [73.0183 + hashOffsetLon, 19.0183 + hashOffsetLat] }
        }];
      }

      setSuggestions(finalSuggestions);
      setShowDropdown(true);
    } catch (err) {
      console.warn('Autosuggest failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLocationChange = (e) => {
    setLocationName(e.target.value);
    setLat('');
    setLon('');
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchSuggestions(e.target.value), 400);
  };

  const selectLocation = (feature) => {
    const prop = feature.properties;
    const coords = feature.geometry.coordinates;
    setLocationName([prop.name, prop.street, prop.city, prop.state].filter(Boolean).join(', '));
    setLat(String(coords[1]));
    setLon(String(coords[0]));
    setShowDropdown(false);
  };

  const handleSubmit = async () => {
    if (!mandatoryComplete || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const stage1Output = await buildStage1Output(rawIntake);
      onSubmit(stage1Output);
    } catch (error) {
      console.error('Stage 1 normalization failed:', error);
      setIsSubmitting(false);
    }
  };

  const locationSummary = locationName.trim()
    ? locationName.split(',').slice(0, 2).join(',')
    : coordinatesReady
      ? `Pin ${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`
      : 'Awaiting location';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in zoom-in duration-300">
      <div className="bg-white rounded-3xl overflow-hidden shadow-2xl flex max-w-4xl w-full h-[620px] border border-slate-200">
        <div className="w-1/3 bg-gradient-to-br from-indigo-50 to-cyan-50 p-8 text-slate-900 flex flex-col relative overflow-hidden border-r border-indigo-100">
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-indigo-300 rounded-full blur-[80px] opacity-30"></div>

          <h2 className="text-2xl font-headline font-bold mb-2">PropIntel Valuator</h2>
          <p className="text-slate-500 text-sm font-body mb-8">Constructing value step-by-step using multiple intelligence engines.</p>

          <div className="space-y-6 flex-1">
            {[1, 2, 3].map((stepNumber) => (
              <div key={stepNumber} className="flex gap-4 items-start relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                  step === stepNumber ? 'bg-indigo-600 text-white' : step > stepNumber ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 border border-slate-200'
                }`}>
                  {step > stepNumber ? <span className="material-symbols-outlined text-sm">check</span> : stepNumber}
                </div>
                <div>
                  <p className={`font-headline font-bold text-sm ${step === stepNumber ? 'text-slate-900' : 'text-slate-500'}`}>
                    {stepNumber === 1 ? 'Location Intelligence' : stepNumber === 2 ? 'Property Details' : 'Data Enrichment'}
                  </p>
                  <p className="text-slate-400 text-xs mt-1 leading-snug">
                    {stepNumber === 1 ? 'Anchor to circle rates and infra grids.' : stepNumber === 2 ? 'Establish structural baseline.' : 'Optional signals to narrow uncertainty.'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto relative z-10">
            <div className="p-3 bg-white/80 rounded-xl border border-indigo-100 mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-600 font-bold uppercase tracking-wider">Data Completeness</p>
                <span className="text-xs font-mono text-indigo-600">{Math.round(completenessScore * 100)}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-400 to-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${completenessScore * 100}%` }}
                ></div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.values(fieldStatus).map((field, idx) => (
                  <span key={idx} className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                    field.filled ? 'bg-emerald-50 text-emerald-700' : field.mandatory ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {field.filled ? 'OK' : field.mandatory ? '!' : '-'} {field.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-3 bg-white/80 rounded-xl border border-indigo-100">
              <p className="text-xs text-slate-700 flex items-center gap-2 font-bold uppercase tracking-wider mb-1">
                <span className="material-symbols-outlined text-[14px] text-amber-400">shield</span> Stage 1 Contract
              </p>
              <p className="text-xs text-slate-500 leading-tight">Required intake is normalized before valuation agents consume the case.</p>
            </div>
          </div>
        </div>

        <div className="w-2/3 bg-slate-50 flex flex-col">
          <div className="flex justify-between items-center px-8 py-5 border-b border-slate-200 bg-white">
            <h3 className="font-headline font-bold text-slate-800 text-lg">
              {step === 1 && 'Step 1: Where is the asset?'}
              {step === 2 && 'Step 2: What is the asset?'}
              {step === 3 && 'Step 3: Enrich & Finalize (Optional)'}
            </h3>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Search Address, Locality, or Building</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-3 text-slate-400">search</span>
                    <input
                      type="text"
                      value={locationName}
                      onChange={handleLocationChange}
                      onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 outline-none transition-shadow shadow-sm"
                      placeholder="Start typing an address..."
                    />
                    {showDropdown && suggestions.length > 0 && (
                      <ul className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                        {suggestions.map((feature, idx) => (
                          <li
                            key={idx}
                            onClick={() => selectLocation(feature)}
                            className="px-4 py-3 hover:bg-indigo-50 border-b border-slate-100 last:border-0 cursor-pointer flex items-center gap-3 transition-colors"
                          >
                            <span className="material-symbols-outlined text-slate-400 text-[18px]">location_on</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate">{feature.properties.name || feature.properties.street || feature.properties.city}</p>
                              <p className="text-xs text-slate-500 truncate">
                                {[feature.properties.city, feature.properties.state, feature.properties.country].filter(Boolean).join(', ')}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {isSearching && (
                      <div className="absolute right-3 top-3 w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Latitude</label>
                    <input
                      type="number"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className={FIELD_BASE}
                      placeholder="19.1136"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Longitude</label>
                    <input
                      type="number"
                      value={lon}
                      onChange={(e) => setLon(e.target.value)}
                      className={FIELD_BASE}
                      placeholder="72.8697"
                    />
                  </div>
                </div>

                <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100 flex items-start gap-4">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-indigo-600">my_location</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-indigo-900 mb-1">Resolved intake: {locationSummary}</p>
                    <p className="text-xs text-indigo-700 leading-snug">
                      {coordinatesReady
                        ? `Coordinates ready: ${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`
                        : 'Coordinates will be resolved from the address during Stage 1.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Property Type</label>
                    <select value={type} onChange={(e) => setType(e.target.value)} className={FIELD_BASE}>
                      <option>Apartment</option>
                      <option>Villa</option>
                      <option>Commercial</option>
                      <option>Plot</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Property Subtype</label>
                    <select value={propertySubtype} onChange={(e) => setPropertySubtype(e.target.value)} className={FIELD_BASE}>
                      {subtypeOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Configuration</label>
                    <select value={config} onChange={(e) => setConfig(e.target.value)} disabled={type === 'Plot'} className={FIELD_DISABLED}>
                      <option>1 BHK</option>
                      <option>2 BHK</option>
                      <option>3 BHK</option>
                      <option>4 BHK+</option>
                      <option>Studio</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Floor Number</label>
                    <input
                      type="number"
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      disabled={type !== 'Apartment'}
                      className={FIELD_DISABLED}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Carpet Area</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        className="flex-1 p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none shadow-sm focus:ring-2 focus:ring-indigo-500 text-slate-800"
                      />
                      <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        {Object.entries(UNIT_CONVERSIONS).map(([key, val]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setAreaUnit(key)}
                            className={`px-3 py-2 text-xs font-bold transition-colors ${
                              areaUnit === key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {val.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {areaUnit !== 'sqft' && (
                      <p className="text-xs text-indigo-600 mt-1 font-mono">= {normalizedSize.standardizedSizeSqft || 0} sqft normalized</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Age <span className="text-slate-300 normal-case tracking-normal">(years or range e.g. 5-10)</span>
                    </label>
                    <input
                      type="text"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className={FIELD_BASE}
                      placeholder="e.g. 12 or 5-10"
                    />
                    {ageBucket.ageBucket !== 'Unknown' && (
                      <span className={`inline-block mt-2 text-xs font-bold px-2.5 py-1 rounded-full ${
                        ageBucket.ageBucket === 'New' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        ageBucket.ageBucket === 'Mid-age' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-red-50 text-red-600 border border-red-200'
                      }`}>
                        {ageBucket.ageBucket}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Legal Status</label>
                    <select value={legalStatus} onChange={(e) => setLegalStatus(e.target.value)} className={FIELD_BASE}>
                      <option value="">Not Provided</option>
                      <option value="clear">Clear Title (Freehold)</option>
                      <option value="lease">Leasehold</option>
                      <option value="dispute">Legal Dispute Known</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Title Clarity</label>
                    <select value={titleClarity} onChange={(e) => setTitleClarity(e.target.value)} className={FIELD_BASE}>
                      <option value="">Not Provided</option>
                      <option value="verified">Verified</option>
                      <option value="partial">Partial Documents</option>
                      <option value="unclear">Unclear</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Occupancy</label>
                    <select value={occupancy} onChange={(e) => setOccupancy(e.target.value)} className={FIELD_BASE}>
                      <option value="">Not Provided</option>
                      <option value="owner">Owner Occupied</option>
                      <option value="rented">Rented</option>
                      <option value="vacant">Vacant</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Rental Amount</label>
                    <input
                      type="number"
                      value={rentalAmount}
                      onChange={(e) => setRentalAmount(e.target.value)}
                      className={FIELD_BASE}
                      placeholder="Monthly rent if leased"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-indigo-500">photo_library</span>
                    <div>
                      <p className="text-sm font-bold text-indigo-900">Field images come next</p>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-indigo-700">
                        After this intake, upload the categorized evidence packet. PropIntel will read capture time, GPS, and quality metadata automatically before scoring.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-slate-200 bg-white flex justify-between items-center">
            {step > 1 ? (
              <button onClick={() => setStep(step - 1)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">Back</button>
            ) : <div />}

            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-6 py-2.5 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md transition-colors flex items-center gap-2"
              >
                Continue <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!mandatoryComplete || isSubmitting}
                className="px-8 py-3 rounded-lg text-sm font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined">{isSubmitting ? 'sync' : 'analytics'}</span>
                {isSubmitting ? 'Resolving Stage 1...' : 'Generate Intelligence'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
