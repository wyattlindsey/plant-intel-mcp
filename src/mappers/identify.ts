import type { IdentifyCandidate, IdentifyResults } from '../domain/types.js';
import { SOURCE_REFS } from '../domain/types.js';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Maps Perenual's identification response. Written against the documented
 * shape rather than a recorded one: the endpoint is behind a beta waitlist, so
 * it has not been exercised live. Unknown fields are ignored rather than
 * assumed, and `notes` marks the result experimental.
 */
export function toIdentifyResults(raw: unknown): IdentifyResults {
  const envelope = (raw ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(envelope['results']) ? envelope['results'] : [];

  const candidates: IdentifyCandidate[] = rows
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      score: typeof row['score'] === 'number' ? row['score'] : 0,
      commonName: asString(row['name']),
      scientificName: asString(row['scientific_name']),
      detailsUrl: asString(row['details']),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    candidates,
    notes: [
      'identify_plant is experimental. Perenual gates this endpoint behind a beta waitlist, so ' +
        'its response shape is mapped from the published documentation rather than verified ' +
        'against live traffic. Treat candidates as suggestions and confirm with plant_details.',
    ],
    sources: [SOURCE_REFS.perenual],
  };
}
