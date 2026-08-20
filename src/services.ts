import type { Cache } from './cache/cache.js';
import { NullCache } from './cache/cache.js';
import { JsonFileCache } from './cache/json-file-cache.js';
import type { Config } from './config.js';
import { loadConfig } from './config.js';
import type { FetchLike } from './sources/http.js';
import { PERENUAL_FREE_DAILY_LIMIT, PerenualClient } from './sources/perenual.js';
import { DailyQuota } from './sources/quota.js';

export interface Services {
  config: Config;
  cache: Cache;
  /** Null when PERENUAL_API_KEY is absent; the tools needing it stay unregistered. */
  perenual: PerenualClient | null;
}

export interface ServiceOverrides {
  fetch?: FetchLike;
  cache?: Cache;
}

/**
 * Builds the source clients a configuration supports. This is the only place
 * that reaches for the filesystem, keeping sources and mappers portable.
 */
export function createServices(
  config: Config = loadConfig(),
  overrides: ServiceOverrides = {},
): Services {
  const cache =
    overrides.cache ??
    (config.cacheDir === null ? new NullCache() : new JsonFileCache({ dir: config.cacheDir }));
  const fetchFn = overrides.fetch ?? ((url, init) => fetch(url, init));

  const perenual =
    config.perenual === null
      ? null
      : new PerenualClient({
          apiKey: config.perenual.apiKey,
          scope: config.perenual.scope,
          deps: { fetch: fetchFn, cache },
          quota: new DailyQuota({
            cache,
            limit: PERENUAL_FREE_DAILY_LIMIT,
            label: 'Perenual',
            scope: config.perenual.scope,
          }),
        });

  return { config, cache, perenual };
}
