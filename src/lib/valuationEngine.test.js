import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalizePropertyInput,
  validatePropertyRecord,
  runValuation,
} from './valuationEngine.js';

test('canonicalizes legacy field names into one schema', () => {
  const record = canonicalizePropertyInput({
    propertyType: 'flat',
    propertySubtype: '2bhk',
    sqft: '850',
    areaUnit: 'sqft',
    floor_number: 8,
    total_floors: 12,
    age: '7',
    cityTier: 1,
  });

  assert.equal(record.type, 'Apartment');
  assert.equal(record.config, '2 BHK');
  assert.equal(record.areaSqft, 850);
  assert.equal(record.floor, 8);
  assert.equal(record.totalFloors, 12);
  assert.equal(record.ageYears, 7);
  assert.equal(record.areaSource, 'user_provided');
});

test('rejects impossible property values with clear validation errors', () => {
  assert.throws(
    () => validatePropertyRecord({
      type: 'Apartment',
      areaSqft: 0,
      ageYears: -2,
      config: '2 BHK',
    }),
    /areaSqft|ageYears/
  );
});

test('keeps nulls separate from zero when validating', () => {
  const result = validatePropertyRecord({
    type: 'Apartment',
    areaSqft: 600,
    config: '2 BHK',
    ageYears: 0,
    floor: 0,
  });

  assert.equal(result.valid, true);
  assert.equal(result.fields.areaSqft.value, 600);
  assert.equal(result.fields.ageYears.value, 0);
  assert.equal(result.fields.floor.value, 0);
});

test('runValuation returns a valid liquidity payload without crashing', async () => {
  const result = await runValuation({
    location: 'Andheri East, Mumbai',
    coordinates: [19.1136, 72.8697],
    propertyType: 'apartment',
    propertySubtype: '2bhk',
    sqft: 850,
    areaUnit: 'sqft',
    floor_number: 8,
    total_floors: 12,
    age: 7,
    cityTier: 1,
    enrichment: {
      legalStatus: 'clear',
      occupancy: 'vacant',
      rental: 0,
      images: { exterior: true },
      rawImages: [],
    },
  });

  assert.equal(typeof result.PropIntel, 'number');
  assert.equal(typeof result.timeToSell, 'string');
  assert.equal(typeof result.ltv, 'number');
  assert.equal(typeof result.liquidityAssessment?.resalePotentialIndex, 'number');
  assert.equal(typeof result.distressLiquidation?.netRecoveryValue, 'number');
});
