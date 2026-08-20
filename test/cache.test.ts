import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NullCache, cacheKey } from '../src/cache/cache.js';
import { JsonFileCache } from '../src/cache/json-file-cache.js';

describe('cacheKey', () => {
  it('is stable regardless of parameter ordering', () => {
    const a = cacheKey('perenual', '/species-list', { q: 'tomato', page: 1 });
    const b = cacheKey('perenual', '/species-list', { page: 1, q: 'tomato' });

    expect(a).toBe(b);
  });

  it('separates different sources sharing a path', () => {
    expect(cacheKey('perenual', '/plants', {})).not.toBe(cacheKey('permapeople', '/plants', {}));
  });

  it('distinguishes differing parameter values', () => {
    expect(cacheKey('perenual', '/s', { q: 'basil' })).not.toBe(
      cacheKey('perenual', '/s', { q: 'thyme' }),
    );
  });

  it('omits undefined parameters so they match an absent key', () => {
    expect(cacheKey('perenual', '/s', { q: 'basil', page: undefined })).toBe(
      cacheKey('perenual', '/s', { q: 'basil' }),
    );
  });

  it('never contains an API key value even if one is passed in params', () => {
    const key = cacheKey('perenual', '/species-list', { key: 'sk-secret-value', q: 'kale' });

    expect(key).not.toContain('sk-secret-value');
  });

  it('partitions by credential scope, so a paid key never reads a free key\'s cache', () => {
    const free = cacheKey('perenual', '/species/details/1', {}, { scope: 'free-fingerprint' });
    const paid = cacheKey('perenual', '/species/details/1', {}, { scope: 'paid-fingerprint' });

    expect(free).not.toBe(paid);
  });
});

describe('JsonFileCache', () => {
  let dir: string;
  let now: number;
  let cache: JsonFileCache;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plant-intel-test-'));
    now = 1_000_000;
    cache = new JsonFileCache({ dir, now: () => now });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns undefined on a miss', async () => {
    await expect(cache.get(cacheKey('perenual', '/x', {}))).resolves.toBeUndefined();
  });

  it('round-trips a stored value', async () => {
    const key = cacheKey('perenual', '/species/details/1', {});
    await cache.set(key, { id: 1, common_name: 'tomato' }, 60_000);

    await expect(cache.get(key)).resolves.toEqual({ id: 1, common_name: 'tomato' });
  });

  it('misses once the entry has outlived its ttl', async () => {
    const key = cacheKey('perenual', '/x', {});
    await cache.set(key, 'fresh', 60_000);

    now += 59_999;
    await expect(cache.get(key)).resolves.toBe('fresh');

    now += 2;
    await expect(cache.get(key)).resolves.toBeUndefined();
  });

  it('treats a corrupt entry as a miss instead of throwing', async () => {
    const key = cacheKey('perenual', '/x', {});
    await cache.set(key, 'value', 60_000);
    const [file] = await readdir(dir);
    await writeFile(join(dir, file as string), '{ not json');

    await expect(cache.get(key)).resolves.toBeUndefined();
  });

  it('creates its directory on first write', async () => {
    const nested = new JsonFileCache({ dir: join(dir, 'a', 'b'), now: () => now });
    await nested.set(cacheKey('perenual', '/x', {}), 1, 60_000);

    await expect(nested.get(cacheKey('perenual', '/x', {}))).resolves.toBe(1);
  });
});

describe('NullCache', () => {
  it('never retains anything, so a disabled cache always refetches', async () => {
    const cache = new NullCache();
    const key = cacheKey('perenual', '/x', {});
    await cache.set(key, 'value', 60_000);

    await expect(cache.get(key)).resolves.toBeUndefined();
  });
});
