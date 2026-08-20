import type { PlantSummary } from '../domain/types.js';

/**
 * Reads a Perenual species id from `perenual:1852` or `1852`. Returns null for
 * anything else -- including another source's namespace, which must not be
 * mistaken for a Perenual id that happens to share the number.
 */
export function parsePlantId(input: string): number | null {
  const text = input.trim();
  const bare = text.startsWith('perenual:') ? text.slice('perenual:'.length) : text;

  if (!/^\d+$/.test(bare)) {
    return null;
  }

  const id = Number.parseInt(bare, 10);
  return id > 0 ? id : null;
}

function normalise(value: string | null): string {
  return value?.trim().toLowerCase() ?? '';
}

/**
 * Chooses the result a person meant. An exact name match beats Perenual's own
 * ranking, which sorts "Tomatillo" above "Garden Tomato" for the query
 * "Garden Tomato".
 */
export function pickBestMatch(results: PlantSummary[], query: string): PlantSummary | null {
  if (results.length === 0) {
    return null;
  }

  const wanted = normalise(query);

  return (
    results.find((result) => normalise(result.commonName) === wanted) ??
    results.find((result) => normalise(result.scientificName) === wanted) ??
    results.find((result) => result.otherNames.some((name) => normalise(name) === wanted)) ??
    results[0] ??
    null
  );
}
