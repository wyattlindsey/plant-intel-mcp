import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { guarded } from '../errors.js';
import type { Services } from '../services.js';
import { jsonResult, lookupProfile, requirePerenual } from './shared.js';

const inputSchema = {
  plant: z
    .string()
    .min(1)
    .describe(
      'A species id from search_plants (e.g. "perenual:1852") or a name. An id is cheaper: ' +
        'a name costs an extra upstream request to resolve.',
    ),
};

export function registerPlantDetails(server: McpServer, services: Services): void {
  server.registerTool(
    'plant_details',
    {
      title: 'Plant care profile',
      description:
        'Full care profile for one species: sun, water, hardiness zones, mature height, ' +
        'edibility, toxicity to people and pets, and known pests. Fields the configured ' +
        'Perenual plan withholds are reported as null and named in `notes` rather than left ' +
        'silently absent.',
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      guarded(async () => {
        const client = requirePerenual(services.perenual);
        return jsonResult(await lookupProfile(client, args.plant));
      }),
  );
}
