/**
 * Trip planning endpoint.
 *
 * The connection set takes ~6s to build and is ~1.2M connections, so it is
 * built once on first use and held. A cold first request pays that cost; every
 * request after is single-digit milliseconds.
 */

import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { buildConnections, type ConnectionSet } from "../domain/connections.js";
import { displayStopName, displayStationName } from "../domain/stop-names.js";
import { departureAdvice, latestDeparture } from "../domain/departure.js";
import { inServiceDay, DAY_SECONDS } from "../domain/time-bands.js";
import { clusterAlerts, isServiceAffecting, alertAgeHours, ALERTS_STALE_AFTER_HOURS,
  type Disruption } from "../domain/disruption.js";
import { BENCHMARK_PATH, MIN_COMPARABLE_COVERAGE, bucketFor, percentileOf, verdictFor,
  type BenchmarkTable, type Verdict } from "../benchmark/table.js";
import { buildFootpaths, type Footpaths } from "../domain/footpaths.js";
import { plan, type Journey } from "../domain/csa.js";
import { buildFrequency, type SegmentFrequency } from "../domain/frequency.js";
import { buildSegmentIndex, scoreJourney } from "../domain/itinerary.js";

/** GTFS service id for the weekday schedule. */
const WEEKDAY_SERVICE = "1";

interface Graph {
  connections: ConnectionSet;
  footpaths: Footpaths;
  stopNames: Map<string, string>;
  stopCoords: Map<string, { lat: number; lon: number }>;
  frequency: SegmentFrequency;
  segmentIndex: Awaited<ReturnType<typeof loadSegmentIndex>>;
  /** Stops a rider can actually depart from. Parent station nodes are not. */
  boardable: Set<string>;
  /**
   * Earliest and latest departure the loaded service covers, in seconds since
   * midnight. Only weekday service is ingested, so overnight Blue Night routes
   * are absent — and a rider asking at 2am must be told the data stops there,
   * not that the network does (P-03).
   */
  serviceWindow: { from: number; to: number };
}

async function loadSegmentIndex(): Promise<ReturnType<typeof buildSegmentIndex>> {
  const segments = await prisma.segment.findMany({
    select: {
      id: true, routeId: true, fromStation: true, toStation: true,
      fromStopId: true, toStopId: true, mode: true, geometry: true,
    },
  });
  return buildSegmentIndex(segments);
}

let graphPromise: Promise<Graph> | null = null;

async function getGraph(): Promise<Graph> {
  graphPromise ??= (async (): Promise<Graph> => {
    const connections = await buildConnections(WEEKDAY_SERVICE);
    const stops = await prisma.stop.findMany({ select: { id: true, name: true, lat: true, lon: true } });
    const byId = new Map(stops.map((s) => [s.id, s]));

    const lat = new Float64Array(connections.stopIds.length);
    const lon = new Float64Array(connections.stopIds.length);
    for (let i = 0; i < connections.stopIds.length; i++) {
      const s = byId.get(connections.stopIds[i]!);
      lat[i] = s?.lat ?? 0;
      lon[i] = s?.lon ?? 0;
    }
    const stopNamesMap = new Map(stops.map((s) => [s.id, s.name]));
    // GTFS carries a parent node per station alongside its platforms. It has a
    // clean name and no departures, so search must not offer it: picking it
    // would return "no journey found" for a trip that plans fine.
    const boardable = new Set<string>();
    for (let i = 0; i < connections.fromStop.length; i++) {
      boardable.add(connections.stopIds[connections.fromStop[i]!]!);
    }
    const coords = new Map(stops.map((s) => [s.id, { lat: s.lat, lon: s.lon }]));
    let earliest = Infinity, latest = -Infinity;
    for (let i = 0; i < connections.count; i++) {
      const t = connections.depTime[i]!;
      if (t < earliest) earliest = t;
      if (t > latest) latest = t;
    }

    return {
      serviceWindow: { from: earliest, to: latest },
      stopCoords: coords,
      connections,
      footpaths: buildFootpaths(lat, lon),
      stopNames: stopNamesMap,
      frequency: buildFrequency(connections, (id) => stopNamesMap.get(id) ?? id),
      segmentIndex: await loadSegmentIndex(),
      boardable,
    };
  })();
  return graphPromise;
}

