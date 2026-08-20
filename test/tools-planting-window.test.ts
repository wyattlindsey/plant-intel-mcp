import { describe, expect, it, vi } from 'vitest';

import paidDetails from './fixtures/perenual-species-details-paid.json' with { type: 'json' };
import type { PlantingWindow } from '../src/domain/types.js';
import { jsonBody, startHarness, textBody } from './helpers/harness.js';

/** Ten whole years of daily minima with a fixed frost pattern. */
function archive(lastSpring: string, firstFall: string, coldC = -12): unknown {
  const time: string[] = [];
  const temperature_2m_min: number[] = [];

  for (let year = 2015; year <= 2024; year += 1) {
    const end = Date.UTC(year, 11, 31);
    for (let ms = Date.UTC(year, 0, 1); ms <= end; ms += 86_400_000) {
      const iso = new Date(ms).toISOString().slice(0, 10);
      const monthDay = iso.slice(5);
      time.push(iso);
      temperature_2m_min.push(monthDay <= lastSpring || monthDay >= firstFall ? coldC : 14);
    }
  }

  return { daily: { time, temperature_2m_min } };
}

/** Southern-hemisphere pattern: one contiguous mid-calendar-year frost block. */
function southernArchive(autumnFrost: string, springEnd: string): unknown {
  const time: string[] = [];
  const temperature_2m_min: number[] = [];

  for (let year = 2015; year <= 2024; year += 1) {
    const end = Date.UTC(year, 11, 31);
    for (let ms = Date.UTC(year, 0, 1); ms <= end; ms += 86_400_000) {
      const iso = new Date(ms).toISOString().slice(0, 10);
      const monthDay = iso.slice(5);
      time.push(iso);
      temperature_2m_min.push(monthDay >= autumnFrost && monthDay <= springEnd ? -12 : 14);
    }
  }

  return { daily: { time, temperature_2m_min } };
}

function harnessFor(archiveBody: unknown) {
  const fetchFn = vi.fn(async (url: string) => {
    const body = url.includes('archive') ? archiveBody : paidDetails;
    return new Response(JSON.stringify(body), { status: 200 });
  });

  return startHarness({ fetch: fetchFn, now: () => new Date('2026-08-20T00:00:00Z') });
}

async function callWindow(
  archiveBody: unknown,
  args: Record<string, unknown>,
): Promise<{ window: PlantingWindow; raw: unknown }> {
  const harness = await harnessFor(archiveBody);
  const raw = await harness.client.callTool({ name: 'planting_window', arguments: args });
  await harness.close();

  // Error results carry prose, not JSON; those tests assert on `raw` instead.
  const window = (raw as { isError?: boolean }).isError
    ? (null as unknown as PlantingWindow)
    : (jsonBody(raw) as PlantingWindow);

  return { window, raw };
}

const site = { plant: 'perenual:1852', latitude: 44.98, longitude: -93.27 };

