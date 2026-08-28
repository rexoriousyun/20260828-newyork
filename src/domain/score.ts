/**
 * M4 — segment reliability scoring.
 *
 * Implements the engine contract in docs/product/PLAN.md. Six properties are
 * non-negotiable, each traced to a principle:
 *
 *   1. Percentiles, never a mean (P-01)
 *   2. Headway gap as the metric, not vehicle lateness (P-02, D-02)
 *   3. "unknown" is a real state, never rendered as healthy (P-03)
 *   4. Terminal approaches excluded from through-rider scores (P-04, D-06)
 *   5. Zero-minute records filtered, and the filter declared (P-08, E-D04)
 *   6. Every number traceable to window and sample size (P-08)
 */

import { prisma } from "../db/client.js";

/**
 * Sample sizes below which we decline to state a distribution.
 * Pre-registered so a thin segment cannot be talked into looking confident.
 */
export const CONFIDENCE = {
  /** Enough incidents for the tail (p95) to mean something. */
  high: 30,
  /** Enough to say something, not enough to be precise about the tail. */
  low: 5,
} as const;

export type Confidence = "high" | "low" | "unknown";

export interface SegmentReliability {
  segment: {
    id: string;
    routeId: string;
    direction: string;
    fromStation: string;
    toStation: string;
    isTerminalApproach: boolean;
  };
  /**
   * How often this segment costs riders time. This is the segment-specific
   * signal: rho = 0.68 across periods, so it persists and can be ranked (D-11).
   */
  exposure: { gapMinutesPerMonth: number; incidentsPerMonth: number } | null;
  /**
   * Wait once an incident happens, in minutes.
   *
   * `basis` matters. Severity does NOT persist per segment (rho = 0.10 with only
   * 3% ties, so genuinely unstable, not a scale artifact), which means a
   * per-segment p95 would imply a precision the data cannot support. It is
   * therefore pooled across the network and labelled as such (D-11, P-08).
   */
  severity: { p50: number; p90: number; p95: number; unit: "minutes"; basis: "pooled-network" } | null;
  sample: {
    incidents: number;
    window: { start: string; end: string } | null;
    /** Stated so a reader knows what was excluded (P-08). */
    filters: string[];
  };
  causes: Array<{ code: string; description: string; share: number }>;
  confidence: Confidence;
}

export interface ScoreQuery {
  // Explicit `| undefined` so parsed query objects, where an absent field is
  // present-but-undefined, satisfy exactOptionalPropertyTypes.
  dayOfWeek?: string | undefined;
  hour?: number | undefined;
  /** Terminal approaches are excluded by default (D-06). */
  includeTerminalApproach?: boolean | undefined;
}

/** Nearest-rank percentile. Values must be sorted ascending. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) throw new Error("percentile of empty sample");
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1]!;
}

export function confidenceFor(n: number): Confidence {
  if (n >= CONFIDENCE.high) return "high";
  if (n >= CONFIDENCE.low) return "low";
  return "unknown";
}

/** Length of the observation window in months, so rates are comparable. */
let monthsCache: number | null = null;
async function observationMonths(): Promise<number> {
  if (monthsCache !== null) return monthsCache;
  const [min, max] = await Promise.all([
    prisma.delayIncident.findFirst({ where: { minDelay: { gt: 0 } }, orderBy: { occurredAt: "asc" }, select: { occurredAt: true } }),
    prisma.delayIncident.findFirst({ where: { minDelay: { gt: 0 } }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } }),
  ]);
  if (min === null || max === null) return (monthsCache = 1);
  const ms = max.occurredAt.getTime() - min.occurredAt.getTime();
  return (monthsCache = Math.max(ms / (1000 * 60 * 60 * 24 * 30.44), 1));
}

/**
 * The network-wide wait distribution, used for every segment.
 *
 * Pooling is not a shortcut. Segment-level severity fails the persistence test
 * outright, so a per-segment distribution would be noise dressed as insight.
 * Terminal approaches are excluded here too, for the same reason as everywhere
 * else (D-06).
 */
