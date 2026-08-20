/**
 * Library entry point.
 *
 * The package ships two entries: `dist/index.js` is the stdio binary, which
 * connects a transport at module load, and this one, which has no side effects.
 * A host application that runs the server in-process -- over an in-memory
 * transport, say -- must import from here.
 */

export { createServer } from './server.js';
export { createServices } from './services.js';
export type { Services, ServiceOverrides } from './services.js';

export { loadConfig, fingerprint } from './config.js';
export type { Config, Env, PerenualConfig, PermapeopleConfig } from './config.js';

export { ToolError, toToolResult, guarded } from './errors.js';
export type { ToolErrorCode, ToolResult } from './errors.js';

export { NullCache, cacheKey } from './cache/cache.js';
export type { Cache, CacheParams } from './cache/cache.js';
export { JsonFileCache } from './cache/json-file-cache.js';

export { SOURCE_REFS } from './domain/types.js';
export type {
  CompanionMechanism,
  CompanionReason,
  CompanionVerdict,
  Confidence,
  Cycle,
  FrostEstimate,
  IdentifyCandidate,
  IdentifyResults,
  MonthDay,
  PlantId,
  PlantProfile,
  PlantRef,
  PlantSummary,
  PlantingSchedule,
  PlantingWindow,
  SearchResults,
  SourceId,
  SourceRef,
  Sunlight,
  Verdict,
  Watering,
  ZoneAssessment,
  ZoneRange,
} from './domain/types.js';
