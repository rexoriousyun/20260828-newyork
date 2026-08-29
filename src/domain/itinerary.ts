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
    /**
     * Added wait on a bad disruption rather than a typical one. Departure
     * advice buys buffer against this, not against the median: a rider with a
     * deadline has asymmetric tolerance and plans by the tail (E-L03).
     */
    minutesWhenBad: number;
    /** risk x severity. Small by nature; used for ranking, not for display. */
    expectedAddedMinutes: number;
    /** Share of the journey's segments we could score. */
    coverage: number;
    /** Worst segments on this journey, for "why this number". */
    worst: SegmentRisk[];
    /**
     * The one stretch that genuinely dominates, or null when the risk is
     * spread — naming a stretch anyway sends the rider to the wrong place.
     */
    dominant: SegmentRisk | null;
  };
  /** Ordered segments the journey rides, for drawing it on the map. */
  path: TraversedSegment[];
  /**
   * Per-leg reliability, indexed by position in `legs`. Null on a walk, and on
   * a ride we could not score at all — which is shown as unknown, never as
   * fine (P-03). Variance compounds across transfers on a long trip (PR-05),
   * so which leg carries the risk is a different question from how much the
   * trip carries, and the rider needs both.
   */
  legRisks: Array<LegRisk | null>;
}

interface SegmentRow {
  id: string; routeId: string; fromStation: string; toStation: string;
  fromStopId: string | null; toStopId: string | null; mode: string;
  geometry?: string | null;
}

/** A segment the journey rides through, with whatever we know about it. */
export interface LegRisk {
  /** Probability this leg alone meets a logged incident. */
  risk: number;
  oneInTrips: number | null;
  /** Share of this leg's segments we could score. */
  coverage: number;
  /** True when this leg carries the largest single share of the trip's risk. */
  isWorst: boolean;
}

