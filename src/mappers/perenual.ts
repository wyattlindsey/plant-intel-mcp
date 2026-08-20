import type {
  Cycle,
  PlantProfile,
  PlantSummary,
  SearchResults,
  Sunlight,
  Watering,
  ZoneRange,
} from '../domain/types.js';
import { SOURCE_REFS } from '../domain/types.js';

/**
 * Perenual's free tier substitutes an upgrade prompt into fields it withholds,
 * so a naive mapper puts marketing copy where a model expects horticultural
 * data. The exact wording is not published and has changed before, so this
 * matches a family of prompts rather than one literal string.
 */
const TIER_GATE_PATTERNS: RegExp[] = [
  /upgrade\s+plans?/i,
  /subscription-api-pricing/i,
  /login\s+required/i,
  /\bsupreme\s+user\b/i,
  /premium\/supreme/i,
];

export function isTierGated(value: unknown): boolean {
  return typeof value === 'string' && TIER_GATE_PATTERNS.some((pattern) => pattern.test(value));
}

/** The docs print gated keys with a ` [Supreme User]` suffix; normalise it away. */
function normaliseKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    result[key.replace(/\s*\[[^\]]*\]\s*$/, '')] = value;
  }
  return result;
}

/** Reads a field, treating a tier-gated placeholder as absent. */
function field(raw: Record<string, unknown>, name: string): unknown {
  const value = raw[name];
  return isTierGated(value) ? undefined : value;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    return isTierGated(value) ? [] : [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && !isTierGated(entry));
}

/** Perenual returns 0/1, true/false, or occasionally a word. */
function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === 'yes') return true;
    if (text === 'false' || text === 'no' || text === 'none') return false;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export interface SunlightResult {
  values: Sunlight[];
  /** Values Perenual returned that this mapper could not classify. */
  unrecognised: string[];
}

/** Perenual's sunlight strings are freeform ("sun-part shade", "filtered shade"). */
export function toSunlight(raw: unknown): SunlightResult {
  const values: Sunlight[] = [];
  const unrecognised: string[] = [];

  for (const entry of asStringArray(raw)) {
    const text = entry.toLowerCase().replace(/[/_-]/g, ' ');
    const matched: Sunlight[] = [];

    if (text.includes('full sun')) matched.push('full-sun');
    if (text.includes('part sun') || text.includes('partial sun')) matched.push('part-sun');
    if (text.includes('part shade') || text.includes('partial shade') || text.includes('filtered')) {
      matched.push('part-shade');
    }
    if (text.includes('full shade') || text.includes('deep shade')) matched.push('full-shade');

    if (matched.length === 0) {
      unrecognised.push(entry);
      continue;
    }
    for (const value of matched) {
      if (!values.includes(value)) values.push(value);
    }
  }

  return { values, unrecognised };
}

const CM_PER_UNIT: Record<string, number> = {
  cm: 1,
  centimeters: 1,
  centimetres: 1,
  inch: 2.54,
  inches: 2.54,
  feet: 30.48,
  foot: 30.48,
  ft: 30.48,
  m: 100,
  meters: 100,
  metres: 100,
};

/**
 * Converts Perenual's dimensions block to centimetres, preferring the upper
 * bound -- a mature-size field should describe the plant at full size.
 * An unrecognised unit yields null rather than a number in the wrong scale.
 */
export function toDimensionCm(raw: unknown): number | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const block = raw as Record<string, unknown>;
  const unit = asString(block['unit'])?.toLowerCase();
  const factor = unit === undefined ? undefined : CM_PER_UNIT[unit];
  if (factor === undefined) {
    return null;
  }

  const value = asNumber(block['max_value']) ?? asNumber(block['min_value']);
  return value === null ? null : Math.round(value * factor);
}

function toCycle(raw: unknown): Cycle | null {
  const text = asString(raw)?.toLowerCase();
  if (text === undefined || text === null) return null;
  if (text.startsWith('peren')) return 'perennial';
  if (text.startsWith('annual')) return 'annual';
  // Perenual uses "biannual" and "biennial" interchangeably for the same cycle.
  if (text.startsWith('bien') || text.startsWith('bian')) return 'biennial';
  return null;
}

