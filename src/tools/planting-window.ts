import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { guarded, ToolError } from '../errors.js';
import { buildSchedule } from '../domain/schedule.js';
import type { FrostTolerance } from '../domain/schedule.js';
import type { PlantingWindow, ZoneAssessment } from '../domain/types.js';
import { SOURCE_REFS } from '../domain/types.js';
import { zoneForExtremeMinC, zoneNumber } from '../domain/zones.js';
import { frostByYear, meanExtremeMinC, summariseFrost } from '../mappers/frost.js';
import type { Services } from '../services.js';
import { frostWindowFor } from '../sources/open-meteo.js';
import { jsonResult, lookupProfile, requirePerenual, toRef } from './shared.js';

const inputSchema = {
  plant: z.string().min(1).describe('A species id from search_plants, or a name.'),
  latitude: z.number().min(-90).max(90).optional().describe('Site latitude in decimal degrees.'),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .optional()
    .describe('Site longitude in decimal degrees.'),
  hardiness_zone: z
    .string()
    .optional()
    .describe(
      'A USDA zone such as "7a", used only when coordinates are unavailable. A zone encodes ' +
        'winter minimum temperature, not frost timing, so no frost dates can be derived from it.',
    ),
  days_to_maturity: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Days from sowing or transplant to first harvest. No source this server reads publishes ' +
        'this, so supply it from your own crop data to get a sow-by date.',
    ),
  frost_tolerance: z
    .enum(['tender', 'half-hardy', 'hardy'])
    .optional()
    .describe('Crop frost hardiness. Defaults to "tender", the cautious assumption.'),
  percentile: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe('Higher is more cautious: later spring frost, earlier autumn frost. Defaults to 50.'),
};

const ERA5_CAVEAT =
  'Frost dates come from ERA5 reanalysis on a roughly 9 km grid, not from a weather station. ' +
  'Expect them to differ from local station normals, especially in hills, valleys, or near water.';

function assessZone(
  derived: string | null,
  plantRange: ZoneAssessment['plantRange'],
): ZoneAssessment {
  const derivedNumber = derived === null ? null : zoneNumber(derived);
  const compatible =
    derivedNumber === null || plantRange === null
      ? null
      : derivedNumber >= plantRange.min && derivedNumber <= plantRange.max;

  return { derived, plantRange, compatible };
}

export function registerPlantingWindow(server: McpServer, services: Services): void {
  server.registerTool(
    'planting_window',
    {
      title: 'Planting window',
      description:
        'Frost envelope and hardiness fit for a plant at a location. Given coordinates it ' +
        'derives last spring frost, first autumn frost, season length, and the USDA zone from ' +
        'ten years of observed daily minima. Supply days_to_maturity and frost_tolerance from ' +
        'your own crop data to also get transplant and sow-by dates -- no source this server ' +
        'reads publishes those, so they are never guessed.',
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      guarded(async () => {
        const client = requirePerenual(services.perenual);
        const profile = await lookupProfile(client, args.plant);

        const percentile = args.percentile ?? 50;
        const tolerance: FrostTolerance = args.frost_tolerance ?? 'tender';
        const caveats: string[] = [];

        if (args.frost_tolerance === undefined) {
          caveats.push(
            'frost_tolerance was not supplied, so this assumes a tender crop -- the cautious ' +
              'reading. A hardier crop can go out earlier.',
          );
        }

        const hasCoordinates = args.latitude !== undefined && args.longitude !== undefined;

        if (!hasCoordinates && args.hardiness_zone === undefined) {
          throw new ToolError(
            'invalid_input',
            'planting_window needs either latitude and longitude, or a hardiness_zone.',
            {
              remedy:
                'Pass latitude and longitude for frost dates. A hardiness_zone alone yields only ' +
                'a hardiness check, since a zone does not encode frost timing.',
            },
          );
        }

        if (!hasCoordinates) {
          const zone = args.hardiness_zone as string;
          if (zoneNumber(zone) === null) {
            throw new ToolError('invalid_input', `"${zone}" is not a USDA hardiness zone.`, {
              remedy: 'Use a zone between 1 and 13, optionally with a half-zone letter, e.g. "7a".',
            });
          }

          caveats.push(
            'No coordinates were supplied. A USDA zone encodes average winter minimum ' +
              'temperature, not frost timing, so no frost dates or season length can be derived ' +
              'from it. Pass latitude and longitude for those.',
          );

          const window: PlantingWindow = {
            plant: toRef(profile),
            location: { hardinessZone: zone },
            frost: null,
            zone: assessZone(zone, profile.hardiness),
            schedule: null,
            caveats,
            sources: [SOURCE_REFS.perenual],
          };
          return jsonResult(window);
        }

        const latitude = args.latitude as number;
        const longitude = args.longitude as number;
        const archiveWindow = frostWindowFor(services.now());

        const series = await services.openMeteo.dailyMinima(latitude, longitude, archiveWindow);
        const seasons = frostByYear(series, { southern: latitude < 0 });

        if (seasons.length === 0) {
          throw new ToolError(
            'upstream_error',
            'Open-Meteo returned no complete years for that location.',
            { remedy: 'Check the coordinates, then retry.' },
          );
        }

        const frost = summariseFrost(seasons, {
          percentile,
          from: archiveWindow.from,
          to: archiveWindow.to,
        });

        if (frost.lastSpringFrost === null && frost.firstFallFrost === null) {
          caveats.push(
            `No daily minimum reached 0 C at this location between ${String(archiveWindow.from)} ` +
              `and ${String(archiveWindow.to)}. Treat the site as frost free rather than ` +
              'assuming the data is missing.',
          );
        }

        const meanMin = meanExtremeMinC(seasons);
        const zone = assessZone(
          meanMin === null ? null : zoneForExtremeMinC(meanMin),
          profile.hardiness,
        );

        if (zone.compatible === false) {
          caveats.push(
            `This site derives to zone ${String(zone.derived)}, outside the plant's range of ` +
              `${String(profile.hardiness?.min)}-${String(profile.hardiness?.max)}. It can still ` +
              'be grown as an annual or overwintered under protection.',
          );
        }
        if (zone.plantRange === null) {
          caveats.push('Perenual published no hardiness range for this species, so no zone fit was checked.');
        }

        caveats.push(ERA5_CAVEAT);

        const window: PlantingWindow = {
          plant: toRef(profile),
          location: { latitude, longitude },
          frost,
          zone,
          schedule: buildSchedule({
            lastSpringFrost: frost.lastSpringFrost,
            firstFallFrost: frost.firstFallFrost,
            frostTolerance: tolerance,
            daysToMaturity: args.days_to_maturity ?? null,
          }),
          caveats,
          sources: [SOURCE_REFS.perenual, SOURCE_REFS['open-meteo']],
        };

        return jsonResult(window);
      }),
  );
}
