import Fastify from "fastify";
import { z } from "zod";
import { scoreSegment, scoreRoute } from "../domain/score.js";
import { prisma } from "../db/client.js";
import { rankRoutes } from "../domain/route-ranking.js";
import { recencyWeight, effectiveMonths } from "../domain/score.js";
import { registerTiles } from "./tiles.js";
import { registerPlanner } from "./planner.js";
import { stationAccessMap, endpointState, isUsable } from "../domain/accessibility.js";

const app = Fastify({ logger: true });

const query = z.object({
  dayOfWeek: z.string().optional(),
  hour: z.coerce.number().int().min(0).max(23).optional(),
  includeTerminalApproach: z.coerce.boolean().optional(),
  /** Step-free routing. A filter, never a scoring weight (P-05, D-07). */
  stepFree: z.coerce.boolean().optional(),
});

/**
 * Step-free access for every station, plus the live outages behind it.
 *
 * Baseline and outage stay separate in the response: one is permanent, the
 * other may clear within the hour, and a rider deciding whether to travel needs
 * to know which they are looking at.
 */
app.get("/accessibility", async () => {
  const { states, unmatchedOutages } = await stationAccessMap();
  const all = [...states.values()];
  return {
    counts: {
      accessible: all.filter((s) => s.state === "accessible").length,
      outage: all.filter((s) => s.state === "outage").length,
      notAccessible: all.filter((s) => s.state === "not-accessible").length,
      unknown: all.filter((s) => s.state === "unknown").length,
    },
    outages: all.filter((s) => s.state === "outage"),
    notAccessible: all.filter((s) => s.state === "not-accessible").map((s) => s.station),
    /** Stations the TTC reported an outage for that we could not match. */
    unmatchedOutages,
    note: "Absence of an alert is not evidence an elevator works; the feed reports known outages only.",
  };
});

registerTiles(app);
registerPlanner(app);

app.get("/health", async () => ({ ok: true }));

/**
 * Routes that have enough attributed data to be worth opening.
 *
 * Only ~3% of surface segments reach high confidence, so listing all 233 routes
 * equally would send most riders to an empty map. Routes are ranked by how much
 * of them we can actually speak to (P-03, P-06).
 */
/** The observation window the score model normalises over. */
const WINDOW_MONTHS = 19;

/**
 * Which routes cost riders the most time, and why.
 *
 * `PR-02`: unreliability is unevenly distributed and nobody publishes where.
 * The segment map answers that one route at a time; this answers it across the
 * network, which is where `J-04` starts — a rider suspects their route is bad
 * and has nothing to compare it against.
 *
 * The cause breakdown is the "wants why" stage of that same journey, specified
 * since the research and never built until now. The feed's own words are used:
 * "NO OPERATOR AVAILABLE" is a better sentence than any category of ours.
 */
/**
 * Held after the first build. The ranking is a property of the archive, which
 * changes on ingest and not on request, and computing it scans every attributed
 * incident — two thirds of a second that no rider should pay twice.
 */
let rankingCache: unknown = null;