describe('planting_window with coordinates', () => {
  it('derives the frost envelope and season length', async () => {
    const { window } = await callWindow(archive('05-05', '10-05'), site);

    expect(window.frost?.lastSpringFrost).toBe('05-05');
    expect(window.frost?.firstFallFrost).toBe('10-05');
    expect(window.frost?.seasonLengthDays).toBe(153);
  });

  it('reads ten whole years, ending two years back to clear the ERA5 lag', async () => {
    const { window } = await callWindow(archive('05-05', '10-05'), site);

    expect(window.frost?.yearsAnalyzed).toEqual({ from: 2015, to: 2024, count: 10 });
  });

  it('derives the USDA zone from observed annual minima', async () => {
    const { window } = await callWindow(archive('05-05', '10-05', -26), site);

    // -26 C is about -15 F, which sits in zone 5b.
    expect(window.zone.derived).toBe('5b');
  });

  it('flags a plant whose hardiness range excludes the site', async () => {
    const { window } = await callWindow(archive('05-05', '10-05', -26), site);

    // The tomato fixture is hardiness 10-11; a zone 5b site is well outside it.
    expect(window.zone.plantRange).toEqual({ min: 10, max: 11 });
    expect(window.zone.compatible).toBe(false);
    expect(window.caveats.join(' ')).toMatch(/grown as an annual/);
  });

  it('always states the ERA5 resolution caveat', async () => {
    const { window } = await callWindow(archive('05-05', '10-05'), site);

    expect(window.caveats.join(' ')).toMatch(/9 km grid/);
  });

  it('says it assumed a tender crop when frost_tolerance was omitted', async () => {
    const { window } = await callWindow(archive('05-05', '10-05'), site);

    expect(window.caveats.join(' ')).toMatch(/assumes a tender crop/);
  });

  it('computes transplant and sow-by dates from caller-supplied crop timing', async () => {
    const { window } = await callWindow(archive('05-05', '10-05'), {
      ...site,
      days_to_maturity: 70,
      frost_tolerance: 'half-hardy',
    });

    expect(window.schedule?.earliestTransplant).toBe('04-21');
    expect(window.schedule?.latestSowForHarvest).toBe('07-27');
  });

  it('leaves the sow-by date null rather than inventing days to maturity', async () => {
    const { window } = await callWindow(archive('05-05', '10-05'), site);

    expect(window.schedule?.latestSowForHarvest).toBeNull();
  });

  it('gets more cautious at a higher percentile', async () => {
    const { window } = await callWindow(archive('05-05', '10-05'), { ...site, percentile: 90 });

    expect(window.frost?.percentile).toBe(90);
  });

  it('reports a frost-free site as frost free rather than as missing data', async () => {
    const { window } = await callWindow(archive('00-00', '13-13'), {
      ...site,
      latitude: 21.3,
      longitude: -157.8,
    });

    expect(window.frost?.lastSpringFrost).toBeNull();
    expect(window.caveats.join(' ')).toMatch(/frost free/);
  });

  it('reads a southern site on its own season, picking the hemisphere from latitude', async () => {
    // A southern frost pattern: freezing through the middle of the calendar
    // year, with the summer sitting at both ends of it.
    const southern = southernArchive('05-10', '08-20');

    const { window } = await callWindow(southern, {
      ...site,
      latitude: -33.87,
      longitude: 151.21,
    });

    expect(window.frost?.lastSpringFrost).toBe('08-20');
    expect(window.frost?.firstFallFrost).toBe('05-10');
    expect(window.frost?.seasonLengthDays).toBeGreaterThan(250);
  });

  it('would report almost no season for that same site read as northern', async () => {
    const { window } = await callWindow(southernArchive('05-10', '08-20'), {
      ...site,
      latitude: 33.87,
      longitude: 151.21,
    });

    // Same data, northern framing: the summer is split across two calendar
    // years and the frost-free window all but disappears.
    expect(window.frost?.seasonLengthDays).toBeLessThan(5);
  });

  it('credits both sources', async () => {
    const { window } = await callWindow(archive('05-05', '10-05'), site);

    expect(window.sources.map((source) => source.name)).toEqual([
      'Perenual Plant API',
      'Open-Meteo Historical Weather API (ERA5)',
    ]);
  });
});

describe('planting_window without coordinates', () => {
  it('checks hardiness from a zone but derives no frost dates', async () => {
    const { window } = await callWindow(archive('05-05', '10-05'), {
      plant: 'perenual:1852',
      hardiness_zone: '5b',
    });

    expect(window.frost).toBeNull();
    expect(window.zone.compatible).toBe(false);
    expect(window.caveats.join(' ')).toMatch(/not frost timing/);
  });

  it('accepts a zone the plant tolerates', async () => {
    const { window } = await callWindow(archive('05-05', '10-05'), {
      plant: 'perenual:1852',
      hardiness_zone: '10b',
    });

    expect(window.zone.compatible).toBe(true);
  });

  it('rejects a zone that is not a zone', async () => {
    const { raw } = await callWindow(archive('05-05', '10-05'), {
      plant: 'perenual:1852',
      hardiness_zone: 'tropical',
    });

    expect((raw as { isError: boolean }).isError).toBe(true);
    expect(textBody(raw)).toMatch(/not a USDA hardiness zone/);
  });

  it('asks for a location when given neither coordinates nor a zone', async () => {
    const { raw } = await callWindow(archive('05-05', '10-05'), { plant: 'perenual:1852' });

    expect((raw as { isError: boolean }).isError).toBe(true);
    expect(textBody(raw)).toMatch(/latitude and longitude/);
  });
});
