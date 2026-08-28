/**
 * Segment geometry — drawing segments on real streets.
 *
 * Each route+direction gets a representative shape (the longest one GTFS
 * publishes for it, since short-turn patterns produce truncated shapes). Every
 * segment on that route is then sliced out of it.
 *
 * Segments that cannot be sliced keep a null geometry and are drawn as straight
 * lines by the client. That is a visible approximation, so the rate is reported
 * rather than buried.
 */

import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { prisma } from "../db/client.js";
import { GTFS_CACHE } from "./gtfs.js";
import { sliceBetween, type Point } from "../domain/polyline.js";

function readCsv(zip: AdmZip, entry: string): Array<Record<string, string>> {
  const file = zip.getEntry(entry);
  if (!file) throw new Error(`${entry} missing from GTFS archive`);
  return parse(file.getData().toString("utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Array<Record<string, string>>;
}

export async function buildGeometry(): Promise<{ total: number; drawn: number }> {
  const zip = new AdmZip(GTFS_CACHE);

  const shapes = new Map<string, Point[]>();
  for (const row of readCsv(zip, "shapes.txt")) {
    const id = (row["shape_id"] ?? "").trim();
    const lat = Number(row["shape_pt_lat"]);
    const lon = Number(row["shape_pt_lon"]);
    if (id === "" || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const list = shapes.get(id);
    if (list === undefined) shapes.set(id, [[lon, lat]]);
    else list.push([lon, lat]);
  }

  // Every distinct shape a route uses is a candidate, not just the longest.
  //
  // A route publishes at least one shape per direction, plus short-turn and
  // detour variants. Picking a single shape means every segment travelling the
  // other way projects out of order and cannot be sliced — which capped coverage
  // at 50%, almost exactly the share of segments running the wrong way for it.
  //
  // Longest first, so a full-length pattern is tried before a truncated one.
  const byRoute = new Map<string, Point[][]>();
  const seen = new Set<string>();
  for (const t of readCsv(zip, "trips.txt")) {
    const routeId = (t["route_id"] ?? "").trim();
    const shapeId = (t["shape_id"] ?? "").trim();
    const key = `${routeId}|${shapeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const shape = shapes.get(shapeId);
    if (shape === undefined) continue;
    const list = byRoute.get(routeId);
    if (list === undefined) byRoute.set(routeId, [shape]);
    else list.push(shape);
  }
  for (const list of byRoute.values()) {
    list.sort((a, b) => b.length - a.length);
    // Beyond a handful of variants the extra candidates are near-duplicates and
    // only cost time.
    if (list.length > 12) list.length = 12;
  }

  const segments = await prisma.segment.findMany({
    select: { id: true, routeId: true, fromLat: true, fromLon: true, toLat: true, toLon: true },
  });

  let drawn = 0;
  const updates: Array<{ id: string; geometry: string }> = [];

  for (const s of segments) {
    if (s.fromLat === null || s.fromLon === null || s.toLat === null || s.toLon === null) continue;
    const candidates = byRoute.get(s.routeId);
    if (candidates === undefined) continue;

    // Prefer the tightest successful slice: a loop shape can pass the same pair
    // far apart, producing a valid but absurdly long line.
    let best: Point[] | null = null;
    for (const shape of candidates) {
      const line = sliceBetween(shape, [s.fromLon, s.fromLat], [s.toLon, s.toLat]);
      if (line === null || line.length < 2) continue;
      if (best === null || line.length < best.length) best = line;
    }
    if (best === null) continue;

    updates.push({ id: s.id, geometry: JSON.stringify(best) });
    drawn++;
  }

  for (const u of updates) {
    await prisma.segment.update({ where: { id: u.id }, data: { geometry: u.geometry } });
  }

  return { total: segments.length, drawn };
}
