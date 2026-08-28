/**
 * The connection set a trip planner scans.
 *
 * A *connection* is one vehicle moving between two consecutive stops: leave
 * stop A at time X, arrive stop B at time Y, aboard trip T. Every schedule-based
 * journey is a sequence of these plus walks between them.
 *
 * Held in typed arrays rather than objects. A weekday is ~1.2M connections; as
 * objects that is hundreds of megabytes and a garbage-collection problem, and
 * the scan touches every field on every element.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { GTFS_CACHE } from "../ingest/gtfs.js";

const STOP_TIMES_PATH = "data/raw/stop_times.txt";

export interface ConnectionSet {
  /** Sorted ascending by departure time — the scan depends on this order. */
  depTime: Int32Array;
  arrTime: Int32Array;
  fromStop: Int32Array;
  toStop: Int32Array;
  trip: Int32Array;
  count: number;
  /** Dense integer ids, because typed arrays cannot hold GTFS's string ids. */
  stopIds: string[];
  stopIndex: Map<string, number>;
  tripIds: string[];
  tripRoute: string[];
}

/**
 * Seconds since midnight. GTFS times legitimately exceed 24:00:00 for trips
 * that run past midnight, so this must not wrap.
 */
export function parseGtfsTime(value: string): number {
  const m = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (m === null) return -1;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function readCsv(zip: AdmZip, entry: string): Array<Record<string, string>> {
  const file = zip.getEntry(entry);
  if (!file) throw new Error(`${entry} missing from GTFS archive`);
  return parse(file.getData().toString("utf8"), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<Record<string, string>>;
}

/**
 * Builds the connection set for one GTFS service id.
 *
 * A service id is a calendar pattern — "1" is the weekday schedule. Scanning all
 * services at once would put Sunday trips in a Tuesday journey.
 */
export async function buildConnections(serviceId: string): Promise<ConnectionSet> {
  const zip = new AdmZip(GTFS_CACHE);

  const tripRouteById = new Map<string, string>();
  for (const t of readCsv(zip, "trips.txt")) {
    if ((t["service_id"] ?? "").trim() !== serviceId) continue;
    tripRouteById.set((t["trip_id"] ?? "").trim(), (t["route_id"] ?? "").trim());
  }

  const stopIndex = new Map<string, number>();
  const stopIds: string[] = [];
  const tripIndex = new Map<string, number>();
  const tripIds: string[] = [];
  const tripRoute: string[] = [];

  const internStop = (id: string): number => {
    const existing = stopIndex.get(id);
    if (existing !== undefined) return existing;
    stopIndex.set(id, stopIds.length);
    stopIds.push(id);
    return stopIds.length - 1;
  };

  // Grown in chunks: the final count is not known until the file is read, and
  // resizing a typed array per row would dominate the runtime.
  let cap = 1 << 21;
  let dep = new Int32Array(cap);
  let arr = new Int32Array(cap);
  let from = new Int32Array(cap);
  let to = new Int32Array(cap);
  let tr = new Int32Array(cap);
  let n = 0;

  const grow = (): void => {
    cap *= 2;
    const g = (src: Int32Array): Int32Array<ArrayBuffer> => {
      const next = new Int32Array(cap);
      next.set(src);
      return next;
    };
    dep = g(dep); arr = g(arr); from = g(from); to = g(to); tr = g(tr);
  };

  const rl = createInterface({ input: createReadStream(STOP_TIMES_PATH), crlfDelay: Infinity });
  let header: string[] | null = null;
  let iTrip = -1, iArr = -1, iDep = -1, iStop = -1;
  let currentTrip: string | null = null;
  let currentTripIdx = -1;
  let prevStop = -1;
  let prevDep = -1;

  for await (const line of rl) {
    if (header === null) {
      header = line.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      iTrip = header.indexOf("trip_id");
      iArr = header.indexOf("arrival_time");
      iDep = header.indexOf("departure_time");
      iStop = header.indexOf("stop_id");
      continue;
    }
    const cols = line.split(",");
    const tripId = cols[iTrip]?.trim() ?? "";

    if (tripId !== currentTrip) {
      currentTrip = tripId;
      prevStop = -1;
      prevDep = -1;
      const route = tripRouteById.get(tripId);
      if (route === undefined) {
        currentTripIdx = -1;
      } else {
        let idx = tripIndex.get(tripId);
        if (idx === undefined) {
          idx = tripIds.length;
          tripIndex.set(tripId, idx);
          tripIds.push(tripId);
          tripRoute.push(route);
        }
        currentTripIdx = idx;
      }
    }
    if (currentTripIdx === -1) continue;

    const stop = internStop(cols[iStop]?.trim() ?? "");
    const arrive = parseGtfsTime(cols[iArr] ?? "");
    const depart = parseGtfsTime(cols[iDep] ?? "");
    if (arrive < 0 || depart < 0) { prevStop = -1; continue; }

    if (prevStop !== -1 && arrive >= prevDep) {
      if (n === cap) grow();
      dep[n] = prevDep;
      arr[n] = arrive;
      from[n] = prevStop;
      to[n] = stop;
      tr[n] = currentTripIdx;
      n++;
    }
    prevStop = stop;
    prevDep = depart;
  }

  // Sort by departure time. Indices are sorted, then the columns permuted,
  // which keeps the five arrays aligned without materialising row objects.
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const orderArr = Array.from(order);
  orderArr.sort((a, b) => dep[a]! - dep[b]!);

  const sortedDep = new Int32Array(n);
  const sortedArr = new Int32Array(n);
  const sortedFrom = new Int32Array(n);
  const sortedTo = new Int32Array(n);
  const sortedTrip = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const j = orderArr[i]!;
    sortedDep[i] = dep[j]!;
    sortedArr[i] = arr[j]!;
    sortedFrom[i] = from[j]!;
    sortedTo[i] = to[j]!;
    sortedTrip[i] = tr[j]!;
  }

  return {
    depTime: sortedDep, arrTime: sortedArr,
    fromStop: sortedFrom, toStop: sortedTo, trip: sortedTrip,
    count: n, stopIds, stopIndex, tripIds, tripRoute,
  };
}
