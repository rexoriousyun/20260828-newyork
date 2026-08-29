/**
 * What a typical trip looks like, so a rider can tell whether theirs is bad.
 *
 * "Goes wrong about 1 trip in 181" is an analyst's number until there is
 * something to compare it with — the complaint Q-C raises against our whole
 * unit vocabulary. A percentile against comparable trips turns it into a
 * judgement a rider can act on without learning what the number means.
 *
 * **Comparable means the same length.** A 70-minute trip crosses more stretches
 * than a 20-minute one and therefore has more chances to meet an incident;
 * ranking them against each other would tell a rider that long trips are badly
 * run, which is not a fact about the routes they chose. The reference class is
 * trips of similar duration.
 *
 * **The reference class approximates trips people take, not trips that exist.**
 * We have no ridership data. Sampling stops uniformly ranked a normal downtown
 * hop below 99% of comparable trips, because the reference filled with quiet
 * suburban stops nobody starts from — a real answer to the wrong question.
 * Stops are therefore drawn in proportion to the service that runs there, which
 * is the best ridership proxy in the data: the TTC puts buses where people are.
 * It is still a proxy, and the wording on screen says "trips this long" rather
 * than claiming to know what is typical for a person.
 *
 * Written to a table the API loads at startup, so a plan request never pays for
 * this. Regenerate with `npm run benchmark` after an ingest.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { prisma, disconnect } from "../db/client.js";
import { buildConnections } from "../domain/connections.js";
import { buildFootpaths } from "../domain/footpaths.js";
import { buildFrequency } from "../domain/frequency.js";
import { plan } from "../domain/csa.js";
import { scoreJourney, buildSegmentIndex } from "../domain/itinerary.js";
import { BENCHMARK_PATH, DURATION_BUCKETS, MIN_COMPARABLE_COVERAGE, bucketFor, type BenchmarkTable } from "./table.js";

const WEEKDAY_SERVICE = "1";

/**
 * One departure per band the service covers, sampled round-robin.
 *
 * A single sample time would give the band view an am-peak reference for every
 * trip, so a 5pm plan would be ranked against a different measurement — the
 * exact error the time-of-day toggle exists to avoid (D-27). Night is left out:
 * only weekday service is loaded, and 34 segments network-wide carry enough
 * night exposure to condition on.
 */
const DEPART_TIMES = [7 * 3600 + 30 * 60, 12 * 3600, 17 * 3600, 21 * 3600];

/** Enough for stable fifths inside each duration/band cell. */
const TARGET_JOURNEYS = 2400;
const MAX_ATTEMPTS = 90000;

/** A bucket needs this many trips before it is allowed to be a reference. */
const MIN_PER_BUCKET = 25;

/**
 * Both sides of the comparison must be measured to the same standard.
 *
 * The first build ignored this and ranked every real trip in the worst tenth of
 * its class. The reason was not that Toronto's real trips are bad: the sampled
 * reference had a **median coverage of 0.23**, so three-quarters of a typical
 * reference trip was unmeasured and its risk came out near zero. Comparing a
 * well-covered trip against that measures how much data we hold, not how the
 * routes run — absence of data reading as good news (P-03), one level up from
 * where that rule is usually applied.
 */
