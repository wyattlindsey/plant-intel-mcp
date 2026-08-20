import { describe, expect, it } from 'vitest';

import { NullCache } from '../src/cache/cache.js';
import type { Cache } from '../src/cache/cache.js';
import { DailyQuota } from '../src/sources/quota.js';

class MemoryCache implements Cache {
  readonly store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }
}

function quotaAt(clock: { value: Date }, cache: Cache, limit = 3): DailyQuota {
  return new DailyQuota({ cache, limit, label: 'Perenual', scope: 'fp', now: () => clock.value });
}

describe('DailyQuota', () => {
  it('counts each consumed request against the day', async () => {
    const clock = { value: new Date('2026-08-20T10:00:00Z') };
    const quota = quotaAt(clock, new MemoryCache());

    expect(await quota.remaining()).toBe(3);
    await quota.consume();
    await quota.consume();
    expect(await quota.remaining()).toBe(1);
  });

  it('blocks once the daily budget is spent, naming the limit and reset', async () => {
    const clock = { value: new Date('2026-08-20T10:00:00Z') };
    const quota = quotaAt(clock, new MemoryCache(), 2);

    await quota.consume();
    await quota.consume();

    await expect(quota.consume()).rejects.toMatchObject({
      code: 'quota_exhausted',
      message: expect.stringContaining('budget of 2 requests'),
    });
    await expect(quota.consume()).rejects.toMatchObject({
      remedy: expect.stringContaining('00:00 UTC'),
    });
  });

  it('never reports negative headroom', async () => {
    const clock = { value: new Date('2026-08-20T10:00:00Z') };
    const cache = new MemoryCache();
    const quota = quotaAt(clock, cache, 1);

    await quota.consume();
    await expect(quota.consume()).rejects.toThrow();

    expect(await quota.remaining()).toBe(0);
  });

  it('resets when the UTC day rolls over', async () => {
    const clock = { value: new Date('2026-08-20T23:59:00Z') };
    const cache = new MemoryCache();
    const quota = quotaAt(clock, cache, 1);

    await quota.consume();
    await expect(quota.consume()).rejects.toThrow();

    clock.value = new Date('2026-08-21T00:01:00Z');
    await expect(quota.consume()).resolves.toBeUndefined();
  });

  it('keeps separate budgets per credential', async () => {
    const clock = { value: new Date('2026-08-20T10:00:00Z') };
    const cache = new MemoryCache();
    const free = new DailyQuota({ cache, limit: 1, label: 'Perenual', scope: 'free', now: () => clock.value });
    const paid = new DailyQuota({ cache, limit: 1, label: 'Perenual', scope: 'paid', now: () => clock.value });

    await free.consume();

    await expect(paid.consume()).resolves.toBeUndefined();
  });

  it('still guards the budget in memory when caching is disabled', async () => {
    const clock = { value: new Date('2026-08-20T10:00:00Z') };
    const quota = quotaAt(clock, new NullCache(), 1);

    await quota.consume();

    // The cache is not retaining the counter, but the in-memory ledger still
    // holds the line for this process.
    await expect(quota.consume()).rejects.toMatchObject({ code: 'quota_exhausted' });
    expect(quota.persisted).toBe(false);
  });

  it('reports the counter as persisted when the cache retains it', async () => {
    const clock = { value: new Date('2026-08-20T10:00:00Z') };
    const quota = quotaAt(clock, new MemoryCache(), 2);

    await quota.consume();

    expect(quota.persisted).toBe(true);
  });
});
