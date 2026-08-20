import type { FrostEstimate, MonthDay } from '../domain/types.js';

/** The daily block Open-Meteo returns for an archive query. */
export interface DailySeries {
  time: string[];
  temperature_2m_min: Array<number | null>;
}

export interface SeasonFrost {
  /** Calendar year in the north; the year the season began in the south. */
  season: number;
  lastSpringFrost: { monthDay: MonthDay; offset: number } | null;
  firstFallFrost: { monthDay: MonthDay; offset: number } | null;
  extremeMinC: number | null;
  observations: number;
}

export interface FrostByYearOptions {
  /** True south of the equator, where the growing season crosses new year. */
  southern: boolean;
  /** Temperature at or below which frost is counted. Defaults to 0 C. */
  thresholdC?: number;
}

const MS_PER_DAY = 86_400_000;

/** A season needs most of a year of data before its dates mean anything. */
const MIN_OBSERVATIONS = 300;

function parseIso(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/**
 * Groups an observation into a growing season and gives its day offset from
 * that season's start. In the north a season is the calendar year; in the
 * south it runs July to June, so summer is not split across two seasons.
 */
function seasonOf(date: Date, southern: boolean): { season: number; startMs: number } {
  const year = date.getUTCFullYear();
  const startMonth = southern ? 6 : 0;
  const season = southern ? (date.getUTCMonth() >= 6 ? year : year - 1) : year;

  return { season, startMs: Date.UTC(season, startMonth, 1) };
}

/** Day offset that separates the spring side of a season from the autumn side. */
function splitOffset(season: number, southern: boolean): number {
  const start = Date.UTC(season, southern ? 6 : 0, 1);
  const middle = Date.UTC(season, southern ? 12 : 6, 1);
  return (middle - start) / MS_PER_DAY;
}

/**
 * Finds, for each growing season, the last frost on the way into it and the
 * first frost on the way out, plus the season's coldest reading.
 */
export function frostByYear(series: DailySeries, options: FrostByYearOptions): SeasonFrost[] {
  const threshold = options.thresholdC ?? 0;
  const seasons = new Map<number, SeasonFrost>();

  series.time.forEach((iso, index) => {
    const min = series.temperature_2m_min[index];
    const date = parseIso(iso);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const { season, startMs } = seasonOf(date, options.southern);
    const entry = seasons.get(season) ?? {
      season,
      lastSpringFrost: null,
      firstFallFrost: null,
      extremeMinC: null,
      observations: 0,
    };

    entry.observations += 1;

    if (typeof min === 'number' && Number.isFinite(min)) {
      entry.extremeMinC = entry.extremeMinC === null ? min : Math.min(entry.extremeMinC, min);

      if (min <= threshold) {
        const offset = (date.getTime() - startMs) / MS_PER_DAY;
        const point = { monthDay: iso.slice(5), offset };

        if (offset < splitOffset(season, options.southern)) {
          // Later spring frosts overwrite earlier ones: we want the last.
          entry.lastSpringFrost = point;
        } else if (entry.firstFallFrost === null) {
          entry.firstFallFrost = point;
        }
      }
    }

    seasons.set(season, entry);
  });

  return [...seasons.values()]
    .filter((entry) => entry.observations >= MIN_OBSERVATIONS)
    .sort((a, b) => a.season - b.season);
}

/**
 * Picks the value at a percentile, where a higher percentile is always the
 * more cautious answer: a later last-spring frost, an earlier first-autumn
 * frost. 50 is the median year.
 */
function atPercentile<T>(values: T[], percentile: number, key: (value: T) => number, cautiousIsLater: boolean): T | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) =>
    cautiousIsLater ? key(a) - key(b) : key(b) - key(a),
  );
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1));

  return sorted[index] ?? null;
}

export interface SummariseFrostOptions {
  percentile: number;
  from: number;
  to: number;
}

export function summariseFrost(seasons: SeasonFrost[], options: SummariseFrostOptions): FrostEstimate {
  const springs = seasons
    .map((season) => season.lastSpringFrost)
    .filter((point): point is NonNullable<typeof point> => point !== null);
  const falls = seasons
    .map((season) => season.firstFallFrost)
    .filter((point): point is NonNullable<typeof point> => point !== null);

  const spring = atPercentile(springs, options.percentile, (point) => point.offset, true);
  const fall = atPercentile(falls, options.percentile, (point) => point.offset, false);

  const seasonLengthDays =
    spring === null || fall === null ? null : Math.max(0, Math.round(fall.offset - spring.offset));

  return {
    lastSpringFrost: spring?.monthDay ?? null,
    firstFallFrost: fall?.monthDay ?? null,
    seasonLengthDays,
    percentile: options.percentile,
    yearsAnalyzed: { from: options.from, to: options.to, count: seasons.length },
    method:
      `Daily minimum temperatures at or below 0 C from the Open-Meteo ERA5 archive, ` +
      `reduced to the ${String(options.percentile)}th percentile across ${String(seasons.length)} seasons. ` +
      'Season length is the span between the two reported dates.',
  };
}

/** Mean of each season's coldest reading -- the input to a USDA zone. */
export function meanExtremeMinC(seasons: SeasonFrost[]): number | null {
  const minima = seasons
    .map((season) => season.extremeMinC)
    .filter((value): value is number => value !== null);

  if (minima.length === 0) {
    return null;
  }

  return minima.reduce((total, value) => total + value, 0) / minima.length;
}