app.get("/routes/ranking", async () => {
  if (rankingCache !== null) return rankingCache;
  const [segments, routes, codes, latest] = await Promise.all([
    prisma.segment.findMany({ select: { id: true, routeId: true, mode: true } }),
    prisma.route.findMany({ select: { id: true, shortName: true, longName: true } }),
    prisma.delayCode.findMany({ select: { code: true, description: true } }),
    prisma.delayIncident.aggregate({ _max: { occurredAt: true } }),
  ]);
  const now = latest._max.occurredAt;
  if (now === null) return { modes: {} };

  const rows = await prisma.delayIncident.findMany({
    where: { segmentId: { not: null }, minDelay: { gt: 0 } },
    select: { segmentId: true, minGap: true, occurredAt: true, code: true },
  });

  const segById = new Map(segments.map((s) => [s.id, s]));
  const names = new Map(routes.map((r) => [r.id, r.longName || r.shortName]));
  const causes = new Map(codes.map((c) => [c.code, c.description]));
  const denominator = effectiveMonths(WINDOW_MONTHS);

  interface Acc { gap: number; measured: Set<string>; cause: Map<string, number>; mode: string }
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const seg = segById.get(r.segmentId!);
    if (seg === undefined) continue;
    let a = acc.get(seg.routeId);
    if (a === undefined) { a = { gap: 0, measured: new Set(), cause: new Map(), mode: seg.mode }; acc.set(seg.routeId, a); }
    const weighted = r.minGap * recencyWeight(r.occurredAt, now);
    a.gap += weighted;
    a.measured.add(r.segmentId!);
    a.cause.set(r.code, (a.cause.get(r.code) ?? 0) + weighted);
  }

  const segmentCount = new Map<string, number>();
  for (const s of segments) segmentCount.set(s.routeId, (segmentCount.get(s.routeId) ?? 0) + 1);

  const ranked = rankRoutes([...acc.entries()].map(([routeId, a]) => {
    const top = [...a.cause.entries()].sort((x, y) => y[1] - x[1]);
    return {
      routeId,
      mode: a.mode,
      name: names.get(routeId) ?? routeId,
      segmentCount: segmentCount.get(routeId) ?? 0,
      measuredSegments: a.measured.size,
      gapMinutesPerMonth: Math.round(a.gap / denominator),
      leadingCause: top[0] === undefined ? null : (causes.get(top[0][0]) ?? top[0][0]),
      /** Every cause on this route, so "why" is one tap rather than a query. */
      causes: top.slice(0, 5).map(([code, gap]) => ({
        code,
        cause: causes.get(code) ?? code,
        minutesPerMonth: Math.round(gap / denominator),
      })),
    };
  }));

  rankingCache = { modes: Object.fromEntries(ranked) };
  return rankingCache;
});

app.get("/routes", async () => {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ routeId: string; direction: string; mode: string; segments: number; scored: number }>
  >(`
    SELECT s.routeId,
           s.direction,
           s.mode,
           COUNT(DISTINCT s.id)                                    AS segments,
           COUNT(DISTINCT CASE WHEN d.n >= 5 THEN s.id END)        AS scored
    FROM Segment s
    LEFT JOIN (
      SELECT segmentId, COUNT(*) AS n
      FROM DelayIncident
      WHERE minDelay > 0 AND segmentId IS NOT NULL
      GROUP BY segmentId
    ) d ON d.segmentId = s.id
    GROUP BY s.routeId, s.direction, s.mode
    HAVING scored > 0
    ORDER BY scored DESC
  `);

  const routes = await prisma.route.findMany({ select: { id: true, shortName: true, longName: true } });
  const names = new Map(routes.map((r) => [r.id, r.longName || r.shortName]));

  return {
    count: rows.length,
    routes: rows.map((r) => ({
      ...r,
      segments: Number(r.segments),
      scored: Number(r.scored),
      name: names.get(r.routeId) ?? r.routeId,
    })),
  };
});

app.get("/segments", async () => {
  const segments = await prisma.segment.findMany({
    orderBy: [{ routeId: "asc" }, { direction: "asc" }, { sequence: "asc" }],
  });
  return { count: segments.length, segments };
});

app.get("/segments/:id/reliability", async (req, reply) => {
  const { id } = req.params as { id: string };
  const parsed = query.safeParse(req.query);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const result = await scoreSegment(decodeURIComponent(id), parsed.data);
  if (result === null) return reply.code(404).send({ error: "unknown segment" });
  return result;
});

app.get("/routes/:routeId/:direction/reliability", async (req, reply) => {
  const { routeId, direction } = req.params as { routeId: string; direction: string };
  const parsed = query.safeParse(req.query);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const segments = await scoreRoute(routeId, direction.toUpperCase(), parsed.data);
  if (segments.length === 0) return reply.code(404).send({ error: "unknown route or direction" });

  // Coverage is surfaced alongside the data, never left for the client to infer.
  // A segment we know nothing about must not read as a healthy one (P-03).
  const unknown = segments.filter((s) => s.confidence === "unknown").length;
  return {
    routeId,
    direction: direction.toUpperCase(),
    coverage: {
      segments: segments.length,
      scored: segments.length - unknown,
      unknown,
    },
    segments,
  };
});