/**
 * How a trip compares with others of its length.
 *
 * "Goes wrong 1 trip in 181" is an analyst's number until there is something to
 * measure it against — the complaint Q-C makes about our whole unit vocabulary.
 * The table is built offline by `npm run benchmark`; a missing table or a thin
 * bucket yields no comparison rather than a guessed one (P-03).
 */
let benchmark: BenchmarkTable | null = null;
try {
  benchmark = JSON.parse(readFileSync(BENCHMARK_PATH, "utf8")) as BenchmarkTable;
} catch {
  benchmark = null;
}

interface Comparison {
  /** Share of comparable trips this one is safer than. */
  saferThan: number;
  /** What a typical trip of this length does, as 1 in N. */
  typicalOneInTrips: number | null;
  /** This trip's risk over the typical one's. Above 1 is worse. */
  ratioToTypical: number | null;
  /** The side the comparison takes — decided here, not in the interface. */
  verdict: Verdict;
  /** How the reference class is named on screen. */
  label: string;
}

function compare(
  risk: number,
  coverage: number,
  minutes: number,
  bandId: string | null,
): Comparison | null {
  if (benchmark === null) return null;
  // The reference only holds trips we could measure properly, so a thinly
  // measured trip has nothing fair to be ranked against. Saying so beats
  // ranking it against a standard it was not held to.
  if (coverage < MIN_COMPARABLE_COVERAGE) return null;
  const i = bucketFor(minutes);
  if (i === null) return null;
  const bucket = benchmark.buckets[i];
  if (bucket === undefined) return null;
  const reference = bandId === null ? bucket.allDay : (bucket.atTime[bandId] ?? null);
  const saferThan = percentileOf(risk, reference);
  if (saferThan === null || reference === null) return null;
  const median = reference[Math.floor(reference.length / 2)]!;
  const ratioToTypical = median > 0 ? Number((risk / median).toFixed(2)) : null;
  return {
    saferThan,
    typicalOneInTrips: median > 0 ? Math.round(1 / median) : null,
    ratioToTypical,
    verdict: verdictFor(saferThan, ratioToTypical),
    label: bucket.label,
  };
}

/**
 * Today's disruptions, clustered into events and keyed by route.
 *
 * Re-read per request rather than cached with the graph: the alerts table is
 * replaced on every ingest, and a plan that quotes a cleared incident is worse
 * than one that quotes none. The table holds tens of rows.
 */
async function disruptionsByRoute(): Promise<{
  byRoute: Map<string, Disruption[]>;
  fetchedAt: Date | null;
  ageHours: number | null;
  stale: boolean;
}> {
  const rows = await prisma.serviceAlert.findMany({
    select: { id: true, description: true, routeIds: true, isElevator: true, fetchedAt: true },
  });
  const fetchedAt = rows.length === 0 ? null
    : rows.reduce((a, r) => (r.fetchedAt > a ? r.fetchedAt : a), rows[0]!.fetchedAt);
  const ageHours = fetchedAt === null ? null : Number(alertAgeHours(fetchedAt, new Date()).toFixed(1));
  const stale = ageHours === null || ageHours > ALERTS_STALE_AFTER_HOURS;
  const events = clusterAlerts(rows.map((r) => ({
    id: r.id,
    description: r.description,
    isElevator: r.isElevator,
    routeIds: JSON.parse(r.routeIds) as string[],
  })));
  const byRoute = new Map<string, Disruption[]>();
  for (const d of events) {
    // Elevator alerts already drive the step-free filter (D-07); they name a
    // station, not a route, and would attach to nothing here.
    if (d.kind === "elevator") continue;
    for (const r of d.routeIds) {
      const list = byRoute.get(r);
      if (list === undefined) byRoute.set(r, [d]);
      else list.push(d);
    }
  }
  return { byRoute: stale ? new Map() : byRoute, fetchedAt, ageHours, stale };
}

const planQuery = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  /** Seconds since midnight. Defaults to a weekday morning peak. */
  departAt: z.coerce.number().int().min(0).max(36 * 3600).optional(),
  /**
   * Seconds since midnight. The J-01 entry point: a rider with an obligation
   * knows their arrival time, not their departure time. Wins over departAt.
   */
  arriveBy: z.coerce.number().int().min(0).max(36 * 3600).optional(),
});

