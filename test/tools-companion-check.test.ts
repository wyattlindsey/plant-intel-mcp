import { describe, expect, it, vi } from 'vitest';

import type { CompanionVerdict } from '../src/domain/types.js';
import { jsonBody, startHarness, textBody } from './helpers/harness.js';

const TOMATO = {
  id: 1852,
  common_name: 'Garden Tomato',
  scientific_name: ['Solanum lycopersicum'],
  family: 'Solanaceae',
  pest_susceptibility: ['Aphids', 'Tomato Hornworm'],
};

const POTATO = {
  id: 900,
  common_name: 'Potato',
  scientific_name: ['Solanum tuberosum'],
  family: 'Solanaceae',
  pest_susceptibility: ['Colorado Potato Beetle'],
};

const BASIL = {
  id: 300,
  common_name: 'Basil',
  scientific_name: ['Ocimum basilicum'],
  family: 'Lamiaceae',
  pest_susceptibility: ['Slugs'],
};

const CARROT = {
  id: 400,
  common_name: 'Carrot',
  scientific_name: ['Daucus carota'],
  family: 'Apiaceae',
  pest_susceptibility: ['Carrot Fly'],
};

const SPECIES: Record<string, unknown> = {
  '1852': TOMATO,
  '900': POTATO,
  '300': BASIL,
  '400': CARROT,
};

interface PermapeopleBehaviour {
  companionsOf?: Record<number, number[]>;
  fail?: boolean;
  unknown?: boolean;
}

function makeFetch(permapeople?: PermapeopleBehaviour) {
  return vi.fn(async (url: string) => {
    const target = new URL(url);

    if (target.hostname === 'perenual.com') {
      const id = /details\/(\d+)/.exec(target.pathname)?.[1];
      return new Response(JSON.stringify(SPECIES[id ?? ''] ?? {}), { status: 200 });
    }

    if (permapeople?.fail === true) {
      return new Response(JSON.stringify({}), { status: 503 });
    }

    if (target.pathname === '/api/search') {
      if (permapeople?.unknown === true) {
        return new Response(JSON.stringify({ plants: [] }), { status: 200 });
      }
      const query = target.searchParams.get('q') ?? '';
      const match = Object.values(SPECIES).find(
        (species) => (species as { scientific_name: string[] }).scientific_name[0] === query,
      ) as { id: number; common_name: string; scientific_name: string[] } | undefined;

      return new Response(
        JSON.stringify({
          plants:
            match === undefined
              ? []
              : [{ id: match.id, name: match.common_name, scientific_name: match.scientific_name[0] }],
        }),
        { status: 200 },
      );
    }

    const companionId = /plants\/(\d+)\/companions/.exec(target.pathname)?.[1];
    const listed = permapeople?.companionsOf?.[Number(companionId)] ?? [];
    return new Response(
      JSON.stringify({ plants: listed.map((id) => ({ id, name: null, scientific_name: null })) }),
      { status: 200 },
    );
  });
}

async function check(
  plantA: string,
  plantB: string,
  options: { permapeople?: PermapeopleBehaviour; enabled?: boolean } = {},
): Promise<{ verdict: CompanionVerdict; raw: unknown }> {
  const harness = await startHarness({
    fetch: makeFetch(options.permapeople),
    env:
      options.enabled === true
        ? { PERMAPEOPLE_KEY_ID: 'id', PERMAPEOPLE_KEY_SECRET: 'secret' }
        : {},
  });

  const raw = await harness.client.callTool({
    name: 'companion_check',
    arguments: { plant_a: plantA, plant_b: plantB },
  });
  await harness.close();

  const verdict = (raw as { isError?: boolean }).isError
    ? (null as unknown as CompanionVerdict)
    : (jsonBody(raw) as CompanionVerdict);

  return { verdict, raw };
}

describe('companion_check without Permapeople', () => {
  it('calls tomato and potato bad for sharing Solanaceae', async () => {
    const { verdict } = await check('perenual:1852', 'perenual:900');

    expect(verdict.verdict).toBe('bad');
    expect(verdict.reasons[0]?.mechanism).toBe('shared-family');
    expect(verdict.reasons[0]?.detail).toContain('Solanaceae');
  });

  it('matches the antagonist the garden-planner knowledge base records by hand', async () => {
    // garden-planner/kb/crops/tomato.json lists potato as an antagonist on
    // shared late-blight grounds. Derived from family, this agrees.
    const { verdict } = await check('perenual:1852', 'perenual:900');

    expect(verdict.verdict).toBe('bad');
  });

  it('returns neutral for an unrelated pair, and says why that is not approval', async () => {
    const { verdict } = await check('perenual:300', 'perenual:400');

    expect(verdict.verdict).toBe('neutral');
    expect(verdict.caveats.join(' ')).toMatch(/absence of evidence/);
  });

  it('says the companion listing source was not consulted', async () => {
    const { verdict } = await check('perenual:300', 'perenual:400');

    expect(verdict.caveats.join(' ')).toMatch(/Permapeople is not configured/);
  });

  it('rejects comparing a plant with itself', async () => {
    const { raw } = await check('perenual:1852', 'perenual:1852');

    expect((raw as { isError: boolean }).isError).toBe(true);
    expect(textBody(raw)).toMatch(/same species/);
  });
});

describe('companion_check with Permapeople', () => {
  it('calls a listed pair good and credits the source licence', async () => {
    const { verdict } = await check('perenual:1852', 'perenual:300', {
      enabled: true,
      permapeople: { companionsOf: { 1852: [300] } },
    });

    expect(verdict.verdict).toBe('good');
    expect(verdict.confidence).toBe('documented');
    expect(verdict.sources.map((source) => source.license)).toContain('CC BY-SA 4.0');
  });

  it('finds a listing recorded on either side of the pair', async () => {
    const { verdict } = await check('perenual:1852', 'perenual:300', {
      enabled: true,
      permapeople: { companionsOf: { 300: [1852] } },
    });

    expect(verdict.verdict).toBe('good');
  });

  it('still lets a risk mechanism override a positive listing', async () => {
    const { verdict } = await check('perenual:1852', 'perenual:900', {
      enabled: true,
      permapeople: { companionsOf: { 1852: [900] } },
    });

    expect(verdict.verdict).toBe('bad');
    expect(verdict.reasons.map((reason) => reason.mechanism)).toContain('listed-companion');
  });

  it('degrades to the derived answer when Permapeople is unreachable', async () => {
    const { verdict } = await check('perenual:1852', 'perenual:900', {
      enabled: true,
      permapeople: { fail: true },
    });

    expect(verdict.verdict).toBe('bad');
    expect(verdict.caveats.join(' ')).toMatch(/could not be reached/);
  });

  it('says so when Permapeople has no record of a plant', async () => {
    const { verdict } = await check('perenual:300', 'perenual:400', {
      enabled: true,
      permapeople: { unknown: true },
    });

    expect(verdict.verdict).toBe('neutral');
    expect(verdict.caveats.join(' ')).toMatch(/no record/);
  });
});
