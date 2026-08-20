import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { judgeCompanions } from '../domain/companions.js';
import type { CompanionVerdict, PlantProfile } from '../domain/types.js';
import { guarded, ToolError } from '../errors.js';
import type { Services } from '../services.js';
import type { PermapeopleClient } from '../sources/permapeople.js';
import { jsonResult, lookupProfile, requirePerenual } from './shared.js';

const inputSchema = {
  plant_a: z.string().min(1).describe('A species id from search_plants, or a name.'),
  plant_b: z.string().min(1).describe('The plant to check against plant_a.'),
};

/**
 * Asks Permapeople whether the pair is listed. A failure here degrades the
 * answer rather than failing the call: the derived mechanisms still apply, and
 * the caveat says the listing was not checked.
 */
async function listedCompanion(
  client: PermapeopleClient,
  a: PlantProfile,
  b: PlantProfile,
): Promise<{ listed: boolean | null; caveat: string | null }> {
  try {
    const [matchA, matchB] = await Promise.all([
      client.resolve(a.scientificName, a.commonName),
      client.resolve(b.scientificName, b.commonName),
    ]);

    if (matchA === null || matchB === null) {
      return {
        listed: null,
        caveat:
          'Permapeople had no record for at least one of these plants, so its companion ' +
          'listings could not be checked.',
      };
    }

    return { listed: await client.areCompanions(matchA, matchB), caveat: null };
  } catch {
    return {
      listed: null,
      caveat: 'Permapeople could not be reached, so its companion listings were not checked.',
    };
  }
}

export function registerCompanionCheck(server: McpServer, services: Services): void {
  server.registerTool(
    'companion_check',
    {
      title: 'Companion check',
      description:
        'Whether two plants should share a bed, with the mechanism behind the answer. ' +
        'A "bad" verdict is derived from shared botanical family (rotation and soilborne ' +
        'disease) or overlapping pest susceptibility, never from folklore. A "good" verdict ' +
        'comes from a documented Permapeople listing when that source is configured. Every ' +
        'matched reason is returned, including any the verdict overrode.',
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      guarded(async () => {
        const client = requirePerenual(services.perenual);

        const [a, b] = await Promise.all([
          lookupProfile(client, args.plant_a),
          lookupProfile(client, args.plant_b),
        ]);

        if (a.id === b.id) {
          throw new ToolError(
            'invalid_input',
            `Both arguments resolved to the same species (${a.id}).`,
            { remedy: 'Pass two different plants.' },
          );
        }

        const permapeople =
          services.permapeople === null
            ? { listed: null, caveat: null }
            : await listedCompanion(services.permapeople, a, b);

        const verdict: CompanionVerdict = judgeCompanions({
          a,
          b,
          listedCompanion: permapeople.listed,
        });

        if (permapeople.caveat !== null) {
          verdict.caveats.push(permapeople.caveat);
        }

        return jsonResult(verdict);
      }),
  );
}
