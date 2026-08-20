import type { MonthDay, PlantingSchedule } from './types.js';

/** Frost hardiness of a crop, which sets how early it can safely go out. */
export type FrostTolerance = 'tender' | 'half-hardy' | 'hardy';

/**
 * How many days before the last spring frost each class can be set out.
 * Tender crops wait for the frost date itself; hardier ones tolerate some.
 */
const DAYS_BEFORE_LAST_FROST: Record<FrostTolerance, number> = {
  tender: 0,
  'half-hardy': 14,
  hardy: 28,
};

/** A non-leap year used purely as a frame for MM-DD arithmetic. */
const NOMINAL_YEAR = 2001;

function toDate(monthDay: MonthDay): Date | null {
  const match = /^(\d{2})-(\d{2})$/.exec(monthDay);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }

  const date = new Date(Date.UTC(NOMINAL_YEAR, Number(match[1]) - 1, Number(match[2])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function shift(monthDay: MonthDay, days: number): MonthDay | null {
  const date = toDate(monthDay);
  if (date === null) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(5, 10);
}

export interface ScheduleInput {
  lastSpringFrost: MonthDay | null;
  firstFallFrost: MonthDay | null;
  frostTolerance: FrostTolerance;
  daysToMaturity: number | null;
}

/**
 * Turns a frost envelope plus caller-supplied crop timing into planting dates.
 *
 * The crop half of this calculation cannot come from any source this server
 * reads -- no API in its roster publishes days-to-maturity or a frost-hardiness
 * class -- so it is an input, not an assumption. Absent it, only the transplant
 * date is derivable.
 */
export function buildSchedule(input: ScheduleInput): PlantingSchedule | null {
  const earliestTransplant =
    input.lastSpringFrost === null
      ? null
      : shift(input.lastSpringFrost, -DAYS_BEFORE_LAST_FROST[input.frostTolerance]);

  const latestSowForHarvest =
    input.firstFallFrost === null || input.daysToMaturity === null
      ? null
      : shift(input.firstFallFrost, -input.daysToMaturity);

  return earliestTransplant === null && latestSowForHarvest === null
    ? null
    : { earliestTransplant, latestSowForHarvest };
}
