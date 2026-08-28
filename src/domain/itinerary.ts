/**
 * Reliability scoring for a whole journey.
 *
 * The engine measures a *segment*. This turns a sequence of legs into what a
 * rider actually wants: how long this trip usually takes, and how long it takes
 * when it goes wrong.
 *
 * Two conversions make that honest:
 *
 *   per-month -> per-trip   exposure is harm over calendar time, so it is
 *                           divided by how often the segment is served
 *                           (`frequency.ts`), or frequent routes are punished
 *                           for being frequent.
 *
 *   risk -> minutes         a per-trip incident probability is multiplied by
 *                           the pooled severity for that mode (`D-11`), because
 *                           severity does not persist per segment.
 *
 * The output is a range, never a single number (`P-01`).
 */

import { prisma } from "../db/client.js";
import type { Journey, Leg } from "./csa.js";
import { key, type SegmentFrequency } from "./frequency.js";
import { stationFromPlatform } from "./stations.js";

/** Subway route ids, whose segments key on station names rather than stop ids. */
const SUBWAY_ROUTES = new Set(["1", "2", "4"]);

/** Cached: the archive's edge does not move between requests. */
let latestCache: Date | null = null;
async function latestObservation(): Promise<Date> {
  if (latestCache !== null) return latestCache;
  const row = await prisma.delayIncident.findFirst({
    where: { minDelay: { gt: 0 } }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true },
  });
  return (latestCache = row?.occurredAt ?? new Date());
}

export interface SegmentRisk {
  segmentId: string;
  from: string;
  to: string;
  /** Probability this segment produces an incident on a given trip. */
  risk: number;
  gapMinutesPerMonth: number;
  confidence: string;
}

export interface ScoredJourney extends Journey {
  durationMinutes: number;
  reliability: {
    /** Probability this journey meets at least one logged incident. */
    disruptionRisk: number;
    /** The same figure as riders actually think about it: 1 trip in N. */
    oneInTrips: number | null;
    /** Typical added wait *when* disrupted — pooled per mode (D-11). */
    minutesWhenDisrupted: number;
    /** risk x severity. Small by nature; used for ranking, not for display. */
    expectedAddedMinutes: number;
    /** Share of the journey's segments we could score. */
    coverage: number;
    /** Worst segments on this journey, for "why this number". */
    worst: SegmentRisk[];
  };
}

interface SegmentRow {
  id: string; routeId: string; fromStation: string; toStation: string;
  fromStopId: string | null; toStopId: string | null; mode: string;
}

/**
 * Index for turning a (route, stop, stop) triple into a segment.
 *
 * Surface segments key on GTFS stop ids. Subway segments key on station names,
 * because the delay feed identifies subway locations by station and never by
 * platform — so a subway leg has to be translated before it can be matched.
 */
export function buildSegmentIndex(segments: SegmentRow[]): Map<string, SegmentRow> {
  const index = new Map<string, SegmentRow>();
  for (const s of segments) {
    if (s.fromStopId !== null && s.toStopId !== null) {
      index.set(key(s.routeId, s.fromStopId, s.toStopId), s);
    } else {
      index.set(key(s.routeId, s.fromStation, s.toStation), s);
    }
  }
  return index;
}

function lookup(
  index: Map<string, SegmentRow>,
  routeId: string,
  fromStop: string,
  toStop: string,
  stopName: (id: string) => string,
): SegmentRow | undefined {
  const direct = index.get(key(routeId, fromStop, toStop));
  if (direct !== undefined) return direct;
  if (!SUBWAY_ROUTES.has(routeId)) return undefined;
  return index.get(
    key(routeId, stationFromPlatform(stopName(fromStop)), stationFromPlatform(stopName(toStop))),
  );
}

