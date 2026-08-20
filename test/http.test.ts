import { describe, expect, it, vi } from 'vitest';

import { NullCache, cacheKey } from '../src/cache/cache.js';
import type { Cache } from '../src/cache/cache.js';
import { ToolError } from '../src/errors.js';
import { getJson } from '../src/sources/http.js';

class MemoryCache implements Cache {
  readonly store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const base = {
  source: 'perenual' as const,
  label: 'Perenual',
  url: 'https://example.test/species-list',
  path: '/species-list',
  ttlMs: 60_000,
};

describe('getJson', () => {
  it('appends parameters to the query string', async () => {
    const fetchFn = vi.fn(async (_url: string) => jsonResponse({ data: [] }));

    await getJson({ ...base, deps: { fetch: fetchFn, cache: new NullCache() }, params: { q: 'kale', key: 'sk-1' } });

    const called = new URL(fetchFn.mock.calls[0]![0]);
    expect(called.searchParams.get('q')).toBe('kale');
    expect(called.searchParams.get('key')).toBe('sk-1');
  });

  it('omits undefined parameters instead of sending "undefined"', async () => {
    const fetchFn = vi.fn(async (_url: string) => jsonResponse({}));

    await getJson({ ...base, deps: { fetch: fetchFn, cache: new NullCache() }, params: { q: 'kale', page: undefined } });

    expect(new URL(fetchFn.mock.calls[0]![0]).searchParams.has('page')).toBe(false);
  });

  it('serves a cache hit without touching the network', async () => {
    const cache = new MemoryCache();
    cache.store.set(cacheKey('perenual', '/species-list', { q: 'kale' }), { data: ['cached'] });
    const fetchFn = vi.fn(async () => jsonResponse({ data: ['fresh'] }));

    const result = await getJson({ ...base, deps: { fetch: fetchFn, cache }, params: { q: 'kale' } });

    expect(result).toEqual({ data: ['cached'] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('stores a successful response for next time', async () => {
    const cache = new MemoryCache();
    const fetchFn = vi.fn(async () => jsonResponse({ data: ['fresh'] }));

    await getJson({ ...base, deps: { fetch: fetchFn, cache }, params: { q: 'kale' } });

    expect(cache.store.get(cacheKey('perenual', '/species-list', { q: 'kale' }))).toEqual({
      data: ['fresh'],
    });
  });

  it('consumes quota only when it actually reaches the network', async () => {
    const cache = new MemoryCache();
    cache.store.set(cacheKey('perenual', '/species-list', {}), { data: [] });
    const onNetworkRequest = vi.fn(async () => {});

    await getJson({ ...base, deps: { fetch: vi.fn(), cache }, onNetworkRequest });
    expect(onNetworkRequest).not.toHaveBeenCalled();

    await getJson({
      ...base,
      deps: { fetch: vi.fn(async () => jsonResponse({})), cache: new NullCache() },
      onNetworkRequest,
    });
    expect(onNetworkRequest).toHaveBeenCalledOnce();
  });

  it('lets a quota guard block the request before it is sent', async () => {
    const fetchFn = vi.fn();
    const blocked = getJson({
      ...base,
      deps: { fetch: fetchFn, cache: new NullCache() },
      onNetworkRequest: async () => {
        throw new ToolError('quota_exhausted', 'spent');
      },
    });

    await expect(blocked).rejects.toThrow(ToolError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('reports a rejected credential as missing_credentials, not a generic failure', async () => {
    const attempt = getJson({
      ...base,
      deps: { fetch: async () => jsonResponse({}, 401), cache: new NullCache() },
    });

    await expect(attempt).rejects.toMatchObject({ code: 'missing_credentials' });
  });

  it('maps 404 to not_found', async () => {
    const attempt = getJson({
      ...base,
      deps: { fetch: async () => jsonResponse({}, 404), cache: new NullCache() },
    });

    await expect(attempt).rejects.toMatchObject({ code: 'not_found' });
  });

  it('maps 429 to quota_exhausted with a remedy', async () => {
    const attempt = getJson({
      ...base,
      deps: { fetch: async () => jsonResponse({}, 429), cache: new NullCache() },
    });

    await expect(attempt).rejects.toMatchObject({ code: 'quota_exhausted' });
  });

  it('reports a server error as upstream_error naming the source and status', async () => {
    const attempt = getJson({
      ...base,
      deps: { fetch: async () => jsonResponse({}, 503), cache: new NullCache() },
    });

    await expect(attempt).rejects.toMatchObject({
      code: 'upstream_error',
      message: expect.stringContaining('Perenual'),
    });
    await expect(attempt).rejects.toMatchObject({ message: expect.stringContaining('503') });
  });

  it('reports unparseable JSON as upstream_error rather than leaking a parser stack', async () => {
    const attempt = getJson({
      ...base,
      deps: {
        fetch: async () => new Response('<html>maintenance</html>', { status: 200 }),
        cache: new NullCache(),
      },
    });

    await expect(attempt).rejects.toMatchObject({ code: 'upstream_error' });
    await expect(attempt).rejects.not.toMatchObject({ message: expect.stringContaining('<html>') });
  });

  it('turns a network failure into a ToolError instead of a raw fetch rejection', async () => {
    const attempt = getJson({
      ...base,
      deps: {
        fetch: async () => {
          throw new TypeError('fetch failed');
        },
        cache: new NullCache(),
      },
    });

    await expect(attempt).rejects.toMatchObject({ code: 'upstream_error' });
  });

  it('does not cache an error response', async () => {
    const cache = new MemoryCache();

    await expect(
      getJson({ ...base, deps: { fetch: async () => jsonResponse({}, 503), cache } }),
    ).rejects.toThrow();

    expect(cache.store.size).toBe(0);
  });
});
