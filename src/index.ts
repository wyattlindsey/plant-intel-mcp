#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  // stdout carries the MCP protocol; diagnostics must go to stderr.
  console.error('plant-intel failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
