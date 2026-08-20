import type { HttpDeps } from './http.js';
import { getJson } from './http.js';

export const PERMAPEOPLE_BASE_URL = 'https://permapeople.org/api';

const PLANT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface PermapeoplePlant {
  id: number;
  name: string | null;
  scientificName: string | null;
}

export interface PermapeopleClientOptions {
  keyId: string;
  keySecret: string;
  deps: HttpDeps;
  baseUrl?: string;
}

function normalise(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/**
 * Permapeople wraps collections differently across its endpoints and has
 * changed the wrapper before, so accept any of the shapes it is known to use
 * rather than binding to one.
 */
function extractPlants(raw: unknown): PermapeoplePlant[] {
  const rows = Array.isArray(raw)
    ? raw
    : ((raw as Record<string, unknown> | null)?.['plants'] ??
      (raw as Record<string, unknown> | null)?.['results'] ??
      (raw as Record<string, unknown> | null)?.['data'] ??
      []);

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      id: typeof row['id'] === 'number' ? row['id'] : Number.NaN,
      name: typeof row['name'] === 'string' ? row['name'] : null,
      scientificName:
        typeof row['scientific_name'] === 'string' ? row['scientific_name'] : null,
    }))
    .filter((plant) => Number.isFinite(plant.id));
}

export class PermapeopleClient {
  readonly #headers: Record<string, string>;
  readonly #deps: HttpDeps;
  readonly #baseUrl: string;

  constructor(options: PermapeopleClientOptions) {
    this.#headers = {
      'x-permapeople-key-id': options.keyId,
      'x-permapeople-key-secret': options.keySecret,
    };
    this.#deps = options.deps;
    this.#baseUrl = options.baseUrl ?? PERMAPEOPLE_BASE_URL;
  }

  async search(query: string): Promise<PermapeoplePlant[]> {
    return extractPlants(
      await getJson({
        deps: this.#deps,
        source: 'permapeople',
        label: 'Permapeople',
        url: `${this.#baseUrl}/search`,
        path: '/search',
        headers: this.#headers,
        ttlMs: PLANT_TTL_MS,
        params: { q: query },
      }),
    );
  }

  async companions(id: number): Promise<PermapeoplePlant[]> {
    return extractPlants(
      await getJson({
        deps: this.#deps,
        source: 'permapeople',
        label: 'Permapeople',
        url: `${this.#baseUrl}/plants/${String(id)}/companions`,
        path: `/plants/${String(id)}/companions`,
        headers: this.#headers,
        ttlMs: PLANT_TTL_MS,
      }),
    );
  }

  /** The Permapeople record best matching a scientific or common name. */
  async resolve(scientificName: string | null, commonName: string | null): Promise<PermapeoplePlant | null> {
    const query = scientificName ?? commonName;
    if (query === null) {
      return null;
    }

    const matches = await this.search(query);
    const wantedScientific = normalise(scientificName);
    const wantedCommon = normalise(commonName);

    return (
      matches.find((plant) => normalise(plant.scientificName) === wantedScientific) ??
      matches.find((plant) => normalise(plant.name) === wantedCommon) ??
      matches[0] ??
      null
    );
  }

  /**
   * Whether Permapeople lists the two as companions. Checked in both
   * directions, since the listing is recorded on one side of the pair only.
   */
  async areCompanions(a: PermapeoplePlant, b: PermapeoplePlant): Promise<boolean> {
    const forward = await this.companions(a.id);
    if (forward.some((plant) => plant.id === b.id)) {
      return true;
    }

    const reverse = await this.companions(b.id);
    return reverse.some((plant) => plant.id === a.id);
  }
}
