import { describe, expect, it } from 'vitest';

import type { PlantSummary } from '../src/domain/types.js';
import { SOURCE_REFS } from '../src/domain/types.js';
import { parsePlantId, pickBestMatch } from '../src/sources/resolve.js';

function summary(id: number, commonName: string, scientificName: string): PlantSummary {
  return {
    id: `perenual:${String(id)}`,
    commonName,
    scientificName,
    otherNames: [],
    family: null,
    cycle: null,
    sources: [SOURCE_REFS.perenual],
  };
}

describe('parsePlantId', () => {
  it('accepts a namespaced id', () => {
    expect(parsePlantId('perenual:1852')).toBe(1852);
  });

  it('accepts a bare numeric id', () => {
    expect(parsePlantId('1852')).toBe(1852);
    expect(parsePlantId(' 1852 ')).toBe(1852);
  });

  it('rejects a name', () => {
    expect(parsePlantId('tomato')).toBeNull();
    expect(parsePlantId('')).toBeNull();
  });

  it('rejects another namespace, so a Permapeople id is not read as a Perenual one', () => {
    expect(parsePlantId('permapeople:1852')).toBeNull();
  });

  it('rejects a non-positive or fractional id', () => {
    expect(parsePlantId('0')).toBeNull();
    expect(parsePlantId('-4')).toBeNull();
    expect(parsePlantId('18.5')).toBeNull();
  });
});

describe('pickBestMatch', () => {
  const results = [
    summary(1, 'Tomatillo', 'Physalis philadelphica'),
    summary(2, 'Garden Tomato', 'Solanum lycopersicum'),
    summary(3, 'Tomato Vine', 'Solanum lycopersicum var. cerasiforme'),
  ];

  it('prefers an exact common-name match over search ranking', () => {
    expect(pickBestMatch(results, 'Garden Tomato')?.id).toBe('perenual:2');
  });

  it('matches case-insensitively', () => {
    expect(pickBestMatch(results, 'garden tomato')?.id).toBe('perenual:2');
  });

  it('prefers an exact scientific-name match', () => {
    expect(pickBestMatch(results, 'Solanum lycopersicum')?.id).toBe('perenual:2');
  });

  it('falls back to the first result when nothing matches exactly', () => {
    expect(pickBestMatch(results, 'tomato')?.id).toBe('perenual:1');
  });

  it('returns null for an empty result set', () => {
    expect(pickBestMatch([], 'tomato')).toBeNull();
  });
});