/** How far back from a deadline to look for a departure. */
const ARRIVE_BY_WINDOW_S = 3 * 3600;

/** Station codes come out of the incident feed upper-cased; riders read signs. */
function named<T extends { worst: Array<{ from: string; to: string }>; dominant: { from: string; to: string } | null }>(r: T): T {
  return {
    ...r,
    worst: r.worst.map((w) => ({ ...w, from: displayStationName(w.from), to: displayStationName(w.to) })),
    dominant:
      r.dominant === null
        ? null
        : { ...r.dominant, from: displayStationName(r.dominant.from), to: displayStationName(r.dominant.to) },
  };
}

/**
 * Why we found nothing, when the reason is us rather than the network.
 *
 * Only weekday service is loaded, so some hours are missing from the data and
 * not from Toronto. Saying "no journey" there would be absence of data dressed
 * as absence of service — the exact confusion P-03 forbids.
 */
function outsideService(atSeconds: number, window: { from: number; to: number }): string | null {
  if (atSeconds >= window.from && atSeconds <= window.to) return null;
  const hh = (s: number): string => {
    const t = `${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
    return s >= DAY_SECONDS ? `${t} the next morning` : t;
  };
  return (
    `We only have weekday service loaded, from ${hh(window.from)} to ${hh(window.to)}. ` +
    "The TTC runs Blue Night routes outside that — we just do not have them yet."
  );
}

export function registerPlanner(app: FastifyInstance): void {
  // The graph takes a few seconds to build; warm it now so the first search
  // does not pay for it.
  void getGraph();

  app.get("/stops/search", async (req, reply) => {
    const q = z.object({ q: z.string().min(2), limit: z.coerce.number().int().max(25).optional() })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });

    const limit = q.data.limit ?? 8;
    const { boardable } = await getGraph();
    // Over-fetch, then clean up: the raw GTFS list has a row per platform and
    // per side of the street, so a naive top-8 is mostly duplicates.
    const raw = await prisma.stop.findMany({
      where: { name: { contains: q.data.q } },
      select: { id: true, name: true, lat: true, lon: true },
      take: limit * 12,
    });

    const needle = q.data.q.toLowerCase();
    const seen = new Map<string, { id: string; name: string; lat: number; lon: number }>();
    for (const s of raw) {
      if (!boardable.has(s.id)) continue;
      const name = displayStopName(s.name);
      // Platforms of one station, and the two sides of one corner, are the same
      // place to a rider. They sit metres apart, so the footpath graph joins
      // them and either id plans the same trip.
      if (!seen.has(name)) seen.set(name, { ...s, name });
    }

    const stops = [...seen.values()]
      .sort((a, b) => {
        const ap = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        if (a.name.length !== b.name.length) return a.name.length - b.name.length;
        return a.name.localeCompare(b.name);
      })
      .slice(0, limit);

    return { stops };
  });

  app.get("/plan", async (req, reply) => {
    const parsed = planQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { connections, footpaths, stopNames, stopCoords, frequency, segmentIndex, serviceWindow } =
      await getGraph();
    const departAt = parsed.data.departAt ?? 8 * 3600 + 30 * 60;
    // Scoring keys on the raw GTFS name: the segment index was built from it,
    // and a prettier string here would silently miss every lookup.
    const nameOf = (id: string): string => stopNames.get(id) ?? id;
    /** The same stop, named for a rider rather than for the index. */
    const labelOf = (id: string): string => displayStopName(nameOf(id));

    // Working backwards from a deadline is a search, not a single plan: earliest
    // arrival is monotone in departure time, so the latest departure that still
    // makes it is found by bisection over the planner.
    let searchFrom = inServiceDay(departAt, serviceWindow);
    if (parsed.data.arriveBy !== undefined) {
      const arriveBy = inServiceDay(parsed.data.arriveBy, serviceWindow);
      const found = latestDeparture(arriveBy, ARRIVE_BY_WINDOW_S, (t) => {
        const j = plan(connections, footpaths, parsed.data.from, parsed.data.to, t);
        return j === null ? null : j.arriveAt;
      });
      if (found === null) {
        return { journey: null, reason: outsideService(arriveBy, serviceWindow)
          ?? "No journey arrives by then, starting from up to three hours before." };
      }
      searchFrom = found.departAt;
    }

    const best = plan(connections, footpaths, parsed.data.from, parsed.data.to, searchFrom);
    if (best === null) {
      // A failed plan is a real answer, not an error: no service in the window
      // is exactly what a rider at 3am needs to be told.
      return { journey: null, reason: outsideService(searchFrom, serviceWindow)
        ?? "No journey found within 3 hours of the requested departure." };
    }

    // Alternatives by banning one route at a time from the best journey. It is
    // the cheapest way to get genuinely different options rather than the same
    // trip a few minutes later — and where the network offers no alternative,
    // it correctly returns nothing, which is itself the honest answer (D-13's
    // surviving insight: adapt to how much choice actually exists).
    const candidates: Journey[] = [best];
    const usedRoutes = [...new Set(best.legs.filter((l) => l.kind === "ride").map((l) => l.routeId!))];
    for (const banned of usedRoutes.slice(0, 3)) {
      const alt = plan(connections, footpaths, parsed.data.from, parsed.data.to, searchFrom, 3 * 3600, new Set([banned]));
      if (alt === null) continue;
      const signature = (j: Journey): string => j.legs.map((l) => `${l.kind}:${l.routeId ?? ""}`).join(">");
      if (candidates.some((c) => signature(c) === signature(alt))) continue;
      candidates.push(alt);
    }

    // Today, on top of the history. A route the TTC has flagged is not running
    // normally, and the reliability figure below is a record of normal days.
    const { byRoute, ageHours, stale: alertsStale } = await disruptionsByRoute();
    const disruptionsOn = (j: Journey): Disruption[] => {
      const seen = new Map<string, Disruption>();
      for (const l of j.legs) {
        if (l.kind !== "ride" || l.routeId === undefined) continue;
        for (const d of byRoute.get(l.routeId) ?? []) seen.set(d.id, d);
      }
      return [...seen.values()];
    };

    // Where a disruption actually stops service on the planned way, offer one
    // that does not use those routes at all. We cannot say how much a detour
    // costs — that number is not in the feed and inventing it is exactly what
    // P-03 forbids — but we can offer a way that does not depend on it.
    const blocked = new Set(
      disruptionsOn(best).filter((d) => isServiceAffecting(d.kind)).flatMap((d) => d.routeIds),
    );
    if (blocked.size > 0) {
      const clear = plan(connections, footpaths, parsed.data.from, parsed.data.to,
                         searchFrom, ARRIVE_BY_WINDOW_S, blocked);
      const signature = (j: Journey): string => j.legs.map((l) => `${l.kind}:${l.routeId ?? ""}`).join(">");
      if (clear !== null && !candidates.some((c) => signature(c) === signature(clear))) {
        candidates.push(clear);
      }
    }

    const scored = await Promise.all(
      candidates.map((j) => scoreJourney(j, segmentIndex, frequency, nameOf)),
    );
    const byJourney = new Map(scored.map((j) => [j, disruptionsOn(j)]));

    // Ranked by expected door-to-door time — schedule plus what the history says
    // usually happens — not by the timetable alone (E-L02).
    scored.sort(
      (a, b) =>
        a.durationMinutes + a.reliability.expectedAddedMinutes -
        (b.durationMinutes + b.reliability.expectedAddedMinutes),
    );

    return {
      /**
       * When we last saw the live feed, and whether that is recent enough to
       * report. Sent even when nothing is disrupted: a rider who sees no
       * warning deserves to know whether that means "nothing wrong" or "we did
       * not look" (P-03).
       */
      alerts: { ageHours, stale: alertsStale },
      journeys: scored.map((j) => ({
        id: j.legs.map((l) => `${l.kind}:${l.routeId ?? ""}`).join(">"),
        ...j,
        // GeoJSON for the whole journey: one feature per segment ridden, plus a
        // straight line per walk. Segments carry their own risk so the map can
        // colour the trip with the same scale the explore view uses.
        geojson: {
          type: "FeatureCollection" as const,
          features: [
            ...j.path.flatMap((seg) =>
              seg.geometry === null
                ? []
                : [{
                    type: "Feature" as const,
                    geometry: { type: "LineString" as const, coordinates: JSON.parse(seg.geometry) as number[][] },
                    properties: {
                      kind: "ride", risk: seg.risk,
                      gapMinutesPerMonth: seg.gapMinutesPerMonth,
                      gapMinutesPerMonthAtTime: seg.gapMinutesPerMonthAtTime,
                      // Without this the map's colour ramp coalesces a missing
                      // exposure to zero and paints an unmeasured stretch in
                      // the *most reliable* colour — absence of data reading as
                      // good news, which P-03 exists to forbid.
                      confidence: seg.risk === null ? "unknown" : "known",
                      conditioned: seg.conditioned,
                      from: seg.from, to: seg.to,
                    },
                  }],
            ),
            ...j.legs.flatMap((l) => {
              if (l.kind !== "walk") return [];
              const a = stopCoords.get(l.fromStop), b = stopCoords.get(l.toStop);
              if (a === undefined || b === undefined) return [];
              return [{
                type: "Feature" as const,
                geometry: { type: "LineString" as const, coordinates: [[a.lon, a.lat], [b.lon, b.lat]] },
                properties: {
                  kind: "walk", risk: null, gapMinutesPerMonth: null,
                  gapMinutesPerMonthAtTime: null, conditioned: false,
                  confidence: "none",
                  from: labelOf(l.fromStop), to: labelOf(l.toStop),
                },
              }];
            }),
          ],
        },
        reliability: {
          ...named(j.reliability),
          comparison: compare(
            j.reliability.disruptionRisk, j.reliability.coverage, j.durationMinutes, null),
        },
        atTime: j.atTime === null ? null : {
          ...named(j.atTime),
          bands: j.atTime.bands,
          conditionedShare: j.atTime.conditionedShare,
          // Only comparable against a reference measured in the same band.
          comparison: j.atTime.bands.length === 1
            ? compare(j.atTime.disruptionRisk, j.atTime.coverage, j.durationMinutes,
                      j.atTime.bands[0]!.id)
            : null,
        },
        // Only present when the rider gave a deadline: without one there is
        // nothing to work backwards from, and inventing a target would be
        // answering a question they did not ask.
        advice:
          parsed.data.arriveBy === undefined
            ? null
            : departureAdvice({
                departAt: j.departAt,
                arriveAt: j.arriveAt,
                arriveBy: inServiceDay(parsed.data.arriveBy, serviceWindow),
                disruptionRisk: j.reliability.disruptionRisk,
                oneInTrips: j.reliability.oneInTrips,
                severityCoveredMinutes: j.reliability.minutesWhenBad,
                severityTypicalMinutes: j.reliability.minutesWhenDisrupted,
              }),
        typicalMinutes: j.durationMinutes,
        /** What it costs on the trips that do go wrong. */
        disruptedMinutes: j.durationMinutes + j.reliability.minutesWhenDisrupted,
        legs: j.legs.map((l, i) => ({
          kind: l.kind, routeId: l.routeId, departAt: l.departAt, arriveAt: l.arriveAt,
          fromName: labelOf(l.fromStop), toName: labelOf(l.toStop),
          reliability: j.legRisks[i] ?? null,
          reliabilityAtTime: j.legRisksAtTime?.[i] ?? null,
          disruptions: l.kind === "ride" && l.routeId !== undefined
            ? (byRoute.get(l.routeId) ?? [])
            : [],
        })),
        /**
         * Today's events on this way, deduplicated across its legs.
         *
         * Ranking is deliberately left alone. We know a flagged route is not
         * running normally; we do not know whether the rider's own stretch of
         * it is affected, or what it costs. Demoting on that would be deciding
         * for them with a number we do not have — the same call D-24 makes
         * about the departure buffer.
         */
        disruptions: byJourney.get(j) ?? [],
        /** True when nothing the TTC has flagged today touches this way. */
        avoidsDisruption: (byJourney.get(j) ?? []).length === 0,
      })),
      /** Stated so a single result is not mistaken for a shortlist. */
      alternativesFound: scored.length - 1,
    };
  });
}
