import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { guarded } from '../errors.js';
import { toIdentifyResults } from '../mappers/identify.js';
import type { Services } from '../services.js';
import { jsonResult, requirePerenual } from './shared.js';

const inputSchema = {
  image_urls: z
    .array(z.string().url())
    .min(1)
    .max(5)
    .describe('Publicly reachable image URLs of the plant to identify.'),
};

export function registerIdentifyPlant(server: McpServer, services: Services): void {
  server.registerTool(
    'identify_plant',
    {
      title: 'Identify plant from image (experimental)',
      description:
        'EXPERIMENTAL. Identify a plant from one or more image URLs, returning ranked ' +
        'candidates with confidence scores. Perenual gates this endpoint behind a beta ' +
        'waitlist, so the response mapping follows published documentation rather than ' +
        'verified live traffic. Confirm any candidate with plant_details before relying on it.',
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      guarded(async () => {
        const client = requirePerenual(services.perenual);
        return jsonResult(toIdentifyResults(await client.identify(args.image_urls)));
      }),
  );
}
