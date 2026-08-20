import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { NullCache } from '../../src/cache/cache.js';
import type { Cache } from '../../src/cache/cache.js';
import type { Config } from '../../src/config.js';
import { loadConfig } from '../../src/config.js';
import { createServer } from '../../src/server.js';
import type { FetchLike } from '../../src/sources/http.js';
import { createServices } from '../../src/services.js';

export interface HarnessOptions {
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
  cache?: Cache;
}

export interface Harness {
  client: Client;
  config: Config;
  close: () => Promise<void>;
}

/** Boots the real server behind a real MCP client over an in-memory transport. */
export async function startHarness(options: HarnessOptions = {}): Promise<Harness> {
  const config = loadConfig({
    PERENUAL_API_KEY: 'sk-test',
    PLANT_INTEL_CACHE_DISABLED: '1',
    ...options.env,
  });

  const services = createServices(config, {
    cache: options.cache ?? new NullCache(),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  const server = createServer(services);
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    config,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** Extracts the JSON body a tool returned. */
export function jsonBody(result: unknown): unknown {
  return JSON.parse(textBody(result)) as unknown;
}

export function textBody(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.find((entry) => entry.type === 'text')?.text ?? '';
}
