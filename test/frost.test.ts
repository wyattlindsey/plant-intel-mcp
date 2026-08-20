import { describe, expect, it } from 'vitest';

import type { DailySeries } from '../src/mappers/frost.js';
import { frostByYear, meanExtremeMinC, summariseFrost } from '../src/mappers/frost.js';

/**
 * Builds a year of daily minima: freezing before `lastSpring`, freezing again
 * from `firstFall`, mild in between.
 */
function syntheticYear(
  year: number,
  lastSpring: string,
  firstFall: string,
  options: { warmC?: number; coldC?: number } = {},
): DailySeries {
  const warm = options.warmC ?? 12;
  const cold = options.coldC ?? -4;
  const time: string[] = [];
  const temperature_2m_min: number[] = [];

  const end = Date.UTC(year, 11, 31);
  for (let ms = Date.UTC(year, 0, 1); ms <= end; ms += 86_400_000) {
    const iso = new Date(ms).toISOString().slice(0, 10);
    const monthDay = iso.slice(5);
    time.push(iso);
    temperature_2m_min.push(monthDay <= lastSpring || monthDay >= firstFall ? cold : warm);
  }

  return { time, temperature_2m_min };
}

function concat(...series: DailySeries[]): DailySeries {
  return {
    time: series.flatMap((entry) => entry.time),
    temperature_2m_min: series.flatMap((entry) => entry.temperature_2m_min),
  };
}

describe('frostByYear (northern hemisphere)', () => {
  it('finds the last spring frost and the first autumn frost', () => {
    const [season] = frostByYear(syntheticYear(2020, '04-15', '10-10'), { southern: false });

    expect(season?.season).toBe(2020);
    expect(season?.lastSpringFrost?.monthDay).toBe('04-15');
    expect(season?.firstFallFrost?.monthDay).toBe('10-10');
  });

  it('records the coldest reading of the season', () => {
    const [season] = frostByYear(syntheticYear(2020, '04-15', '10-10', { coldC: -18 }), {
      southern: false,
    });

    expect(season?.extremeMinC).toBe(-18);
  });

  it('reports no frost dates for a frost-free location instead of failing', () => {
    const [season] = frostByYear(syntheticYear(2020, '00-00', '13-13'), { southern: false });

    expect(season?.lastSpringFrost).toBeNull();
    expect(season?.firstFallFrost).toBeNull();
    expect(season?.extremeMinC).toBe(12);
  });

  it('ignores a season with too little data to be meaningful', () => {
    const partial: DailySeries = {
      time: ['2020-01-01', '2020-01-02'],
      temperature_2m_min: [-5, -6],
    };

    expect(frostByYear(partial, { southern: false })).toEqual([]);
  });

  it('skips null readings rather than treating them as freezing', () => {
    const year = syntheticYear(2020, '04-15', '10-10');
    const series: DailySeries = {
      time: year.time,
      temperature_2m_min: year.temperature_2m_min.map((value, index) =>
        index === 200 ? null : value,
      ),
    };

    expect(frostByYear(series, { southern: false })[0]?.firstFallFrost?.monthDay).toBe('10-10');
  });
});

/**
 * A southern-hemisphere calendar year: frost occupies one contiguous mid-year
 * block (autumn into spring), and the summer sits at both ends of the year.
 */
function southernYear(year: number, autumnFrost: string, springEnd: string): DailySeries {
  const time: string[] = [];
  const temperature_2m_min: number[] = [];

  const end = Date.UTC(year, 11, 31);
  for (let ms = Date.UTC(year, 0, 1); ms <= end; ms += 86_400_000) {
    const iso = new Date(ms).toISOString().slice(0, 10);
    const monthDay = iso.slice(5);
    time.push(iso);
    temperature_2m_min.push(monthDay >= autumnFrost && monthDay <= springEnd ? -4 : 12);
  }

  return { time, temperature_2m_min };
}

