import type { Cache } from '../cache/cache.js';
import { ToolError } from '../errors.js';

export interface DailyQuotaOptions {
  cache: Cache;
  /** Requests permitted per UTC day. Perenual's free tier allows 100. */
  limit: number;
  /** Source name used in the error message, e.g. "Perenual". */
  label: string;
  /** Credential fingerprint, so two keys keep separate budgets. */
  scope: string;
  now?: () => Date;
}

interface Ledger {
  date: string;
  count: number;
}

/** Two days, so an entry survives until well past the reset it describes. */
const LEDGER_TTL_MS = 48 * 60 * 60 * 1000;

function utcDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function hoursUntilReset(at: Date): string {
  const reset = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1);
  const minutes = Math.max(0, Math.round((reset - at.getTime()) / 60_000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Counts outbound requests against a per-UTC-day budget so the server stops
 * before an upstream free tier starts rejecting it.
 *
 * The counter lives in the cache. With caching disabled there is nowhere to
 * keep it, so the guard degrades to permissive rather than blocking every call
 * after the first -- `tracked` reports which mode is in effect.
 */
export class DailyQuota {
  readonly #cache: Cache;
  readonly #limit: number;
  readonly #label: string;
  readonly #scope: string;
  readonly #now: () => Date;
  #tracked = true;

  constructor(options: DailyQuotaOptions) {
    this.#cache = options.cache;
    this.#limit = options.limit;
    this.#label = options.label;
    this.#scope = options.scope;
    this.#now = options.now ?? (() => new Date());
  }

  /** False once a write has proven the counter is not being retained. */
  get tracked(): boolean {
    return this.#tracked;
  }

  async remaining(): Promise<number> {
    const ledger = await this.#read();
    return Math.max(0, this.#limit - ledger.count);
  }

  /** Records one request, or throws if today's budget is already spent. */
  async consume(): Promise<void> {
    const at = this.#now();
    const ledger = await this.#read();

    if (ledger.count >= this.#limit) {
      throw new ToolError(
        'quota_exhausted',
        `${this.#label}'s daily budget of ${this.#limit} requests is spent for today.`,
        {
          remedy:
            `The budget resets at 00:00 UTC, in ${hoursUntilReset(at)}. ` +
            'Cached results are still served in the meantime; a paid plan raises the ceiling.',
        },
      );
    }

    const next: Ledger = { date: utcDate(at), count: ledger.count + 1 };
    await this.#cache.set(this.#key(at), next, LEDGER_TTL_MS);

    if ((await this.#cache.get<Ledger>(this.#key(at))) === undefined) {
      this.#tracked = false;
    }
  }

  #key(at: Date): string {
    return `quota|${this.#scope}|${utcDate(at)}`;
  }

  async #read(): Promise<Ledger> {
    const at = this.#now();
    const stored = await this.#cache.get<Ledger>(this.#key(at));
    return stored?.date === utcDate(at) ? stored : { date: utcDate(at), count: 0 };
  }
}
