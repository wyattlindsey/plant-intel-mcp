import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The live smoke suite is opt-in; it burns real free-tier quota.
    exclude: process.env.PLANT_INTEL_LIVE ? [] : ['test/live/**'],
    env: { PLANT_INTEL_CACHE_DISABLED: '1' },
  },
});
