import type { ToolResult } from '../errors.js';
import { ToolError } from '../errors.js';
import type { PlantProfile, PlantRef } from '../domain/types.js';
import { toPlantProfile, toSearchResults } from '../mappers/perenual.js';
import type { PerenualClient } from '../sources/perenual.js';
import { parsePlantId, pickBestMatch } from '../sources/resolve.js';

/** Renders a payload as the JSON body of a successful tool result. */
export function jsonResult(payload: unknown): ToolResult {
  return { isError: false, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

export function requirePerenual(client: PerenualClient | null): PerenualClient {
  if (client === null) {
    throw new ToolError('missing_credentials', 'PERENUAL_API_KEY is not set.', {
      remedy:
        'Get a free key at https://perenual.com/docs/api and add it to the env block of your ' +
        'plant-intel MCP server config.',
    });
  }
  return client;
}

/**
 * Resolves an id or a name to a full profile.
 *
 * A name costs two upstream requests -- one to search, one for details -- which
 * matters against a 100/day free tier, so callers holding an id should pass it.
 */
export async function lookupProfile(
  client: PerenualClient,
  reference: string,
): Promise<PlantProfile> {
  const directId = parsePlantId(reference);
  if (directId !== null) {
    return toPlantProfile(await client.speciesDetails(directId));
  }

  const results = toSearchResults(await client.searchSpecies(reference), reference);
  const match = pickBestMatch(results.results, reference);

  if (match === null) {
    throw new ToolError('not_found', `Perenual has no species matching "${reference}".`, {
      remedy: 'Try a different spelling, a scientific name, or a broader search_plants query.',
    });
  }

  const id = parsePlantId(match.id);
  if (id === null) {
    throw new ToolError('upstream_error', `Perenual returned an unusable id for "${reference}".`);
  }

  return toPlantProfile(await client.speciesDetails(id));
}

export function toRef(profile: PlantProfile): PlantRef {
  return { id: profile.id, name: profile.commonName ?? profile.scientificName ?? profile.id };
}
