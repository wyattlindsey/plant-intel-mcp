import { describe, expect, it } from 'vitest';

import { fahrenheitToCelsius, zoneForExtremeMinC, zoneNumber } from '../src/domain/zones.js';

/** USDA zones step 10 F per zone and 5 F per half-zone, starting at -60 F. */
describe('zoneForExtremeMinC', () => {
  it.each([
    [-60, '1a'],
    [-55, '1b'],
    [-50, '2a'],
    [-30, '4a'],
    [-25, '4b'],
    [-20, '5a'],
    [-15, '5b'],
    [-10, '6a'],
    [0, '7a'],
    [5, '7b'],
    [10, '8a'],
    [30, '10a'],
    [55, '12b'],
    [60, '13a'],
    [65, '13b'],
  ])('maps %d F to zone %s', (fahrenheit, expected) => {
    expect(zoneForExtremeMinC(fahrenheitToCelsius(fahrenheit))).toBe(expected);
  });

  it('clamps below the bottom of the scale rather than inventing zone 0', () => {
    expect(zoneForExtremeMinC(fahrenheitToCelsius(-80))).toBe('1a');
  });

  it('clamps above the top of the scale rather than inventing zone 14', () => {
    expect(zoneForExtremeMinC(fahrenheitToCelsius(95))).toBe('13b');
  });

  it('places a familiar reference point correctly', () => {
    // Minneapolis runs near -28 C (-18.4 F) for its annual extreme minimum,
    // inside zone 5a (-20 to -15 F).
    expect(zoneForExtremeMinC(-28)).toBe('5a');
  });

  it('puts a temperature at a zone boundary in the zone it opens', () => {
    // -25 F opens zone 4b (-25 to -20 F); it does not close 4a.
    expect(zoneForExtremeMinC(fahrenheitToCelsius(-25))).toBe('4b');
    expect(zoneForExtremeMinC(fahrenheitToCelsius(-24.9))).toBe('4b');
  });

  it('returns null for a non-finite input rather than a bogus zone', () => {
    expect(zoneForExtremeMinC(Number.NaN)).toBeNull();
  });
});

describe('zoneNumber', () => {
  it('reads the numeric part of a half-zone', () => {
    expect(zoneNumber('7a')).toBe(7);
    expect(zoneNumber('13b')).toBe(13);
  });

  it('accepts a bare zone number', () => {
    expect(zoneNumber('9')).toBe(9);
  });

  it('rejects nonsense', () => {
    expect(zoneNumber('tropical')).toBeNull();
    expect(zoneNumber('')).toBeNull();
  });
});
