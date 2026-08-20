import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { guarded } from '../errors.js';
import { toSearchResults } from '../mappers/perenual.js';
import type { Services } from '../services.js';
import { jsonResult, requirePerenual } from './shared.js';

const inputSchema = {
  query: z.string().min(1).describe('Common or scientific name, e.g. "tomato" or "Solanum".'),
  page: z.number().int().positive().optional().describe('1-based page of results. Defaults to 1.'),
  edible: z.boolean().optional().describe('Restrict to species with edible parts.'),
  indoor: z.boolean().optional().describe('Restrict to species suited to indoor growing.'),
  cycle: z
    .enum(['perennial', 'annual', 'biennial'])
    .optional()
    .describe('Restrict to a life cycle.'),
};

export function registerSearchPlants(server: McpServer, services: Services): void {
  server.registerTool(
    'search_plants',
    {
      title: 'Search plants',
      description:
        'Search the Perenual species catalogue by name and return candidate species with ids. ' +
        'Use the returned id with plant_details, companion_check, or planting_window rather than ' +
        'passing a name again -- resolving a name costs an extra upstream request.',
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      guarded(async () => {
        const client = requirePerenual(services.perenual);
        const raw = await client.searchSpecies(args.query, {
          ...(args.page === undefined ? {} : { page: args.page }),
          ...(args.edible === undefined ? {} : { edible: args.edible }),
          ...(args.indoor === undefined ? {} : { indoor: args.indoor }),
          ...(args.cycle === undefined ? {} : { cycle: args.cycle }),
        });

        const results = toSearchResults(raw, args.query);
        if (results.results.length === 0) {
          results.notes.push(
            `No species matched "${args.query}". Perenual's free tier indexes species 1-3000; ` +
              'a paid plan covers the full catalogue.',
          );
        }

        return jsonResult(results);
      }),
  );
}
