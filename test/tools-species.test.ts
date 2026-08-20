import { describe, expect, it, vi } from 'vitest';

import freeDetails from './fixtures/perenual-species-details-free.json' with { type: 'json' };
import speciesList from './fixtures/perenual-species-list.json' with { type: 'json' };
import { jsonBody, startHarness, textBody } from './helpers/harness.js';

function routedFetch(routes: Array<[RegExp, unknown]>) {
  return vi.fn(async (url: string) => {
    for (const [pattern, body] of routes) {
      if (pattern.test(url)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

describe('tool registration', () => {
  it('exposes the species tools when a Perenual key is configured', async () => {
    const harness = await startHarness();
    const { tools } = await harness.client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['search_plants', 'plant_details']),
    );
    await harness.close();
  });

  it('still lists the tools without a key, so the tool list itself never breaks', async () => {
    const harness = await startHarness({ env: { PERENUAL_API_KEY: undefined } });
    const { tools } = await harness.client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['search_plants', 'plant_details']),
    );
    await harness.close();
  });

  it('answers a call made without a key by naming the key and where to get one', async () => {
    const harness = await startHarness({ env: { PERENUAL_API_KEY: undefined } });

    const result = await harness.client.callTool({
      name: 'search_plants',
      arguments: { query: 'tomato' },
    });

    expect(result.isError).toBe(true);
    expect(textBody(result)).toContain('PERENUAL_API_KEY');
    expect(textBody(result)).toContain('https://perenual.com/docs/api');
    await harness.close();
  });
});

describe('search_plants', () => {
  it('returns summaries with usable ids', async () => {
    const harness = await startHarness({
      fetch: routedFetch([[/species-list/, speciesList]]),
    });

    const body = jsonBody(
      await harness.client.callTool({ name: 'search_plants', arguments: { query: 'tomato' } }),
    ) as { results: Array<{ id: string; commonName: string }>; totalPages: number };

    expect(body.totalPages).toBe(405);
    expect(body.results[1]).toMatchObject({ id: 'perenual:1852', commonName: 'Garden Tomato' });
    await harness.close();
  });

  it('explains an empty result set instead of returning a bare empty list', async () => {
    const harness = await startHarness({
      fetch: routedFetch([[/species-list/, { data: [], current_page: 1, last_page: 1 }]]),
    });

    const body = jsonBody(
      await harness.client.callTool({ name: 'search_plants', arguments: { query: 'zzzz' } }),
    ) as { results: unknown[]; notes: string[] };

    expect(body.results).toEqual([]);
    expect(body.notes.join(' ')).toMatch(/1-3000/);
    await harness.close();
  });
});

describe('plant_details', () => {
  it('resolves an id directly, without a search request', async () => {
    const fetchFn = routedFetch([[/species\/details/, freeDetails]]);
    const harness = await startHarness({ fetch: fetchFn });

    const body = jsonBody(
      await harness.client.callTool({
        name: 'plant_details',
        arguments: { plant: 'perenual:1852' },
      }),
    ) as { commonName: string; hardiness: { min: number } };

    expect(body.commonName).toBe('Garden Tomato');
    expect(body.hardiness.min).toBe(10);
    expect(fetchFn).toHaveBeenCalledOnce();
    await harness.close();
  });

  it('resolves a name by searching first', async () => {
    const fetchFn = routedFetch([
      [/species-list/, speciesList],
      [/species\/details/, freeDetails],
    ]);
    const harness = await startHarness({ fetch: fetchFn });

    const body = jsonBody(
      await harness.client.callTool({
        name: 'plant_details',
        arguments: { plant: 'Garden Tomato' },
      }),
    ) as { id: string };

    expect(body.id).toBe('perenual:1852');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await harness.close();
  });

  it('never puts tier upgrade copy into the response', async () => {
    const harness = await startHarness({
      fetch: routedFetch([[/species\/details/, freeDetails]]),
    });

    const text = textBody(
      await harness.client.callTool({
        name: 'plant_details',
        arguments: { plant: 'perenual:1852' },
      }),
    );

    expect(text).not.toContain('Upgrade Plans');
    expect(text).not.toContain('subscription-api-pricing');
    expect(text).toMatch(/withheld/i);
    await harness.close();
  });

  it('returns a remedy, not a stack trace, when nothing matches', async () => {
    const harness = await startHarness({
      fetch: routedFetch([[/species-list/, { data: [], current_page: 1, last_page: 1 }]]),
    });

    const result = await harness.client.callTool({
      name: 'plant_details',
      arguments: { plant: 'nonexistent-plant' },
    });

    expect(result.isError).toBe(true);
    expect(textBody(result)).toMatch(/Remedy:/);
    expect(textBody(result)).not.toMatch(/\n\s+at /);
    await harness.close();
  });
});