/**
 * Route geometry with reliability, as GeoJSON.
 *
 * Segments carry their sliced shape so they draw on real streets. A segment with
 * no geometry falls back to a straight line client-side and says so, rather than
 * being dropped — a missing stretch of a route reads as "no problem here", the
 * failure P-03 exists to prevent.
 */
app.get("/routes/:routeId/:direction/map", async (req, reply) => {
  const { routeId, direction } = req.params as { routeId: string; direction: string };
  const parsed = query.safeParse(req.query);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const dir = direction.toUpperCase();
  const [scored, geo] = await Promise.all([
    scoreRoute(routeId, dir, parsed.data),
    prisma.segment.findMany({
      where: { routeId, direction: dir },
      select: {
        id: true, geometry: true, sequence: true,
        fromLat: true, fromLon: true, toLat: true, toLon: true,
      },
      orderBy: { sequence: "asc" },
    }),
  ]);
  if (geo.length === 0) return reply.code(404).send({ error: "unknown route or direction" });

  const byId = new Map(scored.map((s) => [s.segment.id, s]));

  // Accessibility is resolved once per request and applied as a filter, not
  // folded into any score (P-05).
  const stepFree = parsed.data.stepFree ?? false;
  const { states } = stepFree
    ? await stationAccessMap()
    : { states: new Map<string, never>() as never };

  const segmentsById = new Map(
    (await prisma.segment.findMany({
      where: { routeId, direction: dir },
      select: { id: true, fromStation: true, toStation: true },
    })).map((x) => [x.id, x]),
  );

  const features = geo.flatMap((g) => {
    const s = byId.get(g.id);
    if (s === undefined) return [];

    const drawn = g.geometry !== null;
    const coordinates: Array<[number, number]> = drawn
      ? (JSON.parse(g.geometry!) as Array<[number, number]>)
      : g.fromLon !== null && g.fromLat !== null && g.toLon !== null && g.toLat !== null
        ? [
            [g.fromLon, g.fromLat],
            [g.toLon, g.toLat],
          ]
        : [];
    if (coordinates.length < 2) return [];

    // A segment is blocked when either endpoint is a station a step-free rider
    // cannot use. "unknown" counts as blocked: absence of an alert is not
    // evidence an elevator works, and U-04 abandons us the first time we route
    // them somewhere we could not verify (P-03).
    let blockedBy: { station: string; state: string; note?: string } | null = null;
    if (stepFree) {
      const names = segmentsById.get(g.id);
      for (const name of [names?.fromStation ?? "", names?.toStation ?? ""]) {
        const st = endpointState(name, states as never);
        if (st !== null && !isUsable(st.state)) {
          blockedBy = st.note === undefined
            ? { station: st.station, state: st.state }
            : { station: st.station, state: st.state, note: st.note };
          break;
        }
      }
    }

    return [
      {
        type: "Feature" as const,
        id: g.sequence,
        geometry: { type: "LineString" as const, coordinates },
        properties: {
          segmentId: s.segment.id,
          /** Null unless step-free routing is on and an endpoint blocks it. */
          blockedBy,
          from: s.segment.fromStation,
          to: s.segment.toStation,
          confidence: s.confidence,
          gapMinutesPerMonth: s.exposure?.gapMinutesPerMonth ?? null,
          incidentsPerMonth: s.exposure?.incidentsPerMonth ?? null,
          incidents: s.sample.incidents,
          isTerminalApproach: s.segment.isTerminalApproach,
          /** False means this line is a straight approximation, not the real path. */
          drawnOnStreets: drawn,
        },
      },
    ];
  });

  const lons = features.flatMap((f) => f.geometry.coordinates.map((c) => c[0]));
  const lats = features.flatMap((f) => f.geometry.coordinates.map((c) => c[1]));

  return {
    type: "FeatureCollection",
    bbox: lons.length > 0
      ? [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
      : null,
    coverage: {
      segments: features.length,
      scored: features.filter((f) => f.properties.confidence !== "unknown").length,
      approximated: features.filter((f) => !f.properties.drawnOnStreets).length,
    },
    features,
  };
});

const port = Number(process.env["PORT"] ?? 3000);
app.listen({ port, host: "0.0.0.0" }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
