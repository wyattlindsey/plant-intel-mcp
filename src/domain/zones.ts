/**
 * USDA plant hardiness zones, which classify a site by its average annual
 * extreme minimum temperature. Each zone spans 10 F and each half-zone 5 F,
 * with zone 1a starting at -60 F.
 *
 * Pure arithmetic on temperature -- no Node imports -- so this runs unchanged
 * in a browser or a Worker.
 */

const LOWEST_ZONE_F = -60;
const HALF_ZONE_F = 5;
const HALF_ZONES = 26; // 13 zones, two halves each.

export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/**
 * The zone whose range contains this extreme minimum temperature, e.g. `7a`.
 * Temperatures beyond the scale clamp to its ends rather than producing a
 * zone that does not exist.
 */
export function zoneForExtremeMinC(extremeMinC: number): string | null {
  if (!Number.isFinite(extremeMinC)) {
    return null;
  }

  const offset = Math.floor((celsiusToFahrenheit(extremeMinC) - LOWEST_ZONE_F) / HALF_ZONE_F);
  const index = Math.min(Math.max(offset, 0), HALF_ZONES - 1);

  return `${String(Math.floor(index / 2) + 1)}${index % 2 === 0 ? 'a' : 'b'}`;
}

/** The zone number from `7a`, `7`, or `7b`. */
export function zoneNumber(zone: string): number | null {
  const match = /^\s*(\d{1,2})\s*[ab]?\s*$/i.exec(zone);
  if (match?.[1] === undefined) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  return value >= 1 && value <= 13 ? value : null;
}
