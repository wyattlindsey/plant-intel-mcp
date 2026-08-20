import { describe, expect, it, vi } from 'vitest';

import { toIdentifyResults } from '../src/mappers/identify.js';
import { jsonBody, startHarness } from './helpers/harness.js';

const RESPONSE = {
  count: 2,
  results: [
    {
      score: 0.42,
      name: 'Sweet Basil',
      scientific_name: 'Ocimum basilicum',
      details: 'https://perenual.com/api/v2/species/details/300',
    },
    {
      score: 0.91,
      name: 'Garden Tomato',
      scientific_name: 'Solanum lycopersicum',
      details: 'https://perenual.com/api/v2/species/details/1852',
    },
  ],
};

describe('toIdentifyResults', () => {
  it('ranks candidates by score, strongest first', () => {
    const results = toIdentifyResults(RESPONSE);

    expect(results.candidates.map((candidate) => candidate.commonName)).toEqual([
      'Garden Tomato',
      'Sweet Basil',
    ]);
  });

  it('carries the score and details link through', () => {
    expect(toIdentifyResults(RESPONSE).candidates[0]).toEqual({
      score: 0.91,
      commonName: 'Garden Tomato',
      scientificName: 'Solanum lycopersicum',
      detailsUrl: 'https://perenual.com/api/v2/species/details/1852',
    });
  });

  it('marks every result experimental and unverified against live traffic', () => {
    expect(toIdentifyResults(RESPONSE).notes.join(' ')).toMatch(/experimental/i);
    expect(toIdentifyResults(RESPONSE).notes.join(' ')).toMatch(/beta waitlist/);
  });

  it('returns an empty candidate list rather than throwing on an empty body', () => {
    expect(toIdentifyResults({}).candidates).toEqual([]);
    expect(toIdentifyResults(null).candidates).toEqual([]);
  });
});

describe('identify_plant registration', () => {
  it('stays hidden unless the beta flag is set', async () => {
    const harness = await startHarness();
    const { tools } = await harness.client.listTools();

    expect(tools.map((tool) => tool.name)).not.toContain('identify_plant');
    await harness.close();
  });

  it('appears when the beta flag is set', async () => {
    const harness = await startHarness({ env: { PERENUAL_IDENTIFY_BETA: '1' } });
    const { tools } = await harness.client.listTools();

    const tool = tools.find((entry) => entry.name === 'identify_plant');
    expect(tool).toBeDefined();
    expect(tool?.description).toMatch(/EXPERIMENTAL/);
    await harness.close();
  });

  it('sends image URLs in the indexed form the endpoint documents', async () => {
    const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(RESPONSE)));
    const harness = await startHarness({ env: { PERENUAL_IDENTIFY_BETA: '1' }, fetch: fetchFn });

    await harness.client.callTool({
      name: 'identify_plant',
      arguments: { image_urls: ['https://example.test/a.jpg', 'https://example.test/b.jpg'] },
    });

    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.searchParams.get('Url[0]')).toBe('https://example.test/a.jpg');
    expect(url.searchParams.get('Url[1]')).toBe('https://example.test/b.jpg');
    await harness.close();
  });

  it('returns ranked candidates through the tool', async () => {
    const harness = await startHarness({
      env: { PERENUAL_IDENTIFY_BETA: '1' },
      fetch: vi.fn(async (_url: string) => new Response(JSON.stringify(RESPONSE))),
    });

    const body = jsonBody(
      await harness.client.callTool({
        name: 'identify_plant',
        arguments: { image_urls: ['https://example.test/a.jpg'] },
      }),
    ) as { candidates: Array<{ commonName: string }> };

    expect(body.candidates[0]?.commonName).toBe('Garden Tomato');
    await harness.close();
  });
});
