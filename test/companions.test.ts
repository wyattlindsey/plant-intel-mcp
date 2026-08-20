import { describe, expect, it } from 'vitest';

import { judgeCompanions } from '../src/domain/companions.js';
import type { PlantProfile } from '../src/domain/types.js';
import { SOURCE_REFS } from '../src/domain/types.js';

function plant(overrides: Partial<PlantProfile> & { id: string }): PlantProfile {
  return {
    commonName: overrides.id,
    scientificName: null,
    otherNames: [],
    family: 'Rosaceae',
    cycle: null,
    sun: [],
    watering: null,
    hardiness: null,
    matureHeightCm: null,
    spacingCm: null,
    edible: { fruit: null, leaf: null },
    toxicity: { humans: null, pets: null },
    pests: ['Aphids'],
    careLevel: null,
    growthRate: null,
    droughtTolerant: null,
    indoor: null,
    description: null,
    notes: [],
    sources: [SOURCE_REFS.perenual],
    ...overrides,
  };
}

const tomato = plant({ id: 'perenual:1', commonName: 'Tomato', family: 'Solanaceae', pests: ['Aphids', 'Hornworm'] });
const potato = plant({ id: 'perenual:2', commonName: 'Potato', family: 'Solanaceae', pests: ['Colorado Potato Beetle'] });
const basil = plant({ id: 'perenual:3', commonName: 'Basil', family: 'Lamiaceae', pests: ['Slugs'] });
const carrot = plant({ id: 'perenual:4', commonName: 'Carrot', family: 'Apiaceae', pests: ['Carrot Fly'] });

describe('judgeCompanions: shared family', () => {
  it('calls a same-family pair bad and names the family', () => {
    const verdict = judgeCompanions({ a: tomato, b: potato, listedCompanion: false });

    expect(verdict.verdict).toBe('bad');
    expect(verdict.reasons[0]?.mechanism).toBe('shared-family');
    expect(verdict.reasons[0]?.detail).toContain('Solanaceae');
  });

  it('explains the mechanism rather than asserting a rule', () => {
    const verdict = judgeCompanions({ a: tomato, b: potato, listedCompanion: false });

    expect(verdict.reasons[0]?.detail).toMatch(/soilborne|rotation/i);
  });

  it('compares families case-insensitively', () => {
    const verdict = judgeCompanions({
      a: tomato,
      b: plant({ id: 'perenual:9', family: 'solanaceae', pests: [] }),
      listedCompanion: false,
    });

    expect(verdict.verdict).toBe('bad');
  });

  it('says the check could not run when a family is missing', () => {
    const verdict = judgeCompanions({
      a: tomato,
      b: plant({ id: 'perenual:9', commonName: 'Mystery', family: null, pests: [] }),
      listedCompanion: false,
    });

    expect(verdict.caveats.join(' ')).toMatch(/No botanical family.*Mystery/);
  });
});

describe('judgeCompanions: shared pest', () => {
  it('calls a pair sharing a pest bad and names the pest', () => {
    const verdict = judgeCompanions({
      a: tomato,
      b: plant({ id: 'perenual:9', commonName: 'Pepper', family: 'Capsicum', pests: ['Hornworm'] }),
      listedCompanion: false,
    });

    expect(verdict.verdict).toBe('bad');
    expect(verdict.reasons[0]?.mechanism).toBe('shared-pest');
    expect(verdict.reasons[0]?.detail).toContain('Hornworm');
  });

  it('matches pest names case-insensitively', () => {
    const verdict = judgeCompanions({
      a: tomato,
      b: plant({ id: 'perenual:9', family: 'Capsicum', pests: ['hornworm'] }),
      listedCompanion: false,
    });

    expect(verdict.verdict).toBe('bad');
  });

  it('says the check could not run when pest data is absent', () => {
    const verdict = judgeCompanions({
      a: tomato,
      b: plant({ id: 'perenual:9', commonName: 'Mystery', family: 'Capsicum', pests: [] }),
      listedCompanion: false,
    });

    expect(verdict.caveats.join(' ')).toMatch(/No pest data.*Mystery/);
  });
});

describe('judgeCompanions: listed companion', () => {
  it('calls a listed pair good and credits Permapeople', () => {
    const verdict = judgeCompanions({ a: tomato, b: basil, listedCompanion: true });

    expect(verdict.verdict).toBe('good');
    expect(verdict.confidence).toBe('documented');
    expect(verdict.sources.map((source) => source.license)).toContain('CC BY-SA 4.0');
  });

  it('notes when Permapeople was never consulted, rather than implying a "no"', () => {
    const verdict = judgeCompanions({ a: tomato, b: basil, listedCompanion: null });

    expect(verdict.caveats.join(' ')).toMatch(/Permapeople is not configured/);
    expect(verdict.caveats.join(' ')).toMatch(/PERMAPEOPLE_KEY_ID/);
  });
});

describe('judgeCompanions: precedence', () => {
  it('lets a risk mechanism override a positive listing', () => {
    const verdict = judgeCompanions({ a: tomato, b: potato, listedCompanion: true });

    expect(verdict.verdict).toBe('bad');
  });

  it('still returns the overridden reason so the pair is legible', () => {
    const verdict = judgeCompanions({ a: tomato, b: potato, listedCompanion: true });

    expect(verdict.reasons.map((reason) => reason.mechanism)).toEqual(
      expect.arrayContaining(['shared-family', 'listed-companion']),
    );
    expect(verdict.caveats.join(' ')).toMatch(/risk takes.*precedence/i);
  });

  it('reports confidence from the reasons that decided the verdict', () => {
    const verdict = judgeCompanions({ a: tomato, b: potato, listedCompanion: true });

    expect(verdict.confidence).toBe('derived');
  });
});

describe('judgeCompanions: neutral', () => {
  it('returns neutral when nothing connects the two', () => {
    const verdict = judgeCompanions({ a: basil, b: carrot, listedCompanion: false });

    expect(verdict.verdict).toBe('neutral');
    expect(verdict.reasons).toEqual([]);
    expect(verdict.confidence).toBeNull();
  });

  it('says plainly that neutral is absence of evidence, not compatibility', () => {
    const verdict = judgeCompanions({ a: basil, b: carrot, listedCompanion: false });

    expect(verdict.caveats.join(' ')).toMatch(/absence of evidence/);
  });
});

describe('judgeCompanions: identity', () => {
  it('labels both plants by name for the caller', () => {
    const verdict = judgeCompanions({ a: tomato, b: basil, listedCompanion: false });

    expect(verdict.a).toEqual({ id: 'perenual:1', name: 'Tomato' });
    expect(verdict.b).toEqual({ id: 'perenual:3', name: 'Basil' });
  });
});
