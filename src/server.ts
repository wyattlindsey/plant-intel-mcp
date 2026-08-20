import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Builds the server and registers the tool surface. Tools whose upstream source
 * is unavailable are left unregistered rather than registered-and-failing, so a
 * client's tool list always reflects what actually works.
 */
export function createServer(): McpServer {
  return new McpServer({
    name: 'plant-intel',
    version: '0.1.0',
  });
}