function toWatering(raw: unknown): Watering | null {
  const text = asString(raw)?.toLowerCase();
  return text === 'frequent' || text === 'average' || text === 'minimum' || text === 'none'
    ? text
    : null;
}

function toZoneRange(raw: unknown): ZoneRange | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const block = raw as Record<string, unknown>;
  const min = asNumber(block['min']);
  const max = asNumber(block['max']);
  return min === null || max === null ? null : { min, max };
}

/** Perenual returns scientific_name as an array; callers want one name. */
function toScientificName(raw: unknown): string | null {
  const names = asStringArray(raw);
  return names[0] ?? asString(raw);
}

function toSummary(raw: Record<string, unknown>): PlantSummary {
  const record = normaliseKeys(raw);

  return {
    id: `perenual:${String(record['id'] ?? 'unknown')}`,
    commonName: asString(field(record, 'common_name')),
    scientificName: toScientificName(field(record, 'scientific_name')),
    otherNames: asStringArray(field(record, 'other_name')),
    family: asString(field(record, 'family')),
    cycle: toCycle(field(record, 'cycle')),
    sources: [SOURCE_REFS.perenual],
  };
}

export function toSearchResults(raw: unknown, query: string): SearchResults {
  const envelope = (raw ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(envelope['data']) ? envelope['data'] : [];

  return {
    query,
    page: asNumber(envelope['current_page']) ?? 1,
    totalPages: asNumber(envelope['last_page']) ?? 1,
    results: rows
      .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
      .map(toSummary),
    notes: [],
    sources: [SOURCE_REFS.perenual],
  };
}

/** Fields whose absence is worth naming, because a caller may plan around them. */
const NOTABLE_FIELDS = [
  'pest_susceptibility',
  'care_level',
  'growth_rate',
  'watering',
  'sunlight',
  'hardiness',
  'description',
] as const;

export function toPlantProfile(raw: unknown): PlantProfile {
  const record = normaliseKeys((raw ?? {}) as Record<string, unknown>);
  const summary = toSummary(record);
  const sun = toSunlight(field(record, 'sunlight'));

  const withheld = NOTABLE_FIELDS.filter((name) => isTierGated(record[name]));
  const notes: string[] = [];

  if (withheld.length > 0) {
    notes.push(
      `The Perenual plan in use withheld these fields, reported here as null: ${withheld.join(', ')}. ` +
        'A paid Perenual plan returns them.',
    );
  }
  if (sun.unrecognised.length > 0) {
    notes.push(`Unclassified sunlight values from Perenual: ${sun.unrecognised.join(', ')}.`);
  }
  // Stated on every profile: a null here means "not published anywhere this
  // server reads", which a caller must not read as "no spacing required".
  notes.push(
    'Planting spacing is not published by Perenual, so spacingCm is null. ' +
      'Supply it from your own crop data when planning density.',
  );

  return {
    ...summary,
    sun: sun.values,
    watering: toWatering(field(record, 'watering')),
    hardiness: toZoneRange(field(record, 'hardiness')),
    matureHeightCm: toDimensionCm(field(record, 'dimensions')),
    spacingCm: null,
    edible: {
      fruit: asBoolean(field(record, 'edible_fruit')),
      leaf: asBoolean(field(record, 'edible_leaf')),
    },
    toxicity: {
      humans: asBoolean(field(record, 'poisonous_to_humans')),
      pets: asBoolean(field(record, 'poisonous_to_pets')),
    },
    pests: asStringArray(field(record, 'pest_susceptibility')),
    careLevel: asString(field(record, 'care_level')),
    growthRate: asString(field(record, 'growth_rate')),
    droughtTolerant: asBoolean(field(record, 'drought_tolerant')),
    indoor: asBoolean(field(record, 'indoor')),
    description: asString(field(record, 'description')),
    notes,
  };
}
