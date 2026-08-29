/**
 * How often each segment is served.
 *
 * Exposure is measured as gap-minutes *per month* — harm over calendar time,
 * not per trip. To turn that into "what might happen to me on this journey" it
 * has to be divided by how many trips run there: a segment causing 90 minutes a
 * month across 3,000 trips is a very different proposition from 90 minutes
 * across 200.
 *
 * Without this step a ranking would punish frequent routes for being frequent.
 */

import type { ConnectionSet } from "./connections.js";
import { stationFromPlatform } from "./stations.js";
import { bandOfSeconds } from "./time-bands.js";

/** Subway segments key on station names, not stop ids — see below. */
const SUBWAY_ROUTES = new Set(["1", "2", "4"]);

/** Weekday service days in an average month. */
const WEEKDAYS_PER_MONTH = 21.7;

export interface SegmentFrequency {
  /** Key: `routeId|fromStopId|toStopId`. */
  tripsPerMonth: Map<string, number>;
  /**
   * The same, split by the band a trip departs in. Key: `segmentKey|bandId`.
   *
   * Both sides of the risk ratio have to be sliced the same way. Dividing
   * peak-hour incidents by all-day trips would understate peak by roughly the
   * factor peak service exceeds the daily mean — which is most of why the
   * intuition that "peak is much worse" does not survive measurement (E-D20).
   */
  tripsPerMonthInBand: Map<string, number>;
}

export function key(routeId: string, fromStopId: string, toStopId: string): string {
  return `${routeId}|${fromStopId}|${toStopId}`;
}

export function buildFrequency(c: ConnectionSet, stopName: (id: string) => string): SegmentFrequency {
  const perWeekday = new Map<string, number>();
  const perWeekdayInBand = new Map<string, number>();
  const bump = (k: string, band: string): void =>
    void perWeekdayInBand.set(`${k}|${band}`, (perWeekdayInBand.get(`${k}|${band}`) ?? 0) + 1);

  for (let i = 0; i < c.count; i++) {
    const route = c.tripRoute[c.trip[i]!]!;
    const fromId = c.stopIds[c.fromStop[i]!]!;
    const toId = c.stopIds[c.toStop[i]!]!;
    const band = bandOfSeconds(c.depTime[i]!).id;
    perWeekday.set(key(route, fromId, toId), (perWeekday.get(key(route, fromId, toId)) ?? 0) + 1);
    bump(key(route, fromId, toId), band);

    // Subway segments are stored against station names, because the delay feed
    // identifies subway locations by station and never by platform. Without a
    // station-keyed entry here, every subway segment fails its frequency lookup
    // and drops out of scoring entirely — which is what happened.
    if (SUBWAY_ROUTES.has(route)) {
      const a = stationFromPlatform(stopName(fromId));
      const b = stationFromPlatform(stopName(toId));
      if (a !== "" && b !== "" && a !== b) {
        const sk = key(route, a, b);
        perWeekday.set(sk, (perWeekday.get(sk) ?? 0) + 1);
        bump(sk, band);
      }
    }
  }
  const tripsPerMonth = new Map<string, number>();
  for (const [k, n] of perWeekday) tripsPerMonth.set(k, n * WEEKDAYS_PER_MONTH);
  const tripsPerMonthInBand = new Map<string, number>();
  for (const [k, n] of perWeekdayInBand) tripsPerMonthInBand.set(k, n * WEEKDAYS_PER_MONTH);
  return { tripsPerMonth, tripsPerMonthInBand };
}
