import { describe, expect, it, vi } from 'vitest';

import { NullCache } from '../src/cache/cache.js';
import { PerenualClient } from '../src/sources/perenual.js';
import { DailyQuota } from '../src/sources/quota.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function clientWith(fetchFn: (url: string) => Promise<Response>, limit = 100) {
  const cache = new NullCache();
  return new PerenualClient({
    apiKey: 'sk-test',
    scope: 'fp',
    deps: { fetch: fetchFn, cache },
    quota: new DailyQuota({ cache, limit, label: 'Perenual', scope: 'fp' }),
  });
}

describe('PerenualClient.searchSpecies', () => {
  it('calls the v2 species-list endpoint with the query and key', async () => {
    const fetchFn = vi.fn(async (_url: string) => jsonResponse({ data: [] }));
    await clientWith(fetchFn).searchSpecies('tomato');

    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.pathname).toBe('/api/v2/species-list');
    expect(url.searchParams.get('q')).toBe('tomato');
    expect(url.searchParams.get('key')).toBe('sk-test');
  });

  it('sends boolean filters as the 0/1 Perenual expects', async () => {
    const fetchFn = vi.fn(async (_url: string) => jsonResponse({ data: [] }));
    await clientWith(fetchFn).searchSpecies('kale', { edible: true, indoor: false });

    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.searchParams.get('edible')).toBe('1');
    expect(url.searchParams.get('indoor')).toBe('0');
  });

  it('omits filters that were not supplied', async () => {
    const fetchFn = vi.fn(async (_url: string) => jsonResponse({ data: [] }));
    await clientWith(fetchFn).searchSpecies('kale');

    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.searchParams.has('edible')).toBe(false);
    expect(url.searchParams.has('cycle')).toBe(false);
  });
});

describe('PerenualClient.speciesDetails', () => {
  it('requests the details path for the id', async () => {
    const fetchFn = vi.fn(async (_url: string) => jsonResponse({ id: 1852 }));
    await clientWith(fetchFn).speciesDetails(1852);

    expect(new URL(fetchFn.mock.calls[0]![0]).pathname).toBe('/api/v2/species/details/1852');
  });

  it('explains the free-tier species ceiling when a high id returns nothing', async () => {
    const client = clientWith(async () => jsonResponse({}));

    await expect(client.speciesDetails(9999)).rejects.toMatchObject({
      code: 'not_found',
      remedy: expect.stringContaining('1-3000'),
    });
  });

  it('suggests searching when a low id returns nothing', async () => {
    const client = clientWith(async () => jsonResponse({}));

    await expect(client.speciesDetails(12)).rejects.toMatchObject({
      code: 'not_found',
      remedy: expect.stringContaining('search_plants'),
    });
  });
});

describe('PerenualClient quota', () => {
  it('stops calling out once the daily budget is spent', async () => {
    const fetchFn = vi.fn(async (_url: string) => jsonResponse({ data: [] }));
    const client = clientWith(fetchFn, 2);

    await client.searchSpecies('a');
    await client.searchSpecies('b');

    await expect(client.searchSpecies('c')).rejects.toMatchObject({ code: 'quota_exhausted' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