let severityCache: SegmentReliability["severity"] = null;
async function pooledSeverity(): Promise<SegmentReliability["severity"]> {
  if (severityCache !== null) return severityCache;
  const rows = await prisma.delayIncident.findMany({
    where: { minDelay: { gt: 0 }, segmentId: { not: null }, segment: { isTerminalApproach: false } },
    select: { minGap: true },
  });
  const gaps = rows.map((r) => r.minGap).sort((a, b) => a - b);
  if (gaps.length === 0) return null;
  return (severityCache = {
    p50: percentile(gaps, 50),
    p90: percentile(gaps, 90),
    p95: percentile(gaps, 95),
    unit: "minutes",
    basis: "pooled-network",
  });
}

export async function scoreSegment(
  segmentId: string,
  query: ScoreQuery = {},
): Promise<SegmentReliability | null> {
  const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
  if (segment === null) return null;

  const filters = ["minDelay > 0 (excludes zero-minute non-events, E-D04)"];
  if (!(query.includeTerminalApproach ?? false) && segment.isTerminalApproach) {
    filters.push("terminal approach — turnaround incidents are not through-rider risk (D-06)");
  }
  if (query.dayOfWeek !== undefined) filters.push(`dayOfWeek = ${query.dayOfWeek}`);
  if (query.hour !== undefined) filters.push(`hour = ${query.hour}`);

  const incidents = await prisma.delayIncident.findMany({
    where: {
      segmentId,
      minDelay: { gt: 0 },
      ...(query.dayOfWeek !== undefined ? { dayOfWeek: query.dayOfWeek } : {}),
      ...(query.hour !== undefined ? { hour: query.hour } : {}),
    },
    select: { minGap: true, code: true, occurredAt: true },
  });

  const confidence = confidenceFor(incidents.length);

  const times = incidents.map((i) => i.occurredAt.getTime());
  const window =
    times.length > 0
      ? {
          start: new Date(Math.min(...times)).toISOString().slice(0, 10),
          end: new Date(Math.max(...times)).toISOString().slice(0, 10),
        }
      : null;

  // A thin sample gets no numbers at all. Publishing off four observations is
  // the kind of precise-looking lie P-08 exists to prevent.
  const months = await observationMonths();
  const exposure =
    confidence === "unknown"
      ? null
      : {
          gapMinutesPerMonth: Number(
            (incidents.reduce((t, i) => t + i.minGap, 0) / months).toFixed(1),
          ),
          incidentsPerMonth: Number((incidents.length / months).toFixed(2)),
        };

  const severity = confidence === "unknown" ? null : await pooledSeverity();

  const counts = new Map<string, number>();
  for (const i of incidents) counts.set(i.code, (counts.get(i.code) ?? 0) + 1);

  const descriptions = new Map(
    (
      await prisma.delayCode.findMany({
        where: { mode: "subway", code: { in: [...counts.keys()] } },
      })
    ).map((c) => [c.code, c.description]),
  );

  const causes = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, n]) => ({
      code,
      description: descriptions.get(code) ?? "unknown",
      share: Number((n / incidents.length).toFixed(3)),
    }));

  return {
    segment: {
      id: segment.id,
      routeId: segment.routeId,
      direction: segment.direction,
      fromStation: segment.fromStation,
      toStation: segment.toStation,
      isTerminalApproach: segment.isTerminalApproach,
    },
    exposure,
    severity,
    sample: { incidents: incidents.length, window, filters },
    causes,
    confidence,
  };
}

/** Every segment on a route, ordered along the line, for the J-04 map. */
export async function scoreRoute(
  routeId: string,
  direction: string,
  query: ScoreQuery = {},
): Promise<SegmentReliability[]> {
  const segments = await prisma.segment.findMany({
    where: { routeId, direction },
    orderBy: { sequence: "asc" },
    select: { id: true },
  });

  const scored = await Promise.all(segments.map((s) => scoreSegment(s.id, query)));
  return scored.filter((s): s is SegmentReliability => s !== null);
}
