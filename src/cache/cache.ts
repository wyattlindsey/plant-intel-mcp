/**
 * The cache interface, deliberately free of any Node import so that everything
 * downstream of it -- sources, mappers, the companion engine -- stays runtime
 * agnostic and can run unchanged in a Worker or a browser.
 */

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}

export type CacheParams = Record<string, string | number | boolean | undefined | null>;

export interface CacheKeyOptions {
  /**
   * Partitions the key by credential. Perenual's free tier withholds fields
   * that a paid key returns, so entries written under one key must never be
   * served to another. Pass a fingerprint, never the credential itself.
   */
  scope?: string;
}

/** Parameter names that carry credentials and must never reach disk. */
const SECRET_PARAM_NAMES = new Set(['key', 'api_key', 'apikey', 'token', 'secret', 'password']);

/**
 * Builds a stable cache key. Parameter order does not matter, absent and
 * undefined parameters are equivalent, and credentials are stripped.
 */
export function cacheKey(
  source: string,
  path: string,
  params: CacheParams,
  options: CacheKeyOptions = {},
): string {
  const canonical = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .filter(([name]) => !SECRET_PARAM_NAMES.has(name.toLowerCase()))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${String(value)}`)
    .join('&');

  return `${source}|${options.scope ?? ''}|${path}|${canonical}`;
}

/** Used when caching is disabled; every read is a miss. */
export class NullCache implements Cache {
  async get<T>(_key: string): Promise<T | undefined> {
    return undefined;
  }

  async set<T>(_key: string, _value: T, _ttlMs: number): Promise<void> {
    // Intentionally empty: a disabled cache retains nothing.
  }
}
