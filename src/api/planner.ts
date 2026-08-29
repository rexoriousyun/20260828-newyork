/**
 * Trip planning endpoint.
 *
 * The connection set takes ~6s to build and is ~1.2M connections, so it is
 * built once on first use and held. A cold first request pays that cost; every
 * request after is single-digit milliseconds.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { buildConnections, type ConnectionSet } from "../domain/connections.js";
import { displayStopName, displayStationName } from "../domain/stop-names.js";
import { departureAdvice, latestDeparture } from "../domain/departure.js";
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
    return {
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

    const { connections, footpaths, stopNames, stopCoords, frequency, segmentIndex } = await getGraph();
    const departAt = parsed.data.departAt ?? 8 * 3600 + 30 * 60;
    // Scoring keys on the raw GTFS name: the segment index was built from it,
    // and a prettier string here would silently miss every lookup.
    const nameOf = (id: string): string => stopNames.get(id) ?? id;
    /** The same stop, named for a rider rather than for the index. */
    const labelOf = (id: string): string => displayStopName(nameOf(id));

    // Working backwards from a deadline is a search, not a single plan: earliest
    // arrival is monotone in departure time, so the latest departure that still
    // makes it is found by bisection over the planner.
    let searchFrom = departAt;
    if (parsed.data.arriveBy !== undefined) {
      const found = latestDeparture(parsed.data.arriveBy, ARRIVE_BY_WINDOW_S, (t) => {
        const j = plan(connections, footpaths, parsed.data.from, parsed.data.to, t);
        return j === null ? null : j.arriveAt;
      });
      if (found === null) {
        return {
          journey: null,
          reason: "No journey arrives by then, starting from up to three hours before.",
        };
      }
      searchFrom = found.departAt;
    }

    const best = plan(connections, footpaths, parsed.data.from, parsed.data.to, searchFrom);
    if (best === null) {
      // A failed plan is a real answer, not an error: no service in the window
      // is exactly what a rider at 3am needs to be told.
      return {
        journey: null,
        reason: "No journey found within 3 hours of the requested departure.",
      };
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

    const scored = await Promise.all(
      candidates.map((j) => scoreJourney(j, segmentIndex, frequency, nameOf)),
    );

    // Ranked by expected door-to-door time — schedule plus what the history says
    // usually happens — not by the timetable alone (E-L02).
    scored.sort(
      (a, b) =>
        a.durationMinutes + a.reliability.expectedAddedMinutes -
        (b.durationMinutes + b.reliability.expectedAddedMinutes),
    );

    return {
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
                      // Without this the map's colour ramp coalesces a missing
                      // exposure to zero and paints an unmeasured stretch in
                      // the *most reliable* colour — absence of data reading as
                      // good news, which P-03 exists to forbid.
                      confidence: seg.risk === null ? "unknown" : "known",
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
                  confidence: "none",
                  from: labelOf(l.fromStop), to: labelOf(l.toStop),
                },
              }];
            }),
          ],
        },
        reliability: {
          ...j.reliability,
          worst: j.reliability.worst.map((w) => ({
            ...w, from: displayStationName(w.from), to: displayStationName(w.to),
          })),
          dominant:
            j.reliability.dominant === null
              ? null
              : {
                  ...j.reliability.dominant,
                  from: displayStationName(j.reliability.dominant.from),
                  to: displayStationName(j.reliability.dominant.to),
                },
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
                arriveBy: parsed.data.arriveBy,
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
        })),
      })),
      /** Stated so a single result is not mistaken for a shortlist. */
      alternativesFound: scored.length - 1,
    };
  });
}