const MIN_COVERAGE = MIN_COMPARABLE_COVERAGE;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  const connections = await buildConnections(WEEKDAY_SERVICE);
  const stops = await prisma.stop.findMany({ select: { id: true, name: true, lat: true, lon: true } });
  const byId = new Map(stops.map((s) => [s.id, s]));
  const stopNames = new Map(stops.map((s) => [s.id, s.name]));
  const nameOf = (id: string): string => stopNames.get(id) ?? id;

  const lat = new Float64Array(connections.stopIds.length);
  const lon = new Float64Array(connections.stopIds.length);
  for (let i = 0; i < connections.stopIds.length; i++) {
    const s = byId.get(connections.stopIds[i]!);
    lat[i] = s?.lat ?? 0;
    lon[i] = s?.lon ?? 0;
  }
  const footpaths = buildFootpaths(lat, lon);
  const frequency = buildFrequency(connections, nameOf);
  const segments = await prisma.segment.findMany({
    select: { id: true, routeId: true, fromStation: true, toStation: true,
              fromStopId: true, toStopId: true, mode: true, geometry: true },
  });
  const segmentIndex = buildSegmentIndex(segments);

  // Departures per stop, which is how often a stop can start a trip — and the
  // closest thing to ridership the open data carries.
  const departures = new Map<string, number>();
  for (let i = 0; i < connections.fromStop.length; i++) {
    const id = connections.stopIds[connections.fromStop[i]!]!;
    departures.set(id, (departures.get(id) ?? 0) + 1);
  }
  const boardable = [...departures.keys()];

  /**
   * Origin/destination pairs are drawn with a target separation rather than
   * uniformly.
   *
   * Uniform pairs across a city this shape are overwhelmingly cross-town: the
   * first run produced 241 trips over 70 minutes and *two* under 20, so the
   * short bucket — the downtown hop U-05 makes constantly — had no reference at
   * all. Drawing a distance first fills every bucket. It does not bias the
   * comparison, because trips are only ever ranked against others of their own
   * length.
   */
  const CELL = 0.01; // ~1.1 km of latitude
  const cellKey = (la: number, lo: number): string =>
    `${Math.round(la / CELL)}|${Math.round(lo / CELL)}`;
  const grid = new Map<string, string[]>();
  for (const id of boardable) {
    const s = byId.get(id);
    if (s === undefined) continue;
    const k = cellKey(s.lat, s.lon);
    const list = grid.get(k);
    if (list === undefined) grid.set(k, [id]);
    else list.push(id);
  }

  // Seeded, so a rebuild on unchanged data produces the same table and a diff
  // shows a real change in the network rather than a new roll of the dice.
  const rand = mulberry32(20260829);

  /** Cumulative service weights, so a busy stop is drawn as often as it is used. */
  const cumulative = new Float64Array(boardable.length);
  let running = 0;
  for (let i = 0; i < boardable.length; i++) {
    running += departures.get(boardable[i]!) ?? 0;
    cumulative[i] = running;
  }
  const drawWeighted = (pool: readonly string[]): string => {
    if (pool === boardable) {
      const target = rand() * running;
      let lo = 0, hi = boardable.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cumulative[mid]! < target) lo = mid + 1;
        else hi = mid;
      }
      return boardable[lo]!;
    }
    // Small pools (one ring of grid cells) are cheap to weight directly.
    let total = 0;
    for (const id of pool) total += departures.get(id) ?? 0;
    if (total <= 0) return pool[Math.floor(rand() * pool.length)]!;
    let target = rand() * total;
    for (const id of pool) {
      target -= departures.get(id) ?? 0;
      if (target <= 0) return id;
    }
    return pool[pool.length - 1]!;
  };
  const pick = (): string => drawWeighted(boardable);

  /** A stop roughly `km` away from this one, or null if that ring is empty. */
  const pickNear = (fromId: string, km: number): string | null => {
    const s = byId.get(fromId);
    if (s === undefined) return null;
    const dLat = km / 111;
    const dLon = km / (111 * Math.cos((s.lat * Math.PI) / 180));
    const ring: string[] = [];
    // A one-cell-thick ring at the target radius, so the draw is a distance
    // rather than a disc — a disc would collapse back toward the far edge.
    for (const [k, ids] of grid) {
      const [la, lo] = k.split("|").map(Number) as [number, number];
      const dy = (la * CELL - s.lat) / dLat;
      const dx = (lo * CELL - s.lon) / dLon;
      const r = Math.hypot(dx, dy);
      if (r >= 0.8 && r <= 1.2) ring.push(...ids);
    }
    return ring.length === 0 ? null : drawWeighted(ring);
  };

  const allDay: number[][] = DURATION_BUCKETS.map(() => []);
  const atTime: Array<Map<string, number[]>> = DURATION_BUCKETS.map(() => new Map());
  let found = 0;
  const coverages: number[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS && found < TARGET_JOURNEYS; attempt++) {
    const from = pick();
    // Squared so short separations are drawn more often than long ones, which
    // is the shape of the trips the buckets need.
    const km = 1 + 24 * rand() * rand();
    const to = pickNear(from, km);
    if (to === null || from === to) continue;
    const departAt = DEPART_TIMES[attempt % DEPART_TIMES.length]!;
    const journey = plan(connections, footpaths, from, to, departAt);
    if (journey === null) continue;
    const minutes = Math.round((journey.arriveAt - journey.departAt) / 60);
    const bucket = bucketFor(minutes);
    if (bucket === null) continue;

    const scored = await scoreJourney(journey, segmentIndex, frequency, nameOf);
    // A trip we could not measure is not a data point about how risky trips
    // are. Including it would drag the reference toward "nothing goes wrong"
    // and make every well-measured trip look bad against it.
    if (scored.reliability.coverage < MIN_COVERAGE) continue;

    found++;
    coverages.push(scored.reliability.coverage);
    allDay[bucket]!.push(scored.reliability.disruptionRisk);
    if (scored.atTime !== null && scored.atTime.bands.length === 1) {
      // A trip spanning two bands belongs to neither reference class.
      const band = scored.atTime.bands[0]!.id;
      const list = atTime[bucket]!.get(band);
      if (list === undefined) atTime[bucket]!.set(band, [scored.atTime.disruptionRisk]);
      else list.push(scored.atTime.disruptionRisk);
    }

    if (found % 50 === 0) process.stdout.write(`  ${found} journeys\r`);
  }

  const asc = (v: number[]): number[] => v.slice().sort((x, y) => x - y);
  const table: BenchmarkTable = {
    builtAt: new Date().toISOString(),
    departAt: DEPART_TIMES,
    sampled: found,
    buckets: DURATION_BUCKETS.map((b, i) => ({
      ...b,
      allDay: allDay[i]!.length >= MIN_PER_BUCKET ? asc(allDay[i]!) : null,
      atTime: Object.fromEntries(
        [...atTime[i]!].map(([band, v]) => [band, v.length >= MIN_PER_BUCKET ? asc(v) : null]),
      ),
    })),
  };

  await mkdir(dirname(BENCHMARK_PATH), { recursive: true });
  await writeFile(BENCHMARK_PATH, `${JSON.stringify(table, null, 2)}\n`);

  console.log(`\n\n=== Benchmark: what a typical trip looks like ===\n`);
  const cs = coverages.slice().sort((a, b) => a - b);
  const q = (x: number): number => cs[Math.min(cs.length - 1, Math.floor(x * cs.length))] ?? 0;
  console.log(`Sampled ${found} scorable journeys across ${DEPART_TIMES.length} departure times`);
  console.log(`Coverage of the sample: p10 ${q(0.1)}  median ${q(0.5)}  p90 ${q(0.9)}\n`);
  const at = (arr: number[] | null | undefined, q: number): string => {
    if (arr === null || arr === undefined || arr.length === 0) return "—";
    const r = arr[Math.min(arr.length - 1, Math.floor(q * arr.length))]!;
    return r > 0 ? `1 in ${Math.round(1 / r)}` : "never";
  };
  console.log("bucket          n    all-day 1 in N (p25 / median / p75)");
  for (let i = 0; i < DURATION_BUCKETS.length; i++) {
    const b = DURATION_BUCKETS[i]!;
    const v = table.buckets[i]!.allDay;
    console.log(
      `${b.label.padEnd(14)} ${String(allDay[i]!.length).padStart(4)}   ` +
      `${at(v, 0.25).padStart(11)} ${at(v, 0.5).padStart(11)} ${at(v, 0.75).padStart(11)}`,
    );
  }
  console.log("\nband view median, by duration and band:");
  const bandIds = [...new Set(atTime.flatMap((m) => [...m.keys()]))];
  console.log(`${"bucket".padEnd(14)}${bandIds.map((x) => x.padStart(13)).join("")}`);
  for (let i = 0; i < DURATION_BUCKETS.length; i++) {
    console.log(
      DURATION_BUCKETS[i]!.label.padEnd(14) +
      bandIds.map((id) => {
        const v = table.buckets[i]!.atTime[id];
        const n = atTime[i]!.get(id)?.length ?? 0;
        return (v == null ? `— (${n})` : at(v, 0.5)).padStart(13);
      }).join(""),
    );
  }
  console.log(`\nWritten to ${BENCHMARK_PATH}`);
  console.log("A bucket with fewer than " + MIN_PER_BUCKET + " trips is left null and shows no comparison.\n");
}

main()
  .catch((e: unknown) => { console.error(e); process.exitCode = 1; })
  .finally(() => void disconnect());
