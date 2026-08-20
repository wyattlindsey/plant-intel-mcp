import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { Services } from './services.js';
import { createServices } from './services.js';
import { registerCompanionCheck } from './tools/companion-check.js';
import { registerPlantDetails } from './tools/plant-details.js';
import { registerPlantingWindow } from './tools/planting-window.js';
import { registerSearchPlants } from './tools/search-plants.js';

/**
 * Builds the server and registers the tool surface.
 *
 * Registration distinguishes a misconfiguration from a capability gap:
 *
 * - A missing PERENUAL_API_KEY is a configuration mistake, so the tools are
 *   registered anyway and each call answers with the key to set and where to
 *   get one. Hiding them instead leaves the server with no tools at all, and
 *   `tools/list` then fails with a bare "Method not found" -- the least
 *   actionable thing a user could be handed.
 * - A genuinely absent capability, such as the beta-gated identification
 *   endpoint, stays unregistered so the tool list never advertises something
 *   this deployment cannot do.
 */
export function createServer(services: Services = createServices()): McpServer {
  const server = new McpServer({ name: 'plant-intel', version: '0.1.0' });

  registerSearchPlants(server, services);
  registerPlantDetails(server, services);
  registerPlantingWindow(server, services);
  registerCompanionCheck(server, services);

  return server;
}
