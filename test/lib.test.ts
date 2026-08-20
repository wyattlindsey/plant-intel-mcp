import { describe, expect, it } from 'vitest';

import { NullCache } from '../src/cache/cache.js';
import * as lib from '../src/lib.js';

/**
 * The package is consumed two ways: as a stdio binary, and as a library by a
 * host application that runs the server in-process. These assert the library
 * entry is safe to import -- the bin entry connects a transport at module
 * load, so it must never be the library entry.
 */
describe('library entry', () => {
  it('exposes the pieces a host needs to run the server in-process', () => {
    expect(lib.createServer).toBeTypeOf('function');
    expect(lib.createServices).toBeTypeOf('function');
    expect(lib.loadConfig).toBeTypeOf('function');
  });

  it('builds a server without connecting a transport', () => {
    const services = lib.createServices(lib.loadConfig({ PERENUAL_API_KEY: 'sk-test' }), {
      cache: new NullCache(),
    });

    const server = lib.createServer(services);

    expect(server).toBeDefined();
    // A server that had connected would already hold a transport.
    expect(server.isConnected()).toBe(false);
  });

  it('re-exports the domain types a host needs to render results', () => {
    expect(lib.SOURCE_REFS.perenual.name).toBe('Perenual Plant API');
  });

  it('exposes ToolError so a host can distinguish a tool failure', () => {
    expect(new lib.ToolError('not_found', 'x')).toBeInstanceOf(Error);
  });
});
