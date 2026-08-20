import { describe, expect, it } from 'vitest';

import freeDetails from './fixtures/perenual-species-details-free.json' with { type: 'json' };
import paidDetails from './fixtures/perenual-species-details-paid.json' with { type: 'json' };
import speciesList from './fixtures/perenual-species-list.json' with { type: 'json' };
import {
  isTierGated,
  toDimensionCm,
  toPlantProfile,
  toSearchResults,
  toSunlight,
} from '../src/mappers/perenual.js';

describe('isTierGated', () => {
  it.each([
    'Upgrade Plans To Premium/Supreme - https://perenual.com/subscription-api-pricing',
    'Login Required for Complete Data',
    'upgrade plans to premium',
    'This data requires a Supreme User plan',
  ])('recognises %s as withheld', (value) => {
    expect(isTierGated(value)).toBe(true);
  });

  it.each(['Aphids', 'Medium', 'full sun', '', 'Premium Gala apple'])(
    'leaves real value %s alone',
    (value) => {
      expect(isTierGated(value)).toBe(false);
    },
  );

  it('ignores non-strings', () => {
    expect(isTierGated(1)).toBe(false);
    expect(isTierGated(null)).toBe(false);
    expect(isTierGated(['Aphids'])).toBe(false);
  });
});

describe('toSunlight', () => {
  it.each([
    ['full sun', ['full-sun']],
    ['part shade', ['part-shade']],
    ['sun-part shade', ['part-shade']],
    ['part sun/part shade', ['part-sun', 'part-shade']],
    ['deep shade', ['full-shade']],
    ['filtered shade', ['part-shade']],
  ])('normalises %s', (raw, expected) => {
    expect(toSunlight([raw]).values).toEqual(expected);
  });

  it('deduplicates across entries', () => {
    expect(toSunlight(['full sun', 'Full Sun']).values).toEqual(['full-sun']);
  });

  it('reports values it could not classify instead of dropping them silently', () => {
    const result = toSunlight(['full sun', 'moonlight']);

    expect(result.values).toEqual(['full-sun']);
    expect(result.unrecognised).toEqual(['moonlight']);
  });
});

describe('toDimensionCm', () => {
  it('converts feet to centimetres using the larger bound', () => {
    expect(toDimensionCm({ min_value: 3, max_value: 5, unit: 'feet' })).toBe(152);
  });

  it('converts inches', () => {
    expect(toDimensionCm({ min_value: 6, max_value: 12, unit: 'inches' })).toBe(30);
  });

  it('passes centimetres through', () => {
    expect(toDimensionCm({ min_value: 30, max_value: 90, unit: 'cm' })).toBe(90);
  });

  it('falls back to the lower bound when there is no upper one', () => {
    expect(toDimensionCm({ min_value: 2, max_value: null, unit: 'feet' })).toBe(61);
  });

  it('returns null for an unknown unit rather than a wrong number', () => {
    expect(toDimensionCm({ min_value: 3, max_value: 5, unit: 'cubits' })).toBeNull();
  });

  it('returns null for a missing or gated dimensions block', () => {
    expect(toDimensionCm(null)).toBeNull();
    expect(toDimensionCm('Upgrade Plans To Premium/Supreme')).toBeNull();
  });
});

describe('toSearchResults', () => {
  it('maps the list envelope into summaries', () => {
    const results = toSearchResults(speciesList, 'fir');

    expect(results.page).toBe(1);
    expect(results.totalPages).toBe(405);
    expect(results.results).toHaveLength(2);
    expect(results.results[0]).toMatchObject({
      id: 'perenual:1',
      commonName: 'European Silver Fir',
      scientificName: 'Abies alba',
      otherNames: ['Common Silver Fir'],
      family: null,
    });
  });

  it('flattens the scientific_name array to a single name', () => {
    expect(toSearchResults(speciesList, 'tomato').results[1]?.scientificName).toBe(
      'Solanum lycopersicum',
    );
  });

  it('attributes every result to Perenual', () => {
    expect(toSearchResults(speciesList, 'fir').sources[0]?.name).toBe('Perenual Plant API');
  });
});

describe('toPlantProfile', () => {
  it('maps a complete record', () => {
    const profile = toPlantProfile(paidDetails);

    expect(profile).toMatchObject({
      id: 'perenual:1852',
      commonName: 'Garden Tomato',
      scientificName: 'Solanum lycopersicum',
      family: 'Solanaceae',
      cycle: 'annual',
      sun: ['full-sun'],
      watering: 'frequent',
      hardiness: { min: 10, max: 11 },
      matureHeightCm: 152,
      pests: ['Aphids', 'Tomato Hornworm', 'Whitefly'],
      careLevel: 'Medium',
      growthRate: 'High',
      droughtTolerant: false,
      indoor: false,
    });
    expect(profile.edible).toEqual({ fruit: true, leaf: false });
    expect(profile.toxicity).toEqual({ humans: true, pets: true });
  });

  it('nulls out tier-gated fields instead of passing upgrade copy to the model', () => {
    const profile = toPlantProfile(freeDetails);

    expect(profile.pests).toEqual([]);
    expect(profile.careLevel).toBeNull();
    expect(JSON.stringify(profile)).not.toContain('Upgrade Plans');
    expect(JSON.stringify(profile)).not.toContain('subscription-api-pricing');
    expect(JSON.stringify(profile)).not.toContain('Login Required');
  });

  it('says which fields the tier withheld rather than leaving silent nulls', () => {
    const profile = toPlantProfile(freeDetails);

    expect(profile.notes.join(' ')).toMatch(/withheld/i);
    expect(profile.notes.join(' ')).toMatch(/pest_susceptibility/);
    expect(profile.notes.join(' ')).toMatch(/care_level/);
  });

  it('adds no withholding note when the tier returned everything', () => {
    expect(toPlantProfile(paidDetails).notes.join(' ')).not.toMatch(/withheld/i);
  });

  it('always reports that spacing is unavailable, so absence is not read as zero', () => {
    const profile = toPlantProfile(paidDetails);

    expect(profile.spacingCm).toBeNull();
    expect(profile.notes.join(' ')).toMatch(/spacing/i);
  });

  it('tolerates the [Supreme User] key suffix the docs print', () => {
    expect(() => toPlantProfile(freeDetails)).not.toThrow();
  });

  it('survives a sparse record without throwing', () => {
    const profile = toPlantProfile({ id: 7 });

    expect(profile.id).toBe('perenual:7');
    expect(profile.commonName).toBeNull();
    expect(profile.hardiness).toBeNull();
    expect(profile.sun).toEqual([]);
  });
});