export interface TraversedSegment {
  id: string;
  geometry: string | null;
  risk: number | null;
  /** Same unit the explore map uses, so a trip is coloured by one scale. */
  gapMinutesPerMonth: number | null;
  from: string;
  to: string;
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

/**
 * How far ahead of the runner-up a leg or stretch must be before it is named
 * as carrying the trip's risk. Pre-registered so the label cannot be loosened
 * after seeing a trip that looked like it ought to have one.
 *
 * **This was first written as a share of the trip's total risk, and that rule
 * was wrong.** On a two-leg trip with equal legs each carries just over half
 * the total, so any threshold at or below 50% fires on a perfectly even split
 * and points the rider at an arbitrary half of their journey. Dominance is a
 * comparison with the next-worst, not with the sum.
 */
export const WORST_DOMINANCE = 2;

/**
 * Probability at least one of these independent chances fires: one minus the
 * chance every one of them behaves.
 *
 * Summing them instead would exceed 1 on a long trip and imply a certainty
 * that does not exist. Used for both a leg and the whole journey, so a leg's
 * figures compose into the trip's rather than being a separate estimate of it.
 */
export function composeRisk(risks: readonly number[]): number {
  return 1 - risks.reduce((p, r) => p * (1 - r), 1);
}

/**
 * Which leg to name as carrying the trip's risk, or none.
 *
 * Only meaningful with something to compare against, and only when one leg
 * genuinely dominates: below WORST_LEG_SHARE the risk is spread, and naming a
 * leg anyway points the rider at the wrong part of their trip.
 */
export function worstLegIndex(
  legRisks: ReadonlyArray<{ risk: number; oneInTrips: number | null } | null>,
): number | null {
  const ranked = legRisks
    .map((l, i) => ({ l, i }))
    .filter((x): x is { l: { risk: number; oneInTrips: number | null }; i: number } =>
      x.l !== null && x.l.oneInTrips !== null)
    .sort((a, b) => b.l.risk - a.l.risk);
  if (ranked.length < 2) return null;
  const second = ranked[1]!.l.risk;
  if (second <= 0) return ranked[0]!.l.risk > 0 ? ranked[0]!.i : null;
  return ranked[0]!.l.risk / second >= WORST_DOMINANCE ? ranked[0]!.i : null;
}

/**
 * The one stretch worth naming on a journey, or none. Same rule as the legs,
 * one level finer — a rider who wants to know *where* on the leg.
 */
export function dominantStretch(risks: readonly SegmentRisk[]): SegmentRisk | null {
  const ranked = [...risks].sort((a, b) => b.risk - a.risk);
  if (ranked.length < 2) return null;
  const second = ranked[1]!.risk;
  if (second <= 0) return ranked[0]!.risk > 0 ? ranked[0]! : null;
  return ranked[0]!.risk / second >= WORST_DOMINANCE ? ranked[0]! : null;
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
  // Which leg each segment belongs to. A segment can in principle be ridden by
  // two legs of one journey, so this is a set rather than a single index.
  const legsOfSegment = new Map<string, Set<number>>();
  const expectedPerLeg = new Map<number, number>();
  for (const leg of rides) {
    const legIndex = journey.legs.indexOf(leg);
    for (let i = 0; i < leg.stopIds.length - 1; i++) {
      expectedSegments++;
      expectedPerLeg.set(legIndex, (expectedPerLeg.get(legIndex) ?? 0) + 1);
      const seg = lookup(index, leg.routeId!, leg.stopIds[i]!, leg.stopIds[i + 1]!, stopName);
      if (seg === undefined) continue;
      traversed.push(seg);
      const set = legsOfSegment.get(seg.id);
      if (set === undefined) legsOfSegment.set(seg.id, new Set([legIndex]));
      else set.add(legIndex);
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

  const disruptionRisk = composeRisk(risks.map((r) => r.risk));
  const expected = disruptionRisk * severity.p50;

  const riskById = new Map(risks.map((r) => [r.segmentId, r.risk]));
  const exposureById = new Map(risks.map((r) => [r.segmentId, r.gapMinutesPerMonth]));

  // Per-leg risk, composed the same way as the journey's: one minus the chance
  // every segment of that leg behaves.
  const perLeg = new Map<number, number[]>();
  for (const r of risks) {
    for (const li of legsOfSegment.get(r.segmentId) ?? []) {
      const list = perLeg.get(li);
      if (list === undefined) perLeg.set(li, [r.risk]);
      else list.push(r.risk);
    }
  }
  const legRisks: Array<LegRisk | null> = journey.legs.map((leg, i) => {
    if (leg.kind !== "ride") return null;
    const scored = perLeg.get(i) ?? [];
    const expected = expectedPerLeg.get(i) ?? 0;
    if (scored.length === 0 || expected === 0) {
      // A ride we could not score is a ride we cannot speak for. It is shown
      // as unknown rather than folded into the trip's figure (P-03).
      return { risk: 0, oneInTrips: null, coverage: 0, isWorst: false };
    }
    const legRisk = composeRisk(scored);
    return {
      risk: Number(legRisk.toFixed(5)),
      oneInTrips: legRisk > 0 ? Math.round(1 / legRisk) : null,
      coverage: Number((scored.length / expected).toFixed(2)),
      isWorst: false,
    };
  });
  const worst = worstLegIndex(legRisks);
  if (worst !== null) legRisks[worst]!.isWorst = true;

  return {
    ...journey,
    durationMinutes: Math.round((journey.arriveAt - journey.departAt) / 60),
    path: traversed.map((s) => ({
      id: s.id,
      geometry: s.geometry ?? null,
      risk: riskById.get(s.id) ?? null,
      gapMinutesPerMonth: exposureById.get(s.id) ?? null,
      from: s.fromStation,
      to: s.toStation,
    })),
    reliability: {
      disruptionRisk: Number(disruptionRisk.toFixed(4)),
      oneInTrips: disruptionRisk > 0 ? Math.round(1 / disruptionRisk) : null,
      minutesWhenDisrupted: severity.p50,
      minutesWhenBad: severity.p90,
      expectedAddedMinutes: Number(expected.toFixed(2)),
      coverage: expectedSegments === 0 ? 0 : Number((risks.length / expectedSegments).toFixed(2)),
      dominant: dominantStretch(risks),
      worst: risks.sort((a, b) => b.risk - a.risk).slice(0, 3),
    },
    legRisks,
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
