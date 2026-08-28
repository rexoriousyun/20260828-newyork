import Fastify from "fastify";
import { z } from "zod";
import { scoreSegment, scoreRoute } from "../domain/score.js";
import { prisma } from "../db/client.js";

const app = Fastify({ logger: true });

const query = z.object({
  dayOfWeek: z.string().optional(),
  hour: z.coerce.number().int().min(0).max(23).optional(),
  includeTerminalApproach: z.coerce.boolean().optional(),
});

app.get("/health", async () => ({ ok: true }));

/**
 * Routes that have enough attributed data to be worth opening.
 *
 * Only ~3% of surface segments reach high confidence, so listing all 233 routes
 * equally would send most riders to an empty map. Routes are ranked by how much
 * of them we can actually speak to (P-03, P-06).
 */
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

const port = Number(process.env["PORT"] ?? 3000);
app.listen({ port, host: "0.0.0.0" }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
