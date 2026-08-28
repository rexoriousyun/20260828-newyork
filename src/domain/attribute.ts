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
