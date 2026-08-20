/**
 * The shapes every tool returns. Two rules govern them:
 *
 * 1. Compact enough that a model can hold several in context at once -- no raw
 *    HTML, no upstream envelopes, no fields that only exist upstream.
 * 2. Every claim is traceable. `sources` says where a record came from and
 *    under what license, and `notes` says what is missing and why.
 */

/** Provenance for a fact, carried through to the caller. */
export interface SourceRef {
  name: string;
  url: string;
  license: string;
}

export type SourceId = 'perenual' | 'permapeople' | 'open-meteo';

export const SOURCE_REFS: Record<SourceId, SourceRef> = {
  perenual: {
    name: 'Perenual Plant API',
    url: 'https://perenual.com/docs/api',
    license: 'Perenual API terms; free tier is non-commercial',
  },
  permapeople: {
    name: 'Permapeople Plant Database',
    url: 'https://permapeople.org',
    license: 'CC BY-SA 4.0',
  },
  'open-meteo': {
    name: 'Open-Meteo Historical Weather API (ERA5)',
    url: 'https://open-meteo.com/en/docs/historical-weather-api',
    license: 'CC BY 4.0',
  },
};

/** Namespaced plant id, e.g. `perenual:1234`. Kept opaque to the caller. */
export type PlantId = string;

export interface PlantRef {
  id: PlantId;
  name: string;
}

export type Cycle = 'annual' | 'biennial' | 'perennial';
export type Sunlight = 'full-sun' | 'part-sun' | 'part-shade' | 'full-shade';
export type Watering = 'frequent' | 'average' | 'minimum' | 'none';

/** Inclusive USDA hardiness zone range, e.g. zones 4 through 10. */
export interface ZoneRange {
  min: number;
  max: number;
}

export interface PlantSummary {
  id: PlantId;
  commonName: string | null;
  scientificName: string | null;
  otherNames: string[];
  family: string | null;
  cycle: Cycle | null;
  sources: SourceRef[];
}

export interface PlantProfile extends PlantSummary {
  sun: Sunlight[];
  watering: Watering | null;
  hardiness: ZoneRange | null;
  matureHeightCm: number | null;
  /**
   * Planting density. No source in this server's roster publishes it, so this
   * is null unless Permapeople supplies one; `notes` says so rather than
   * letting the caller read the absence as "no spacing needed".
   */
  spacingCm: number | null;
  edible: { fruit: boolean | null; leaf: boolean | null };
  toxicity: { humans: boolean | null; pets: boolean | null };
  pests: string[];
  careLevel: string | null;
  growthRate: string | null;
  droughtTolerant: boolean | null;
  indoor: boolean | null;
  description: string | null;
  /** What is missing from this record and why -- tier gating, absent upstream field. */
  notes: string[];
}

export interface SearchResults {
  query: string;
  page: number;
  totalPages: number;
  results: PlantSummary[];
  notes: string[];
  sources: SourceRef[];
}

/**
 * How a companion verdict was reached. Every verdict names its mechanism, so a
 * caller can weigh "these two share a pest" differently from folklore.
 */
export type CompanionMechanism =
  /** Same botanical family: rotation conflict and shared soilborne disease pressure. */
  | 'shared-family'
  /** Overlapping pest susceptibility: co-planting concentrates the pest. */
  | 'shared-pest'
  /** Explicitly listed as a companion by an upstream database. */
  | 'listed-companion';

export type Polarity = 'good' | 'bad';
export type Verdict = 'good' | 'bad' | 'neutral';

/** `documented` came from an upstream claim; `derived` was computed here. */
export type Confidence = 'documented' | 'derived';

export interface CompanionReason {
  mechanism: CompanionMechanism;
  polarity: Polarity;
  confidence: Confidence;
  detail: string;
  source: SourceRef;
}

export interface CompanionVerdict {
  a: PlantRef;
  b: PlantRef;
  verdict: Verdict;
  /** Strongest confidence among the reasons; null when nothing matched. */
  confidence: Confidence | null;
  /** Every mechanism that matched, including ones the verdict overrode. */
  reasons: CompanionReason[];
  caveats: string[];
  sources: SourceRef[];
}

/** A recurring calendar date, `MM-DD`. Frost norms are not tied to one year. */
export type MonthDay = string;

export interface FrostEstimate {
  lastSpringFrost: MonthDay | null;
  firstFallFrost: MonthDay | null;
  seasonLengthDays: number | null;
  /** 50 = median year. Higher is more conservative: frost later in spring. */
  percentile: number;
  yearsAnalyzed: { from: number; to: number; count: number };
  method: string;
}

export interface ZoneAssessment {
  /** Zone derived from observed annual extreme minima, e.g. `7a`. */
  derived: string | null;
  plantRange: ZoneRange | null;
  compatible: boolean | null;
}

export interface PlantingSchedule {
  earliestTransplant: MonthDay | null;
  latestSowForHarvest: MonthDay | null;
}

export interface PlantingWindow {
  plant: PlantRef;
  location:
    | { latitude: number; longitude: number }
    | { hardinessZone: string };
  frost: FrostEstimate | null;
  zone: ZoneAssessment;
  /** Null when the caller supplied no crop timing for this server to work from. */
  schedule: PlantingSchedule | null;
  caveats: string[];
  sources: SourceRef[];
}

export interface IdentifyCandidate {
  score: number;
  commonName: string | null;
  scientificName: string | null;
  detailsUrl: string | null;
}

export interface IdentifyResults {
  candidates: IdentifyCandidate[];
  notes: string[];
  sources: SourceRef[];
}
