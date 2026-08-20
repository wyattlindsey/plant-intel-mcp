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
 * The counter is kept in two places: the cache, so the budget survives a
 * restart, and memory, so it still holds when caching is disabled. Whichever
 * count is higher wins. `persisted` reports whether the cache is retaining it;
 * when it is not, the budget resets with the process rather than silently
 * ceasing to guard anything.
 */
export class DailyQuota {
  readonly #cache: Cache;
  readonly #limit: number;
  readonly #label: string;
  readonly #scope: string;
  readonly #now: () => Date;
  #memory: Ledger | null = null;
  #persisted = true;

  constructor(options: DailyQuotaOptions) {
    this.#cache = options.cache;
    this.#limit = options.limit;
    this.#label = options.label;
    this.#scope = options.scope;
    this.#now = options.now ?? (() => new Date());
  }

  /** False once a write has proven the cache is not retaining the counter. */
  get persisted(): boolean {
    return this.#persisted;
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
    this.#memory = next;
    await this.#cache.set(this.#key(at), next, LEDGER_TTL_MS);

    if ((await this.#cache.get<Ledger>(this.#key(at))) === undefined) {
      this.#persisted = false;
    }
  }

  #key(at: Date): string {
    return `quota|${this.#scope}|${utcDate(at)}`;
  }

  async #read(): Promise<Ledger> {
    const today = utcDate(this.#now());
    const stored = await this.#cache.get<Ledger>(this.#key(this.#now()));

    const counts = [stored, this.#memory]
      .filter((ledger): ledger is Ledger => ledger?.date === today)
      .map((ledger) => ledger.count);

    return { date: today, count: counts.length === 0 ? 0 : Math.max(...counts) };
  }
}
