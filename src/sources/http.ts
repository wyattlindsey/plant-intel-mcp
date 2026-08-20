import type { Cache, CacheParams } from '../cache/cache.js';
import { cacheKey } from '../cache/cache.js';
import { ToolError } from '../errors.js';
import type { SourceId } from '../domain/types.js';

/** The subset of `fetch` this server uses, injected so it can be faked or swapped. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface HttpDeps {
  fetch: FetchLike;
  cache: Cache;
}

export interface GetJsonOptions {
  deps: HttpDeps;
  source: SourceId;
  /** Human-readable name used in error messages, e.g. "Perenual". */
  label: string;
  url: string;
  /** Stable path used for the cache key, independent of the base URL. */
  path: string;
  params?: CacheParams;
  headers?: Record<string, string>;
  ttlMs: number;
  /** Cache partition, typically a credential fingerprint. */
  scope?: string;
  /**
   * Awaited immediately before a network call and skipped entirely on a cache
   * hit. Throwing from here prevents the request -- this is how the free-tier
   * quota guard stops the server from spending a request it does not have.
   */
  onNetworkRequest?: () => Promise<void>;
}

function buildUrl(url: string, params: CacheParams): string {
  const target = new URL(url);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      target.searchParams.set(name, String(value));
    }
  }
  return target.toString();
}

function errorForStatus(label: string, status: number): ToolError {
  if (status === 401 || status === 403) {
    return new ToolError('missing_credentials', `${label} rejected the credential (HTTP ${status}).`, {
      remedy: `Check that the ${label} key in your MCP server config is correct and still active.`,
    });
  }
  if (status === 404) {
    return new ToolError('not_found', `${label} has no record at that address (HTTP 404).`);
  }
  if (status === 429) {
    return new ToolError('quota_exhausted', `${label} is rate limiting this key (HTTP 429).`, {
      remedy: 'Wait for the quota window to reset, or move to a paid plan for a higher ceiling.',
    });
  }
  return new ToolError('upstream_error', `${label} returned HTTP ${status}.`, {
    remedy: 'This is an upstream failure. Retrying shortly usually resolves it.',
  });
}

/**
 * Fetches JSON through the cache. Every failure leaves as a ToolError carrying
 * a remedy, so nothing raw ever reaches the model.
 */
export async function getJson<T>(options: GetJsonOptions): Promise<T> {
  const { deps, source, label, url, path, ttlMs } = options;
  const params = options.params ?? {};
  const key = cacheKey(source, path, params, options.scope === undefined ? {} : { scope: options.scope });

  const cached = await deps.cache.get<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  await options.onNetworkRequest?.();

  let response: Response;
  try {
    response = await deps.fetch(buildUrl(url, params), {
      headers: { accept: 'application/json', ...options.headers },
    });
  } catch (error: unknown) {
    throw new ToolError('upstream_error', `${label} could not be reached.`, {
      remedy: 'Check network connectivity, then retry.',
      cause: error,
    });
  }

  if (!response.ok) {
    throw errorForStatus(label, response.status);
  }

  let parsed: T;
  try {
    parsed = (await response.json()) as T;
  } catch (error: unknown) {
    // Upstream sometimes serves an HTML maintenance page with a 200. Say that
    // plainly rather than echoing the page body into the model's context.
    throw new ToolError('upstream_error', `${label} returned a response that was not valid JSON.`, {
      remedy: 'This usually means an upstream outage or maintenance page. Retry shortly.',
      cause: error,
    });
  }

  await deps.cache.set(key, parsed, ttlMs);
  return parsed;
}
