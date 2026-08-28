/**
 * Surface segment construction — the bus and streetcar half of M3.
 *
 * D-04 makes buses the product, so a segment map covering only the subway would
 * not be shippable. Surface segments are built the same way as subway ones, with
 * two differences: they key on GTFS stop ids rather than station names, and
 * their direction is computed from geometry because GTFS labels surface trips
 * with an opaque direction_id that varies by route (see domain/bearing.ts).
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { prisma } from "../db/client.js";
import { GTFS_CACHE } from "./gtfs.js";
import { segmentCompass } from "../domain/bearing.js";

const STOP_TIMES_PATH = "data/raw/stop_times.txt";

interface StopPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

function readCsv(zip: AdmZip, entry: string): Array<Record<string, string>> {
  const file = zip.getEntry(entry);
  if (!file) throw new Error(`${entry} missing from GTFS archive`);
  return parse(file.getData().toString("utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Array<Record<string, string>>;
}

export async function buildSurfaceSegments(): Promise<{ segments: number; routes: number }> {
  const zip = new AdmZip(GTFS_CACHE);

  const stops = new Map<string, StopPoint>();
  for (const s of readCsv(zip, "stops.txt")) {
    const id = (s["stop_id"] ?? "").trim();
    const lat = Number(s["stop_lat"]);
    const lon = Number(s["stop_lon"]);
    if (id !== "" && Number.isFinite(lat) && Number.isFinite(lon)) {
      stops.set(id, { id, name: (s["stop_name"] ?? "").trim(), lat, lon });
    }
  }

  // route_type 0 = streetcar, 3 = bus.
  const surfaceRoutes = new Map<string, string>();
  for (const r of readCsv(zip, "routes.txt")) {
    const type = Number(r["route_type"] ?? -1);
    if (type === 0 || type === 3) {
      surfaceRoutes.set((r["route_id"] ?? "").trim(), (r["route_short_name"] ?? "").trim());
    }
  }

  const tripRoute = new Map<string, string>();
  for (const t of readCsv(zip, "trips.txt")) {
    const routeId = (t["route_id"] ?? "").trim();
    if (surfaceRoutes.has(routeId)) tripRoute.set((t["trip_id"] ?? "").trim(), routeId);
  }

  // Walk stop_times once, buffering a trip at a time.
  //
  // Direction is taken from the trip's overall heading (first stop to last), not
  // from each pair's own bearing. The published `Bound` describes where the
  // vehicle is going, so a segment that happens to jog north on an eastbound
  // route is still eastbound to the rider and to the delay record. Scoring it
  // "N" makes it unmatchable.
  const pairs = new Map<
    string,
    { routeId: string; from: StopPoint; to: StopPoint; direction: string }
  >();

  const rl = createInterface({ input: createReadStream(STOP_TIMES_PATH), crlfDelay: Infinity });
  let header: string[] | null = null;
  let tripIdx = -1;
  let stopIdx = -1;
  let currentTrip: string | null = null;
  let buffer: StopPoint[] = [];

  const flush = (): void => {
    if (currentTrip === null || buffer.length < 2) return;
    const routeId = tripRoute.get(currentTrip);
    if (routeId === undefined) return;

    const first = buffer[0]!;
    const last = buffer.at(-1)!;
    const direction = segmentCompass(first.lat, first.lon, last.lat, last.lon);

    for (let i = 0; i < buffer.length - 1; i++) {
      const from = buffer[i]!;
      const to = buffer[i + 1]!;
      if (from.id === to.id) continue;
      const key = `${routeId}|${direction}|${from.id}|${to.id}`;
      if (!pairs.has(key)) pairs.set(key, { routeId, from, to, direction });
    }
  };

  for await (const line of rl) {
    if (header === null) {
      header = line.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      tripIdx = header.indexOf("trip_id");
      stopIdx = header.indexOf("stop_id");
      continue;
    }
    const cols = line.split(",");
    const tripId = cols[tripIdx]?.trim();
    if (tripId === undefined) continue;

    if (tripId !== currentTrip) {
      flush();
      currentTrip = tripId;
      buffer = [];
    }
    if (!tripRoute.has(tripId)) continue;

    const stop = stops.get(cols[stopIdx]?.trim() ?? "");
    if (stop !== undefined) buffer.push(stop);
  }
  flush();

  const segments = [...pairs.values()].map(({ routeId, from, to, direction }) => {
    return {
      id: `${routeId}:${direction}:${from.id}->${to.id}`,
      mode: "bus",
      routeId,
      direction,
      fromStation: from.name,
      toStation: to.name,
      fromStopId: from.id,
      toStopId: to.id,
      sequence: 0,
      fromLat: from.lat,
      fromLon: from.lon,
      toLat: to.lat,
      toLon: to.lon,
      isTerminalApproach: false,
    };
  });

  await prisma.segment.deleteMany({ where: { mode: { not: "subway" } } });
  for (let i = 0; i < segments.length; i += 1000) {
    await prisma.segment.createMany({ data: segments.slice(i, i + 1000) });
  }

  return { segments: segments.length, routes: surfaceRoutes.size };
}
