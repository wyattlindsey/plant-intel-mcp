import { ToolError } from '../errors.js';
import type { HttpDeps } from './http.js';
import { getJson } from './http.js';
import type { DailyQuota } from './quota.js';

export const PERENUAL_BASE_URL = 'https://perenual.com/api';

/** Perenual's free tier permits 100 requests per UTC day. */
export const PERENUAL_FREE_DAILY_LIMIT = 100;

/** The free tier serves species data only for ids in this range. */
export const PERENUAL_FREE_SPECIES_MAX = 3000;

/** Plant care data is effectively static; a month-old record is still correct. */
const SPECIES_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface PerenualSearchOptions {
  page?: number;
  edible?: boolean;
  poisonous?: boolean;
  indoor?: boolean;
  cycle?: string;
  watering?: string;
  sunlight?: string;
  hardiness?: number;
}

export interface PerenualClientOptions {
  apiKey: string;
  /** Credential fingerprint used to partition cache entries and the quota. */
  scope: string;
  deps: HttpDeps;
  quota: DailyQuota;
  baseUrl?: string;
}

export class PerenualClient {
  readonly #apiKey: string;
  readonly #scope: string;
  readonly #deps: HttpDeps;
  readonly #quota: DailyQuota;
  readonly #baseUrl: string;

  constructor(options: PerenualClientOptions) {
    this.#apiKey = options.apiKey;
    this.#scope = options.scope;
    this.#deps = options.deps;
    this.#quota = options.quota;
    this.#baseUrl = options.baseUrl ?? PERENUAL_BASE_URL;
  }

  async searchSpecies(query: string, options: PerenualSearchOptions = {}): Promise<unknown> {
    return getJson({
      deps: this.#deps,
      source: 'perenual',
      label: 'Perenual',
      url: `${this.#baseUrl}/v2/species-list`,
      path: '/v2/species-list',
      scope: this.#scope,
      ttlMs: SPECIES_TTL_MS,
      onNetworkRequest: () => this.#quota.consume(),
      params: {
        key: this.#apiKey,
        q: query,
        page: options.page,
        edible: options.edible === undefined ? undefined : Number(options.edible),
        poisonous: options.poisonous === undefined ? undefined : Number(options.poisonous),
        indoor: options.indoor === undefined ? undefined : Number(options.indoor),
        cycle: options.cycle,
        watering: options.watering,
        sunlight: options.sunlight,
        hardiness: options.hardiness,
      },
    });
  }

  async speciesDetails(id: number): Promise<Record<string, unknown>> {
    const raw = await getJson<Record<string, unknown>>({
      deps: this.#deps,
      source: 'perenual',
      label: 'Perenual',
      url: `${this.#baseUrl}/v2/species/details/${String(id)}`,
      path: `/v2/species/details/${String(id)}`,
      scope: this.#scope,
      ttlMs: SPECIES_TTL_MS,
      onNetworkRequest: () => this.#quota.consume(),
      params: { key: this.#apiKey },
    });

    // A free key asked for a species outside its range gets a body with no id
    // rather than a 404. Say what actually happened instead of "no data".
    if (raw === null || typeof raw !== 'object' || raw['id'] === undefined) {
      throw new ToolError('not_found', `Perenual returned no species record for id ${String(id)}.`, {
        remedy:
          id > PERENUAL_FREE_SPECIES_MAX
            ? `Perenual's free tier serves species 1-${String(PERENUAL_FREE_SPECIES_MAX)} only, and this id is above that range. A paid plan covers the full catalogue.`
            : 'Check the id, or call search_plants to find the right one.',
      });
    }

    return raw;
  }

  /** Experimental: the identification endpoint is gated behind Perenual's beta. */
  async identify(imageUrls: string[]): Promise<unknown> {
    const params: Record<string, string> = { key: this.#apiKey };
    imageUrls.forEach((url, index) => {
      params[`Url[${String(index)}]`] = url;
    });

    return getJson({
      deps: this.#deps,
      source: 'perenual',
      label: 'Perenual identification',
      url: `${this.#baseUrl}/identification`,
      path: '/identification',
      scope: this.#scope,
      ttlMs: SPECIES_TTL_MS,
      onNetworkRequest: () => this.#quota.consume(),
      params,
    });
  }

  async remainingRequests(): Promise<number> {
    return this.#quota.remaining();
  }
}
