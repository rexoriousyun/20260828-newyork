/**
 * M3 — attributing point-logged incidents to segments.
 *
 * The TTC logs an incident against a single station, but riders experience it
 * across a stretch of track. D-10 resolves this: an incident logged at station X
 * heading in direction D is attributed to the segment *arriving* at X in D —
 * the approach a through-rider is sitting on when the delay bites.
 *
 * Records we cannot place are left unattributed rather than guessed at. An
 * unattributed incident is visible as missing coverage; a mis-attributed one is
 * invisible and wrong (P-03, P-08).
 */

import { prisma } from "../db/client.js";
import { parseSubwayLocation, resolveStation, LINE_TO_ROUTE } from "./stations.js";
import { nearestByBound, type Compass } from "./bearing.js";
import {
  buildSurfaceIndex,
  resolveSurfaceLocation,
  routeShortName,
} from "./surface-resolver.js";

export interface AttributionReport {
  considered: number;
  attributed: number;
  nonRevenue: number;
  unknownDirection: number;
  unresolvedStation: number;
  noMatchingSegment: number;
}

export async function attributeSubwayIncidents(): Promise<AttributionReport> {
  const segments = await prisma.segment.findMany();
  const knownStations = new Set(segments.flatMap((s) => [s.fromStation, s.toStation]));

  /** Segment keyed by arrival: route|direction|toStation. */
  const byArrival = new Map<string, string>();
  /** Segment keyed by explicit pair, for "UNION TO ST ANDREW" style records. */
  const byPair = new Map<string, string>();
  for (const s of segments) {
    byArrival.set(`${s.routeId}|${s.direction}|${s.toStation}`, s.id);
    byPair.set(`${s.routeId}|${s.fromStation}|${s.toStation}`, s.id);
  }

  const incidents = await prisma.delayIncident.findMany({
    where: { mode: "subway" },
    select: { id: true, locationRaw: true, lineRaw: true, bound: true },
  });

  const report: AttributionReport = {
    considered: incidents.length,
    attributed: 0,
    nonRevenue: 0,
    unknownDirection: 0,
    unresolvedStation: 0,
    noMatchingSegment: 0,
  };

  const updates: Array<{ id: number; segmentId: string }> = [];

  for (const incident of incidents) {
    const routeId = LINE_TO_ROUTE[incident.lineRaw.trim().toUpperCase()];
    if (routeId === undefined) {
      report.noMatchingSegment++;
      continue;
    }

    const parsed = parseSubwayLocation(incident.locationRaw);

    if (parsed.kind === "non-revenue") {
      report.nonRevenue++;
      continue;
    }

    if (parsed.kind === "segment") {
      const from = resolveStation(parsed.from, knownStations);
      const to = resolveStation(parsed.to, knownStations);
      if (from === null || to === null) {
        report.unresolvedStation++;
        continue;
      }
      // Direction is implied by the ordering of the pair, so try both ways round.
      const id = byPair.get(`${routeId}|${from}|${to}`) ?? byPair.get(`${routeId}|${to}|${from}`);
      if (id === undefined) {
        report.noMatchingSegment++;
        continue;
      }
      updates.push({ id: incident.id, segmentId: id });
      report.attributed++;
      continue;
    }

    const bound = (incident.bound ?? "").trim().toUpperCase();
    if (!["N", "S", "E", "W"].includes(bound)) {
      // Without a direction we cannot know which approach the rider was on.
      report.unknownDirection++;
      continue;
    }

    const station = resolveStation(parsed.station, knownStations);
    if (station === null) {
      report.unresolvedStation++;
      continue;
    }

    const id = byArrival.get(`${routeId}|${bound}|${station}`);
    if (id === undefined) {
      // Legitimately happens at the first station of a direction, which has no
      // approach segment.
      report.noMatchingSegment++;
      continue;
    }

    updates.push({ id: incident.id, segmentId: id });
    report.attributed++;
  }

  // Grouping by segment keeps this to a few hundred statements rather than 43k.
  const bySegment = new Map<string, number[]>();
  for (const u of updates) {
    let ids = bySegment.get(u.segmentId);
    if (ids === undefined) {
      ids = [];
      bySegment.set(u.segmentId, ids);
    }
    ids.push(u.id);
  }
  for (const [segmentId, ids] of bySegment) {
    await prisma.delayIncident.updateMany({ where: { id: { in: ids } }, data: { segmentId } });
  }

  return report;
}

