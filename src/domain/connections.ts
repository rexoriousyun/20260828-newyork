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
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
/**
 * The parsed connection set, cached as raw buffers.
 *
 * Parsing `stop_times.txt` is **74% of the entire cold start** (E-D25) — 13.9 s
 * of a 18.8 s build, spent reading 207 MB of CSV to produce five typed arrays
 * that never change between deploys. Writing them out once and reading them
 * back turns that into a file read.
 *
 * It also removes `stop_times.txt` from the runtime image entirely. That single
 * file is 207 MB of the ~298 MB the app has to ship.
 */
const CONNECTIONS_CACHE = "data/connections.bin";

const MAGIC = 0x54544343; // "TTCC"
const FORMAT_VERSION = 1;

interface CacheHeader {
  version: number;
  serviceId: string;
  /** Content hash of the archive this was built from — see `readCache`. */
  source: string;
  count: number;
  stopIds: string[];
  tripIds: string[];
  tripRoute: string[];
}

/**
 * Which feed a cache was built from, by content.
 *
 * **Not mtime.** The obvious identity is size and modification time, and it is
 * wrong here: a `COPY` in a Dockerfile, a git checkout and an `rsync` all
 * preserve the bytes and change the timestamp. The cache would be silently
 * refused in exactly the environment it exists for, and the only symptom would
 * be a deploy that boots five seconds slower — nobody would notice, and the
 * 207 MB of CSV would have to stay in the image to make the fallback possible.
 *
 * Hashing the whole 36 MB archive costs ~34 ms, once, against the 13.9 s it
 * protects. It is also the honest test: the question is whether the schedule
 * changed, and only the bytes answer that.
 */
async function sourceIdentity(): Promise<string> {
  return createHash("sha256").update(await readFile(GTFS_CACHE)).digest("hex");
}

/**
 * Read the cache, or null if there is not a usable one.
 *
 * **A stale cache is refused, never repaired.** If the GTFS archive has changed
 * since this was written, the cached connections describe last month's
 * schedule — and a planner quietly routing riders on a retired timetable is
 * exactly the kind of invisible wrongness `P-03` exists to prevent. Version,
 * service id and the archive's own size and mtime all have to match; anything
 * else falls back to parsing, which is slow and correct.
 */
async function readCache(serviceId: string): Promise<ConnectionSet | null> {
  let buf: Buffer;
  try {
    buf = await readFile(CONNECTIONS_CACHE);
  } catch {
    return null;
  }
  if (buf.length < 12 || buf.readUInt32BE(0) !== MAGIC) return null;

  const headerLength = buf.readUInt32BE(8);
  if (buf.length < 12 + headerLength) return null;

  let header: CacheHeader;
  try {
    header = JSON.parse(buf.subarray(12, 12 + headerLength).toString("utf8")) as CacheHeader;
  } catch {
    return null;
  }
  if (header.version !== FORMAT_VERSION || header.serviceId !== serviceId) return null;

  if (header.source !== await sourceIdentity()) return null;

  const { count } = header;
  const bytes = count * 4;
  let offset = 12 + headerLength;
  if (buf.length < offset + bytes * 5) return null;

  // Copied rather than viewed onto the file buffer: `subarray` shares memory,
  // so five views would pin all 25 MB of it alive for the life of the process
  // on top of the arrays themselves.
  const column = (): Int32Array => {
    const out = new Int32Array(count);
    Buffer.from(out.buffer).set(buf.subarray(offset, offset + bytes));
    offset += bytes;
    return out;
  };

  const depTime = column(), arrTime = column();
  const fromStop = column(), toStop = column(), trip = column();

  const stopIndex = new Map<string, number>();
  for (let i = 0; i < header.stopIds.length; i++) stopIndex.set(header.stopIds[i]!, i);

  return {
    depTime, arrTime, fromStop, toStop, trip, count,
    stopIds: header.stopIds, stopIndex,
    tripIds: header.tripIds, tripRoute: header.tripRoute,
  };
}

/**
 * Write the cache. Called by `npm run precompute`, after ingestion.
 *
 * Little-endian is assumed on both ends because it is written and read by the
 * same build on the same architecture, and the file is a build artifact rather
 * than something shipped between machines.
 */
export async function writeConnectionCache(c: ConnectionSet, serviceId: string): Promise<number> {
  const header: CacheHeader = {
    version: FORMAT_VERSION,
    serviceId,
    source: await sourceIdentity(),
    count: c.count,
    stopIds: c.stopIds,
    tripIds: c.tripIds,
    tripRoute: c.tripRoute,
  };
  const headerBuf = Buffer.from(JSON.stringify(header), "utf8");
  const prelude = Buffer.alloc(12);
  prelude.writeUInt32BE(MAGIC, 0);
  prelude.writeUInt32BE(FORMAT_VERSION, 4);
  prelude.writeUInt32BE(headerBuf.length, 8);

  const cols = [c.depTime, c.arrTime, c.fromStop, c.toStop, c.trip].map((a) =>
    Buffer.from(a.buffer, a.byteOffset, c.count * 4));

  const out = Buffer.concat([prelude, headerBuf, ...cols]);
  await writeFile(CONNECTIONS_CACHE, out);
  return out.length;
}

/**
 * The connection set for one service id, from the cache when it is current.
 *
 * Every caller goes through here — planner, audits, benchmark — so none of them
 * has to know whether a cache exists.
 */
export async function loadConnections(serviceId: string): Promise<ConnectionSet> {
  const cached = await readCache(serviceId);
  if (cached !== null) return cached;
  return parseConnections(serviceId);
}

export async function parseConnections(serviceId: string): Promise<ConnectionSet> {
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
