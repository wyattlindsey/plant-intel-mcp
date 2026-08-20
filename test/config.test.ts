import { describe, expect, it } from 'vitest';

import { fingerprint, loadConfig } from '../src/config.js';

describe('fingerprint', () => {
  it('is stable for the same secret', () => {
    expect(fingerprint('abc123')).toBe(fingerprint('abc123'));
  });

  it('differs between secrets, so cache entries stay partitioned', () => {
    expect(fingerprint('free-key')).not.toBe(fingerprint('paid-key'));
  });

  it('does not reveal the secret', () => {
    expect(fingerprint('sk-super-secret')).not.toContain('secret');
  });
});

describe('loadConfig', () => {
  it('reads the Perenual key and derives a cache scope from it', () => {
    const config = loadConfig({ PERENUAL_API_KEY: 'sk-test' });

    expect(config.perenual?.apiKey).toBe('sk-test');
    expect(config.perenual?.scope).toBe(fingerprint('sk-test'));
  });

  it('reports Perenual as absent rather than throwing, so the server still starts', () => {
    expect(loadConfig({}).perenual).toBeNull();
  });

  it('treats a blank or whitespace key as absent', () => {
    expect(loadConfig({ PERENUAL_API_KEY: '   ' }).perenual).toBeNull();
  });

  it('enables Permapeople only when both halves of the credential are present', () => {
    expect(loadConfig({ PERMAPEOPLE_KEY_ID: 'id' }).permapeople).toBeNull();
    expect(loadConfig({ PERMAPEOPLE_KEY_SECRET: 'secret' }).permapeople).toBeNull();
    expect(
      loadConfig({ PERMAPEOPLE_KEY_ID: 'id', PERMAPEOPLE_KEY_SECRET: 'secret' }).permapeople,
    ).toEqual({ keyId: 'id', keySecret: 'secret' });
  });

  it('leaves the identify beta off unless explicitly enabled', () => {
    expect(loadConfig({}).identifyBeta).toBe(false);
    expect(loadConfig({ PERENUAL_IDENTIFY_BETA: '0' }).identifyBeta).toBe(false);
    expect(loadConfig({ PERENUAL_IDENTIFY_BETA: 'false' }).identifyBeta).toBe(false);
    expect(loadConfig({ PERENUAL_IDENTIFY_BETA: '1' }).identifyBeta).toBe(true);
    expect(loadConfig({ PERENUAL_IDENTIFY_BETA: 'true' }).identifyBeta).toBe(true);
  });

  it('honours an explicit cache directory', () => {
    expect(loadConfig({ PLANT_INTEL_CACHE_DIR: '/tmp/pi' }).cacheDir).toBe('/tmp/pi');
  });

  it('disables the cache when asked, reporting a null directory', () => {
    expect(loadConfig({ PLANT_INTEL_CACHE_DISABLED: '1' }).cacheDir).toBeNull();
  });

  it('defaults the cache under XDG_CACHE_HOME when one is set', () => {
    expect(loadConfig({ XDG_CACHE_HOME: '/xdg' }).cacheDir).toBe('/xdg/plant-intel-mcp');
  });
});
