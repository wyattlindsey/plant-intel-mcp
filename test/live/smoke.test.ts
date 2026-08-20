import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { JsonFileCache } from '../../src/cache/json-file-cache.js';
import { loadConfig } from '../../src/config.js';
import { frostByYear, meanExtremeMinC, summariseFrost } from '../../src/mappers/frost.js';
import { PERENUAL_DETAIL_FIELDS, toPlantProfile, toSearchResults } from '../../src/mappers/perenual.js';
import { createServices } from '../../src/services.js';
import { frostWindowFor } from '../../src/sources/open-meteo.js';

/**
 * Opt-in smoke tests against the real APIs, run with `npm run test:live`.
 *
 * They exist for one reason above all: the recorded fixtures were built from
 * published documentation, and documentation drifts. These assert the mapper's
 * actual field assumptions still hold upstream.
 *
 * Responses are cached in a gitignored directory so repeated local runs cost
 * almost nothing against Perenual's 100-requests-per-day free tier.
 */

const LIVE_CACHE_DIR = join(process.cwd(), '.cache-live');

const config = loadConfig({ ...process.env, PLANT_INTEL_CACHE_DIR: LIVE_CACHE_DIR });
const hasPerenual = config.perenual !== null;

async function liveServices() {
  await mkdir(LIVE_CACHE_DIR, { recursive: true });
  return createServices(config, { cache: new JsonFileCache({ dir: LIVE_CACHE_DIR }) });
}

describe.runIf(hasPerenual)('Perenual (live)', () => {
  it('returns a searchable species list', async () => {
    const services = await liveServices();
    const results = toSearchResults(await services.perenual!.searchSpecies('tomato'), 'tomato');

    expect(results.results.length).toBeGreaterThan(0);
    expect(results.results[0]?.id).toMatch(/^perenual:\d+$/);
  }, 30_000);

  it('still supplies every field the mapper reads', async () => {
    const services = await liveServices();
    const raw = await services.perenual!.speciesDetails(1);

    // Keys may arrive with a " [Supreme User]" suffix on gated fields.
    const present = new Set(Object.keys(raw).map((key) => key.replace(/\s*\[[^\]]*\]\s*$/, '')));
    const missing = PERENUAL_DETAIL_FIELDS.filter((field) => !present.has(field));

    expect(missing, `Perenual no longer returns: ${missing.join(', ')}`).toEqual([]);
  }, 30_000);

  it('produces a profile with no tier upgrade copy in it', async () => {
    const services = await liveServices();
    const profile = toPlantProfile(await services.perenual!.speciesDetails(1));
    const serialised = JSON.stringify(profile);

    expect(profile.scientificName).toBeTruthy();
    expect(serialised).not.toMatch(/upgrade\s+plans/i);
    expect(serialised).not.toContain('subscription-api-pricing');
    expect(serialised).not.toMatch(/login\s+required/i);
  }, 30_000);
});

describe('Open-Meteo (live)', () => {
  it('yields frost dates near published normals for Minneapolis', async () => {
    const services = await liveServices();
    const window = frostWindowFor(new Date());
    const series = await services.openMeteo.dailyMinima(44.98, -93.27, window);
    const seasons = frostByYear(series, { southern: false });
    const frost = summariseFrost(seasons, { percentile: 50, from: window.from, to: window.to });

    expect(seasons.length).toBeGreaterThanOrEqual(9);
    // Minneapolis normals: last spring frost in April/May, first autumn frost
    // in late September or October.
    expect(frost.lastSpringFrost?.slice(0, 2)).toMatch(/^0[45]$/);
    expect(frost.firstFallFrost?.slice(0, 2)).toMatch(/^(09|10|11)$/);
    expect(frost.seasonLengthDays).toBeGreaterThan(120);
  }, 60_000);

  it('derives a plausible USDA zone from observed minima', async () => {
    const services = await liveServices();
    const window = frostWindowFor(new Date());
    const series = await services.openMeteo.dailyMinima(44.98, -93.27, window);
    const mean = meanExtremeMinC(frostByYear(series, { southern: false }));

    // Minneapolis is published as zone 4b/5a: roughly -28 to -23 C.
    expect(mean).toBeLessThan(-20);
    expect(mean).toBeGreaterThan(-35);
  }, 60_000);
});

describe.runIf(config.permapeople !== null)('Permapeople (live)', () => {
  it('resolves a plant and returns its companion listings', async () => {
    const services = await liveServices();
    const match = await services.permapeople!.resolve('Solanum lycopersicum', 'Tomato');

    expect(match).not.toBeNull();
    await expect(services.permapeople!.companions(match!.id)).resolves.toBeInstanceOf(Array);
  }, 30_000);
});