describe('frostByYear (southern hemisphere)', () => {
  it('keeps a summer that crosses new year inside one season', () => {
    const series = concat(
      southernYear(2020, '05-10', '08-20'),
      southernYear(2021, '05-10', '08-20'),
    );

    const summer = frostByYear(series, { southern: true }).find(
      (season) => season.season === 2020,
    );

    // The season runs July 2020 to June 2021: spring frost ends in August
    // 2020, autumn frost returns in May 2021, and the summer between them is
    // one continuous window rather than two half-years.
    expect(summer?.lastSpringFrost?.monthDay).toBe('08-20');
    expect(summer?.firstFallFrost?.monthDay).toBe('05-10');
  });

  it('measures a real season, where reading it on calendar years would not', () => {
    const series = concat(
      southernYear(2020, '05-10', '08-20'),
      southernYear(2021, '05-10', '08-20'),
    );

    const southern = summariseFrost(
      frostByYear(series, { southern: true }),
      { percentile: 50, from: 2020, to: 2021 },
    );
    const northern = summariseFrost(
      frostByYear(series, { southern: false }),
      { percentile: 50, from: 2020, to: 2021 },
    );

    // The site really has an eight-month frost-free window. Split on calendar
    // years, the mid-winter thaw boundary reads as the whole growing season.
    expect(southern.seasonLengthDays).toBeGreaterThan(250);
    expect(northern.seasonLengthDays).toBeLessThan(5);
  });
});

describe('summariseFrost', () => {
  const seasons = frostByYear(
    concat(
      syntheticYear(2018, '04-10', '10-20'),
      syntheticYear(2019, '04-20', '10-10'),
      syntheticYear(2020, '04-30', '10-01'),
    ),
    { southern: false },
  );

  it('reports the median year at the 50th percentile', () => {
    const estimate = summariseFrost(seasons, { percentile: 50, from: 2018, to: 2020 });

    expect(estimate.lastSpringFrost).toBe('04-20');
    expect(estimate.firstFallFrost).toBe('10-10');
    expect(estimate.yearsAnalyzed).toEqual({ from: 2018, to: 2020, count: 3 });
  });

  it('gets more cautious as the percentile rises: later spring, earlier autumn', () => {
    const estimate = summariseFrost(seasons, { percentile: 100, from: 2018, to: 2020 });

    expect(estimate.lastSpringFrost).toBe('04-30');
    expect(estimate.firstFallFrost).toBe('10-01');
  });

  it('reports a shorter season at a higher percentile', () => {
    const median = summariseFrost(seasons, { percentile: 50, from: 2018, to: 2020 });
    const cautious = summariseFrost(seasons, { percentile: 100, from: 2018, to: 2020 });

    expect(cautious.seasonLengthDays).toBeLessThan(median.seasonLengthDays as number);
  });

  it('describes how the numbers were produced', () => {
    const estimate = summariseFrost(seasons, { percentile: 50, from: 2018, to: 2020 });

    expect(estimate.method).toMatch(/ERA5/);
    expect(estimate.method).toMatch(/50th percentile/);
  });

  it('returns nulls rather than guesses when no season ever froze', () => {
    const frostFree = frostByYear(syntheticYear(2020, '00-00', '13-13'), { southern: false });
    const estimate = summariseFrost(frostFree, { percentile: 50, from: 2020, to: 2020 });

    expect(estimate.lastSpringFrost).toBeNull();
    expect(estimate.firstFallFrost).toBeNull();
    expect(estimate.seasonLengthDays).toBeNull();
  });
});

describe('meanExtremeMinC', () => {
  it('averages each season\'s coldest reading', () => {
    const seasons = frostByYear(
      concat(
        syntheticYear(2019, '04-10', '10-20', { coldC: -20 }),
        syntheticYear(2020, '04-10', '10-20', { coldC: -10 }),
      ),
      { southern: false },
    );

    expect(meanExtremeMinC(seasons)).toBe(-15);
  });

  it('returns null when nothing was measured', () => {
    expect(meanExtremeMinC([])).toBeNull();
  });
});
