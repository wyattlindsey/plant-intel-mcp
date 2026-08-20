import { describe, expect, it } from 'vitest';

import { buildSchedule } from '../src/domain/schedule.js';

describe('buildSchedule', () => {
  it('holds a tender crop until the last frost date itself', () => {
    const schedule = buildSchedule({
      lastSpringFrost: '05-15',
      firstFallFrost: '10-01',
      frostTolerance: 'tender',
      daysToMaturity: null,
    });

    expect(schedule?.earliestTransplant).toBe('05-15');
  });

  it('lets a half-hardy crop out two weeks early', () => {
    const schedule = buildSchedule({
      lastSpringFrost: '05-15',
      firstFallFrost: null,
      frostTolerance: 'half-hardy',
      daysToMaturity: null,
    });

    expect(schedule?.earliestTransplant).toBe('05-01');
  });

  it('lets a hardy crop out four weeks early', () => {
    const schedule = buildSchedule({
      lastSpringFrost: '05-15',
      firstFallFrost: null,
      frostTolerance: 'hardy',
      daysToMaturity: null,
    });

    expect(schedule?.earliestTransplant).toBe('04-17');
  });

  it('crosses a month boundary correctly when shifting back', () => {
    const schedule = buildSchedule({
      lastSpringFrost: '03-05',
      firstFallFrost: null,
      frostTolerance: 'hardy',
      daysToMaturity: null,
    });

    expect(schedule?.earliestTransplant).toBe('02-05');
  });

  it('counts back from the first autumn frost to a sow-by date', () => {
    const schedule = buildSchedule({
      lastSpringFrost: '05-15',
      firstFallFrost: '10-01',
      frostTolerance: 'tender',
      daysToMaturity: 70,
    });

    expect(schedule?.latestSowForHarvest).toBe('07-23');
  });

  it('leaves the sow-by date null when the caller supplied no crop timing', () => {
    const schedule = buildSchedule({
      lastSpringFrost: '05-15',
      firstFallFrost: '10-01',
      frostTolerance: 'tender',
      daysToMaturity: null,
    });

    expect(schedule?.latestSowForHarvest).toBeNull();
  });

  it('returns null when there is no frost envelope to work from', () => {
    expect(
      buildSchedule({
        lastSpringFrost: null,
        firstFallFrost: null,
        frostTolerance: 'tender',
        daysToMaturity: 70,
      }),
    ).toBeNull();
  });
});
