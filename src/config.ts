import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface PerenualConfig {
  apiKey: string;
  /** Cache partition derived from the key -- see cacheKey's scope option. */
  scope: string;
}

export interface PermapeopleConfig {
  keyId: string;
  keySecret: string;
}

export interface Config {
  perenual: PerenualConfig | null;
  permapeople: PermapeopleConfig | null;
  identifyBeta: boolean;
  /** Null means caching is disabled. */
  cacheDir: string | null;
}

export type Env = Record<string, string | undefined>;

/** A short, non-reversible tag for a credential. Never log the credential itself. */
export function fingerprint(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 12);
}

function trimmed(value: string | undefined): string | null {
  const result = value?.trim();
  return result === undefined || result === '' ? null : result;
}

function enabled(value: string | undefined): boolean {
  const flag = trimmed(value)?.toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function defaultCacheDir(env: Env): string {
  const xdg = trimmed(env['XDG_CACHE_HOME']);
  return xdg === null
    ? join(homedir(), '.cache', 'plant-intel-mcp')
    : join(xdg, 'plant-intel-mcp');
}

/**
 * Reads configuration without throwing. A missing credential disables the
 * source it belongs to rather than stopping the server, so a caller always
 * sees a tool list reflecting what actually works.
 */
export function loadConfig(env: Env = process.env): Config {
  const perenualKey = trimmed(env['PERENUAL_API_KEY']);
  const keyId = trimmed(env['PERMAPEOPLE_KEY_ID']);
  const keySecret = trimmed(env['PERMAPEOPLE_KEY_SECRET']);

  return {
    perenual:
      perenualKey === null ? null : { apiKey: perenualKey, scope: fingerprint(perenualKey) },
    permapeople: keyId === null || keySecret === null ? null : { keyId, keySecret },
    identifyBeta: enabled(env['PERENUAL_IDENTIFY_BETA']),
    cacheDir: enabled(env['PLANT_INTEL_CACHE_DISABLED'])
      ? null
      : (trimmed(env['PLANT_INTEL_CACHE_DIR']) ?? defaultCacheDir(env)),
  };
}
