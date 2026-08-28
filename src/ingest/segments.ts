/**
 * M3 — segment construction.
 *
 * Decomposes each subway line into the inter-stop segments a rider traverses.
 * Station order comes from GTFS trip patterns rather than a hardcoded list, so
 * the segment set follows the network when it changes.
 *
 * Only stops.txt-scale data is held in memory; stop_times.txt is ~207MB and is
 * streamed from disk.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { prisma } from "../db/client.js";
import { GTFS_CACHE } from "./gtfs.js";
import { stationFromPlatform, directionFromPlatform } from "../domain/stations.js";

const SUBWAY_ROUTES = ["1", "2", "4"] as const;
const STOP_TIMES_PATH = "data/raw/stop_times.txt";

interface StopMeta {
  station: string;
  direction: "N" | "S" | "E" | "W" | null;
  lat: number;
  lon: number;
}

/** Extracts stop_times.txt to disk so it can be streamed rather than buffered. */
function extractStopTimes(zip: AdmZip): void {
  const entry = zip.getEntry("stop_times.txt");
  if (!entry) throw new Error("stop_times.txt missing from GTFS archive");
  zip.extractEntryTo(entry, "data/raw", false, true);
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

interface RawSegment {
  routeId: string;
  direction: string;
  fromStation: string;
  toStation: string;
  sequence: number;
}

/**
 * Walks every subway trip and emits the consecutive station pairs it traverses.
 *
 * Direction is taken from the *arriving* platform of each pair, not from the
 * trip as a whole. Line 1 is a U: one trip runs southbound down the west leg to
 * Union, then northbound up the Yonge leg. Labelling the whole trip by its first
 * platform collapses the two legs into one direction and leaves the other with
 * only the stations it happens to start from — which silently drops half the
 * line's segments.
 */
async function buildSegmentSet(
  subwayTrips: Map<string, string>,
  stopMeta: Map<string, StopMeta>,
): Promise<{ segments: RawSegment[]; terminals: Set<string> }> {
  const perTrip = new Map<string, Array<{ seq: number; stopId: string }>>();

  const rl = createInterface({
    input: createReadStream(STOP_TIMES_PATH),
    crlfDelay: Infinity,
  });

  let header: string[] | null = null;
  for await (const line of rl) {
    if (header === null) {
      header = line.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      continue;
    }
    const cols = line.split(",");
    const tripId = cols[header.indexOf("trip_id")]?.trim();
    if (tripId === undefined || !subwayTrips.has(tripId)) continue;

    const stopId = cols[header.indexOf("stop_id")]?.trim();
    const seq = Number(cols[header.indexOf("stop_sequence")]);
    if (stopId === undefined || !Number.isFinite(seq)) continue;

    let list = perTrip.get(tripId);
    if (list === undefined) {
      list = [];
      perTrip.set(tripId, list);
    }
    list.push({ seq, stopId });
  }

  const seen = new Map<string, RawSegment>();
  const terminals = new Set<string>();
  /** Longest trip per route, used only to give segments a stable ordering. */
  const ordering = new Map<string, number>();

  for (const [tripId, stops] of perTrip) {
    const routeId = subwayTrips.get(tripId)!;
    stops.sort((a, b) => a.seq - b.seq);

    const walk = stops
      .map((s) => stopMeta.get(s.stopId))
      .filter((m): m is StopMeta => m !== undefined);
    if (walk.length < 2) continue;

    terminals.add(walk.at(-1)!.station);

    // Direction comes from the DEPARTING platform, not the arriving one.
    //
    // A platform is labelled with the direction its trains travel, so the stop a
    // train leaves tells you where it is heading. The arriving platform does not:
    // Union is Line 1's U-turn pivot and every Union platform is labelled
    // northbound, so a southbound train arriving from King would be recorded as
    // northbound — putting "KING -> UNION" on the northbound list.
    //
    // Terminal platforms are often named plainly ("Kipling Station") with no
    // direction at all, so the approach into a terminal would otherwise be
    // dropped, losing exactly the segments D-06 needs to flag. A trip does not
    // reverse mid-run, so an undirected platform inherits the direction in force.
    let running: string | null = null;

    for (let i = 0; i < walk.length - 1; i++) {
      const from = walk[i]!;
      const to = walk[i + 1]!;
      const direction: string | null = from.direction ?? to.direction ?? running;
      running = direction ?? running;
      if (from.station === to.station || direction === null) continue;

      const key = `${routeId}:${direction}:${from.station}->${to.station}`;
      if (!ordering.has(key)) ordering.set(key, ordering.size);
      if (!seen.has(key)) {
        seen.set(key, {
          routeId,
          direction,
          fromStation: from.station,
          toStation: to.station,
          sequence: 0,
        });
      }
    }
  }

  // Sequence within each route+direction, ordered by first appearance.
  const grouped = new Map<string, RawSegment[]>();
  for (const [key, seg] of seen) {
    const g = `${seg.routeId}:${seg.direction}`;
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(seg);
    seg.sequence = ordering.get(key)!;
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.sequence - b.sequence);
    list.forEach((seg, i) => {
      seg.sequence = i;
    });
  }

  return { segments: [...seen.values()], terminals };
}

export async function buildSegments(): Promise<{ segments: number; patterns: number }> {
  const zip = new AdmZip(GTFS_CACHE);
  extractStopTimes(zip);

  const stops = readCsv(zip, "stops.txt");
  const stopMeta = new Map<string, StopMeta>();
  for (const s of stops) {
    const name = (s["stop_name"] ?? "").trim();
    stopMeta.set((s["stop_id"] ?? "").trim(), {
      station: stationFromPlatform(name),
      direction: directionFromPlatform(name),
      lat: Number(s["stop_lat"]),
      lon: Number(s["stop_lon"]),
    });
  }

  const subwayRoutes = new Set<string>(SUBWAY_ROUTES);
  const subwayTrips = new Map<string, string>();
  for (const t of readCsv(zip, "trips.txt")) {
    const routeId = (t["route_id"] ?? "").trim();
    if (subwayRoutes.has(routeId)) subwayTrips.set((t["trip_id"] ?? "").trim(), routeId);
  }

  const { segments: raw, terminals } = await buildSegmentSet(subwayTrips, stopMeta);

  // Coordinates are per station, taken from any platform serving it.
  const coords = new Map<string, { lat: number; lon: number }>();
  for (const meta of stopMeta.values()) {
    if (!coords.has(meta.station)) coords.set(meta.station, { lat: meta.lat, lon: meta.lon });
  }

  const segments = raw.map((s) => ({
    id: `${s.routeId}:${s.direction}:${s.fromStation}->${s.toStation}`,
    routeId: s.routeId,
    direction: s.direction,
    fromStation: s.fromStation,
    toStation: s.toStation,
    sequence: s.sequence,
    fromLat: coords.get(s.fromStation)?.lat ?? null,
    fromLon: coords.get(s.fromStation)?.lon ?? null,
    toLat: coords.get(s.toStation)?.lat ?? null,
    toLon: coords.get(s.toStation)?.lon ?? null,
    isTerminalApproach: terminals.has(s.toStation),
  }));

  await prisma.delayIncident.updateMany({ data: { segmentId: null } });
  await prisma.segment.deleteMany();
  await prisma.segment.createMany({ data: segments });

  const patterns = new Set(segments.map((s) => `${s.routeId}:${s.direction}`));
  return { segments: segments.length, patterns: patterns.size };
}
