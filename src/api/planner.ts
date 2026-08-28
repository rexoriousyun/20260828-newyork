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
  frequency: SegmentFrequency;
  segmentIndex: Awaited<ReturnType<typeof loadSegmentIndex>>;
}

async function loadSegmentIndex(): Promise<ReturnType<typeof buildSegmentIndex>> {
  const segments = await prisma.segment.findMany({
    select: {
      id: true, routeId: true, fromStation: true, toStation: true,
      fromStopId: true, toStopId: true, mode: true,
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
    return {
      connections,
      footpaths: buildFootpaths(lat, lon),
      stopNames: stopNamesMap,
      frequency: buildFrequency(connections, (id) => stopNamesMap.get(id) ?? id),
      segmentIndex: await loadSegmentIndex(),
    };
  })();
  return graphPromise;
}

const planQuery = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  /** Seconds since midnight. Defaults to a weekday morning peak. */
  departAt: z.coerce.number().int().min(0).max(36 * 3600).optional(),
});

export function registerPlanner(app: FastifyInstance): void {
  app.get("/stops/search", async (req, reply) => {
    const q = z.object({ q: z.string().min(2), limit: z.coerce.number().int().max(25).optional() })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });

    const stops = await prisma.stop.findMany({
      where: { name: { contains: q.data.q } },
      select: { id: true, name: true, lat: true, lon: true },
      take: q.data.limit ?? 8,
    });
    return { stops };
  });

  app.get("/plan", async (req, reply) => {
    const parsed = planQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { connections, footpaths, stopNames, frequency, segmentIndex } = await getGraph();
    const departAt = parsed.data.departAt ?? 8 * 3600 + 30 * 60;
    const nameOf = (id: string): string => stopNames.get(id) ?? id;

    const best = plan(connections, footpaths, parsed.data.from, parsed.data.to, departAt);
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
      const alt = plan(connections, footpaths, parsed.data.from, parsed.data.to, departAt, 3 * 3600, new Set([banned]));
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
        ...j,
        typicalMinutes: j.durationMinutes,
        /** What it costs on the trips that do go wrong. */
        disruptedMinutes: j.durationMinutes + j.reliability.minutesWhenDisrupted,
        legs: j.legs.map((l) => ({
          kind: l.kind, routeId: l.routeId, departAt: l.departAt, arriveAt: l.arriveAt,
          fromName: nameOf(l.fromStop), toName: nameOf(l.toStop),
        })),
      })),
      /** Stated so a single result is not mistaken for a shortlist. */
      alternativesFound: scored.length - 1,
    };
  });
}
