import { ToolError } from '../errors.js';
import type { DailySeries } from '../mappers/frost.js';
import type { HttpDeps } from './http.js';
import { getJson } from './http.js';

export const OPEN_METEO_ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

/** Reanalysis of a past year never changes, so this can be cached hard. */
const ARCHIVE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Years of history reduced into one frost estimate. */
export const FROST_WINDOW_YEARS = 10;

/**
 * ERA5 lags real time by about five days and a partial year would skew the
 * estimate, so the window ends two years back and always covers whole years.
 */
export const FROST_WINDOW_LAG_YEARS = 2;

export interface ArchiveWindow {
  from: number;
  to: number;
}

export function frostWindowFor(today: Date): ArchiveWindow {
  const to = today.getUTCFullYear() - FROST_WINDOW_LAG_YEARS;
  return { from: to - FROST_WINDOW_YEARS + 1, to };
}

export class OpenMeteoClient {
  readonly #deps: HttpDeps;
  readonly #baseUrl: string;

  constructor(deps: HttpDeps, baseUrl: string = OPEN_METEO_ARCHIVE_URL) {
    this.#deps = deps;
    this.#baseUrl = baseUrl;
  }

  /** Daily minimum temperatures in local time for whole years in the window. */
  async dailyMinima(
    latitude: number,
    longitude: number,
    window: ArchiveWindow,
  ): Promise<DailySeries> {
    const params = {
      latitude,
      longitude,
      start_date: `${String(window.from)}-01-01`,
      end_date: `${String(window.to)}-12-31`,
      daily: 'temperature_2m_min',
      // Frost is a local-midnight phenomenon; without this the daily
      // aggregation is cut on UTC boundaries and dates drift near the meridian.
      timezone: 'auto',
    };

    const raw = await getJson<{ daily?: Partial<DailySeries> }>({
      deps: this.#deps,
      source: 'open-meteo',
      label: 'Open-Meteo',
      url: this.#baseUrl,
      path: '/v1/archive',
      ttlMs: ARCHIVE_TTL_MS,
      params,
    });

    const time = raw.daily?.time;
    const minima = raw.daily?.temperature_2m_min;

    if (!Array.isArray(time) || !Array.isArray(minima)) {
      throw new ToolError('upstream_error', 'Open-Meteo returned no daily temperature series.', {
        remedy: 'Check that the coordinates are valid, then retry.',
      });
    }

    return { time, temperature_2m_min: minima };
  }
}
