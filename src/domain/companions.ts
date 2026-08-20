import type {
  CompanionReason,
  CompanionVerdict,
  Confidence,
  PlantProfile,
  Verdict,
} from './types.js';
import { SOURCE_REFS } from './types.js';

export interface CompanionInputs {
  a: PlantProfile;
  b: PlantProfile;
  /**
   * Whether an upstream database lists these two as companions.
   * Null means no such database was consulted, which is not the same as "no".
   */
  listedCompanion: boolean | null;
}

function normalise(value: string | null): string | null {
  const text = value?.trim().toLowerCase();
  return text === undefined || text === '' ? null : text;
}

function sharedPests(a: PlantProfile, b: PlantProfile): string[] {
  const other = new Set(b.pests.map((pest) => pest.trim().toLowerCase()));
  return a.pests.filter((pest) => other.has(pest.trim().toLowerCase()));
}

function nameOf(plant: PlantProfile): string {
  return plant.commonName ?? plant.scientificName ?? plant.id;
}

/**
 * Decides whether two plants belong near each other, and says why.
 *
 * No API in this server's roster publishes antagonists -- Permapeople lists
 * "companion to" links only -- so a good/bad/neutral answer cannot be looked
 * up. Rather than restate garden folklore, this derives the negative case from
 * mechanisms present in the care data itself: a shared botanical family means
 * shared soilborne disease and a rotation conflict, and an overlapping pest
 * list means co-planting concentrates that pest.
 *
 * Every reason is returned, including ones the verdict overrode, so a caller
 * can see a mixed pair for what it is instead of a flattened label.
 */
export function judgeCompanions(inputs: CompanionInputs): CompanionVerdict {
  const { a, b } = inputs;
  const reasons: CompanionReason[] = [];
  const caveats: string[] = [];

  const familyA = normalise(a.family);
  const familyB = normalise(b.family);

  if (familyA !== null && familyA === familyB) {
    reasons.push({
      mechanism: 'shared-family',
      polarity: 'bad',
      confidence: 'derived',
      detail:
        `Both are in the family ${a.family ?? familyA}. Same-family crops share soilborne ` +
        'diseases and compete for the same rotation slot, so plant them apart and rotate the bed.',
      source: SOURCE_REFS.perenual,
    });
  } else if (familyA === null || familyB === null) {
    const missing = [familyA === null ? nameOf(a) : null, familyB === null ? nameOf(b) : null]
      .filter((name): name is string => name !== null)
      .join(' and ');
    caveats.push(`No botanical family was published for ${missing}, so the shared-family check could not run.`);
  }

  const pests = sharedPests(a, b);
  if (pests.length > 0) {
    reasons.push({
      mechanism: 'shared-pest',
      polarity: 'bad',
      confidence: 'derived',
      detail:
        `Both are susceptible to ${pests.join(', ')}. Planting them together concentrates the ` +
        'pest and gives it a continuous host.',
      source: SOURCE_REFS.perenual,
    });
  } else if (a.pests.length === 0 || b.pests.length === 0) {
    const missing = [a.pests.length === 0 ? nameOf(a) : null, b.pests.length === 0 ? nameOf(b) : null]
      .filter((name): name is string => name !== null)
      .join(' and ');
    caveats.push(`No pest data was available for ${missing}, so the shared-pest check could not run.`);
  }

  if (inputs.listedCompanion === true) {
    reasons.push({
      mechanism: 'listed-companion',
      polarity: 'good',
      confidence: 'documented',
      detail: `${nameOf(b)} is listed as a companion of ${nameOf(a)} in the Permapeople database.`,
      source: SOURCE_REFS.permapeople,
    });
  } else if (inputs.listedCompanion === null) {
    caveats.push(
      'Permapeople is not configured, so documented companion listings were not consulted. ' +
        'Set PERMAPEOPLE_KEY_ID and PERMAPEOPLE_KEY_SECRET to include them.',
    );
  }

  const bad = reasons.filter((reason) => reason.polarity === 'bad');
  const good = reasons.filter((reason) => reason.polarity === 'good');

  const verdict: Verdict = bad.length > 0 ? 'bad' : good.length > 0 ? 'good' : 'neutral';
  const deciding = verdict === 'bad' ? bad : verdict === 'good' ? good : [];

  if (bad.length > 0 && good.length > 0) {
    caveats.push(
      'This pair matched both a positive listing and a risk mechanism. The risk takes ' +
        'precedence here, but both reasons are listed so you can weigh them yourself.',
    );
  }

  if (verdict === 'neutral') {
    caveats.push(
      'No mechanism connected these two. That is an absence of evidence, not evidence that ' +
        'they grow well together.',
    );
  }

  const confidence: Confidence | null = deciding.some(
    (reason) => reason.confidence === 'documented',
  )
    ? 'documented'
    : deciding.length > 0
      ? 'derived'
      : null;

  const sources = [...new Set(reasons.map((reason) => reason.source.name))]
    .map((name) => reasons.find((reason) => reason.source.name === name)?.source)
    .filter((source): source is CompanionReason['source'] => source !== undefined);

  return {
    a: { id: a.id, name: nameOf(a) },
    b: { id: b.id, name: nameOf(b) },
    verdict,
    confidence,
    reasons,
    caveats,
    sources: sources.length > 0 ? sources : [SOURCE_REFS.perenual],
  };
}
