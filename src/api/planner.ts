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
import { plan } from "../domain/csa.js";

/** GTFS service id for the weekday schedule. */
const WEEKDAY_SERVICE = "1";

interface Graph {
  connections: ConnectionSet;
  footpaths: Footpaths;
  stopNames: Map<string, string>;
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
    return {
      connections,
      footpaths: buildFootpaths(lat, lon),
      stopNames: new Map(stops.map((s) => [s.id, s.name])),
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

    const { connections, footpaths, stopNames } = await getGraph();
    const departAt = parsed.data.departAt ?? 8 * 3600 + 30 * 60;

    const journey = plan(connections, footpaths, parsed.data.from, parsed.data.to, departAt);
    if (journey === null) {
      // A failed plan is a real answer, not an error: no service in the window
      // is exactly what a rider at 3am needs to be told.
      return {
        journey: null,
        reason: "No journey found within 3 hours of the requested departure.",
      };
    }

    return {
      journey: {
        ...journey,
        durationMinutes: Math.round((journey.arriveAt - journey.departAt) / 60),
        legs: journey.legs.map((l) => ({
          ...l,
          fromName: stopNames.get(l.fromStop) ?? l.fromStop,
          toName: stopNames.get(l.toStop) ?? l.toStop,
        })),
      },
    };
  });
}