export async function scoreJourney(
  journey: Journey,
  index: Map<string, SegmentRow>,
  frequency: SegmentFrequency,
  stopName: (id: string) => string,
): Promise<ScoredJourney> {
  const rides = journey.legs.filter((l): l is Leg & { stopIds: string[] } =>
    l.kind === "ride" && Array.isArray(l.stopIds));

  const traversed: SegmentRow[] = [];
  let expectedSegments = 0;
  for (const leg of rides) {
    for (let i = 0; i < leg.stopIds.length - 1; i++) {
      expectedSegments++;
      const seg = lookup(index, leg.routeId!, leg.stopIds[i]!, leg.stopIds[i + 1]!, stopName);
      if (seg !== undefined) traversed.push(seg);
    }
  }

  const { recencyWeight, effectiveMonths, confidenceFor } = await import("./score.js");
  const now = await latestObservation();
  const denominator = effectiveMonths(19);

  // One query for every segment on the journey, grouped in memory. A query per
  // segment turned a 10ms plan into a 1.4s one.
  const segIds = [...new Set(traversed.map((s) => s.id))];
  const allRows = segIds.length === 0 ? [] : await prisma.delayIncident.findMany({
    where: { segmentId: { in: segIds }, minDelay: { gt: 0 } },
    select: { segmentId: true, minGap: true, occurredAt: true },
  });
  const bySegment = new Map<string, Array<{ minGap: number; occurredAt: Date }>>();
  for (const r of allRows) {
    const list = bySegment.get(r.segmentId!);
    if (list === undefined) bySegment.set(r.segmentId!, [r]);
    else list.push(r);
  }

  const risks: SegmentRisk[] = [];
  for (const [segId, rows] of bySegment) {
    const seg = traversed.find((t) => t.id === segId)!;
    const weights = rows.map((r) => recencyWeight(r.occurredAt, now));
    const sample = weights.reduce((t, w) => t + w, 0);
    const confidence = confidenceFor(sample);
    if (confidence === "unknown") continue;

    const gapPerMonth = rows.reduce((t, r, i) => t + r.minGap * weights[i]!, 0) / denominator;
    const incidentsPerMonth = sample / denominator;
    const trips = frequency.tripsPerMonth.get(
      key(seg.routeId, seg.fromStopId ?? seg.fromStation, seg.toStopId ?? seg.toStation),
    );
    // Without a frequency we cannot convert to per-trip risk, and guessing one
    // would invent the number the whole conversion exists to avoid.
    if (trips === undefined || trips <= 0) continue;

    risks.push({
      segmentId: segId,
      from: seg.fromStation,
      to: seg.toStation,
      risk: Math.min(1, incidentsPerMonth / trips),
      gapMinutesPerMonth: Number(gapPerMonth.toFixed(1)),
      confidence,
    });
  }

  // Pooled severity for the modes this journey actually uses (D-11).
  const modes = new Set(traversed.map((s) => (s.mode === "subway" ? "subway" : "surface")));
  const severity = await pooledSeverityFor([...modes]);

  // Probability the journey meets at least one incident: one minus the chance
  // every segment behaves. Summing per-segment risks would exceed 1 on a long
  // trip and imply certainty that does not exist.
  const clean = risks.reduce((p, r) => p * (1 - r.risk), 1);
  const disruptionRisk = 1 - clean;
  const expected = disruptionRisk * severity.p50;

  return {
    ...journey,
    durationMinutes: Math.round((journey.arriveAt - journey.departAt) / 60),
    reliability: {
      disruptionRisk: Number(disruptionRisk.toFixed(4)),
      oneInTrips: disruptionRisk > 0 ? Math.round(1 / disruptionRisk) : null,
      minutesWhenDisrupted: severity.p50,
      expectedAddedMinutes: Number(expected.toFixed(2)),
      coverage: expectedSegments === 0 ? 0 : Number((risks.length / expectedSegments).toFixed(2)),
      worst: risks.sort((a, b) => b.risk - a.risk).slice(0, 3),
    },
  };
}

/**
 * Pooled severity is a whole-network statistic, so it is computed once per mode
 * and held. Recomputing it scanned 85,000 rows on every journey scored, which
 * was the entire cost of a plan request.
 */
const severityCache = new Map<string, { p50: number; p90: number }>();

async function pooledSeverityFor(modes: string[]): Promise<{ p50: number; p90: number }> {
  const cacheKey = modes.includes("surface") ? "surface" : "subway";
  const hit = severityCache.get(cacheKey);
  if (hit !== undefined) return hit;

  const list = modes.includes("surface") ? ["bus", "streetcar"] : ["subway"];
  const rows = await prisma.delayIncident.findMany({
    where: {
      mode: { in: list }, minDelay: { gt: 0 },
      segmentId: { not: null }, segment: { isTerminalApproach: false },
    },
    select: { minGap: true },
  });
  const gaps = rows.map((r) => r.minGap).sort((a, b) => a - b);
  if (gaps.length === 0) return { p50: 0, p90: 0 };
  const at = (p: number): number => gaps[Math.min(gaps.length - 1, Math.ceil((p / 100) * gaps.length) - 1)]!;
  const result = { p50: at(50), p90: at(90) };
  severityCache.set(cacheKey, result);
  return result;
}