/**
 * Attributes surface incidents to segments.
 *
 * Same rule as the subway (D-10): the incident lands on the segment arriving at
 * the resolved stop, in the direction the vehicle was travelling. Direction is
 * matched against the segment's geometric bearing, since the published `Bound`
 * is a compass letter while GTFS uses an opaque direction_id.
 */
export async function attributeSurfaceIncidents(): Promise<AttributionReport> {
  const index = await buildSurfaceIndex();

  const routes = await prisma.route.findMany({ select: { id: true, shortName: true } });
  const routeByShortName = new Map(routes.map((r) => [r.shortName, r.id]));

  const segments = await prisma.segment.findMany({
    where: { mode: { not: "subway" } },
    select: { id: true, routeId: true, direction: true, toStopId: true },
  });
  // Candidates are grouped by route and stop, not by route/direction/stop, so
  // the bound can be matched by angle rather than by exact letter.
  const byArrival = new Map<string, Array<{ direction: Compass; value: string }>>();
  for (const s of segments) {
    if (s.toStopId === null) continue;
    const key = `${s.routeId}|${s.toStopId}`;
    const list = byArrival.get(key);
    const entry = { direction: s.direction as Compass, value: s.id };
    if (list === undefined) byArrival.set(key, [entry]);
    else list.push(entry);
  }

  const incidents = await prisma.delayIncident.findMany({
    where: { mode: { in: ["bus", "streetcar"] } },
    select: { id: true, locationRaw: true, lineRaw: true, bound: true },
  });

  const report: AttributionReport = {
    considered: incidents.length,
    attributed: 0,
    nonRevenue: 0,
    unknownDirection: 0,
    unresolvedStation: 0,
    noMatchingSegment: 0,
  };
  const updates: Array<{ id: number; segmentId: string }> = [];

  for (const incident of incidents) {
    const resolution = resolveSurfaceLocation(incident.locationRaw, index);
    if (resolution.kind === "excluded") {
      report.nonRevenue++;
      continue;
    }
    if (resolution.kind === "unresolved") {
      report.unresolvedStation++;
      continue;
    }

    const short = routeShortName(incident.lineRaw);
    const routeId = short === null ? undefined : routeByShortName.get(short);
    if (routeId === undefined) {
      report.noMatchingSegment++;
      continue;
    }

    const bound = (incident.bound ?? "").trim().toUpperCase();
    if (!["N", "S", "E", "W"].includes(bound)) {
      report.unknownDirection++;
      continue;
    }

    // Try every stop at the resolved location; the route serves exactly one of them.
    let segmentId: string | null = null;
    for (const stopId of resolution.stopIds) {
      const candidates = byArrival.get(`${routeId}|${stopId}`);
      if (candidates === undefined) continue;
      segmentId = nearestByBound(bound as Compass, candidates);
      if (segmentId !== null) break;
    }
    if (segmentId === null) {
      report.noMatchingSegment++;
      continue;
    }
    updates.push({ id: incident.id, segmentId });
    report.attributed++;
  }

  const bySegment = new Map<string, number[]>();
  for (const u of updates) {
    const ids = bySegment.get(u.segmentId) ?? [];
    ids.push(u.id);
    bySegment.set(u.segmentId, ids);
  }
  for (const [segmentId, ids] of bySegment) {
    for (let i = 0; i < ids.length; i += 500) {
      await prisma.delayIncident.updateMany({
        where: { id: { in: ids.slice(i, i + 500) } },
        data: { segmentId },
      });
    }
  }

  return report;
}
