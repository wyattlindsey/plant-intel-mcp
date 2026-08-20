import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Cache } from './cache.js';

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface JsonFileCacheOptions {
  dir: string;
  /** Injected so tests can advance time without touching the system clock. */
  now?: () => number;
}

/**
 * A flat JSON-file cache: one file per entry, named by a hash of the key.
 *
 * Flat files rather than sqlite so the published package needs no native
 * compilation and `npx plant-intel-mcp` works on any machine. Plant data
 * barely changes, so the access pattern is overwhelmingly read-hit.
 */
export class JsonFileCache implements Cache {
  readonly #dir: string;
  readonly #now: () => number;

  constructor(options: JsonFileCacheOptions) {
    this.#dir = options.dir;
    this.#now = options.now ?? (() => Date.now());
  }

  async get<T>(key: string): Promise<T | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.#pathFor(key), 'utf8');
    } catch {
      return undefined;
    }

    let entry: CacheEntry<T>;
    try {
      entry = JSON.parse(raw) as CacheEntry<T>;
    } catch {
      // A truncated or hand-edited file is a miss, never a crash.
      return undefined;
    }

    if (typeof entry?.expiresAt !== 'number' || entry.expiresAt < this.#now()) {
      return undefined;
    }

    return entry.value;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const entry: CacheEntry<T> = { expiresAt: this.#now() + ttlMs, value };

    try {
      await mkdir(this.#dir, { recursive: true });
      await writeFile(this.#pathFor(key), JSON.stringify(entry), 'utf8');
    } catch {
      // A cache that cannot write is slow, not broken. Never fail a tool call
      // because the disk is read-only or full.
    }
  }

  #pathFor(key: string): string {
    return join(this.#dir, `${createHash('sha256').update(key).digest('hex')}.json`);
  }
}
