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

/** Weekday service days in an average month. */
const WEEKDAYS_PER_MONTH = 21.7;

export interface SegmentFrequency {
  /** Key: `routeId|fromStopId|toStopId`. */
  tripsPerMonth: Map<string, number>;
}

export function key(routeId: string, fromStopId: string, toStopId: string): string {
  return `${routeId}|${fromStopId}|${toStopId}`;
}

export function buildFrequency(c: ConnectionSet): SegmentFrequency {
  const perWeekday = new Map<string, number>();
  for (let i = 0; i < c.count; i++) {
    const k = key(c.tripRoute[c.trip[i]!]!, c.stopIds[c.fromStop[i]!]!, c.stopIds[c.toStop[i]!]!);
    perWeekday.set(k, (perWeekday.get(k) ?? 0) + 1);
  }
  const tripsPerMonth = new Map<string, number>();
  for (const [k, n] of perWeekday) tripsPerMonth.set(k, n * WEEKDAYS_PER_MONTH);
  return { tripsPerMonth };
}
