/**
 * Does pooling across the day misrepresent a rider's actual risk?
 *
 * The scoring model divides incidents by trips to get a per-trip risk. Both are
 * counted across the whole service day, so an 08:30 departure is quoted a
 * figure that includes 23:00 running. If risk really is much higher at peak,
 * every number the app shows a commuter is diluted by hours they will never
 * travel in — and the "1 trip in N" on the card is wrong for the trip they are
 * actually planning.
 *
 * **The obvious version of this concern is not obviously right.** Peak has more
 * incidents, but it also has far more trips. Risk is a ratio, and both sides
 * move together — so the question is not whether peak has more incidents (it
 * does) but whether it has more incidents *per trip*. That is what this
 * measures.
 *
 * The second question is what conditioning would cost. Slicing the day into
 * bands divides an already-thin sample, and D-19's recency decay has cut
 * scorable segments from 2,703 to 1,167 once. The audit reports both the effect
 * and the price, because a real effect we cannot afford to model is a different
 * decision from no effect at all.
 */

import { prisma, disconnect } from "../db/client.js";
import { buildConnections } from "../domain/connections.js";
import { buildFrequency, key } from "../domain/frequency.js";
import { recencyWeight, effectiveMonths, confidenceFor } from "../domain/score.js";
import { stationFromPlatform } from "../domain/stations.js";

/* ---- Pre-registered thresholds -------------------------------------------
   Fixed before any number was looked at, so the verdict cannot be argued into
   whichever answer is cheaper to implement. */

/**
 * How far a band's per-trip risk must sit from the pooled figure before the
 * pooled figure counts as misrepresenting that band. 1.5x is the point at which
 * "1 in 150" would have to be quoted as "1 in 100" — a difference a rider
 * planning around a deadline would act on.
 */
const MATERIAL_RATIO = 1.5;

/**
 * Share of scorable segments that must be misrepresented by that much before
 * the pooled model is judged unfit. Below this, conditioning is a refinement;
 * above it, pooling is a defect.
 */
const MATERIAL_SHARE = 0.25;

/**
 * A band is compared when the pooled rate predicts at least this many incidents
 * across the trips that actually run in it.
 *
 * **Gating on observed incidents instead was wrong, and the first run showed
 * it.** A band only cleared that bar if it happened to accumulate incidents, so
 * quiet bands were dropped and every surviving band looked worse than the
 * pooled figure — the median ratio came out above 1.0 in all five, which cannot
 * be true of a trip-weighted decomposition. Gating on *expected* incidents
 * keeps the quiet bands, and an observed zero where three were predicted is
 * evidence of lower risk rather than an absence of evidence.
 */
const MIN_EXPECTED = 3;

/** Weekday service days in an average month — matches buildFrequency. */
const WEEKDAYS_PER_MONTH = 21.7;

/**
 * How strongly a segment's time-of-day pattern must persist between the two
 * halves of the window before it counts as real.
 *
 * Registered before the number was computed. Dispersion alone cannot settle
 * this: with three expected incidents in a band, Poisson noise alone throws
 * ratios of 0.5 and 1.5 around freely, so a wide spread is exactly what pure
 * chance looks like. The project has been here before — per-segment severity
 * showed dispersion and rho = 0.10, and D-11 pooled it rather than fit noise.
 *
 * The bar is lower than D-01's 0.5 because this is a correction on top of a
 * figure that already works, not the core asset. Below 0.3 the pattern carries
 * too little signal to pay for the sample that conditioning costs.
 */
const MIN_BAND_RHO = 0.3;

/** The observation window the score model normalises over. */
const WINDOW_MONTHS = 19;

/** GTFS service id for weekday service — the same one the planner builds on. */
const WEEKDAY_SERVICE = "1";

/**
 * Bands a rider would recognise, not equal slices of the clock. The split
 * points are the TTC's own peak periods; "night" is separated because service
 * changes shape there rather than merely thinning.
 */
const BANDS = [
  { name: "am peak", from: 6, to: 9 },
  { name: "midday", from: 9, to: 15 },
  { name: "pm peak", from: 15, to: 19 },
  { name: "evening", from: 19, to: 24 },
  { name: "night", from: 0, to: 6 },
] as const;

const bandOf = (hour: number): string =>
  BANDS.find((b) => hour >= b.from && hour < b.to)?.name ?? "night";

const SUBWAY_ROUTES = new Set(["1", "2", "4"]);

function spearman(a: readonly number[], b: readonly number[]): number {
  const rank = (v: readonly number[]): number[] => {
    const order = [...v.keys()].sort((i, j) => v[i]! - v[j]!);
    const r = new Array<number>(v.length);
    order.forEach((idx, pos) => { r[idx] = pos; });
    return r;
  };
  const ra = rank(a), rb = rank(b), n = a.length;
  const mean = (v: number[]): number => v.reduce((t, x) => t + x, 0) / n;
  const ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = ra[i]! - ma, y = rb[i]! - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

async function main(): Promise<void> {
  const latest = await prisma.delayIncident.aggregate({ _max: { occurredAt: true } });
  const now = latest._max.occurredAt;
  if (now === null) throw new Error("no incidents — run the ingest first");

  // ---- Trips per band, counted the same way frequency.ts counts them -------
  const connections = await buildConnections(WEEKDAY_SERVICE);
  const stops = await prisma.stop.findMany({ select: { id: true, name: true } });
  const stopNames = new Map(stops.map((s) => [s.id, s.name]));
  const stopName = (id: string): string => stopNames.get(id) ?? id;

  /** `segmentKey|band` -> trips per month in that band. */
  const tripsInBand = new Map<string, number>();
  const bump = (k: string, band: string): void =>
    void tripsInBand.set(`${k}|${band}`, (tripsInBand.get(`${k}|${band}`) ?? 0) + 1);

  for (let i = 0; i < connections.count; i++) {
    // GTFS times run past midnight; the band a trip belongs to is the hour a
    // rider would call it, so 25:10 is 01:10.
    const band = bandOf(Math.floor(connections.depTime[i]! / 3600) % 24);
    const route = connections.tripRoute[connections.trip[i]!]!;
    const fromId = connections.stopIds[connections.fromStop[i]!]!;
    const toId = connections.stopIds[connections.toStop[i]!]!;
    bump(key(route, fromId, toId), band);
    if (SUBWAY_ROUTES.has(route)) {
      const a = stationFromPlatform(stopName(fromId));
      const b = stationFromPlatform(stopName(toId));
      if (a !== "" && b !== "" && a !== b) bump(key(route, a, b), band);
    }
  }
  for (const [k, n] of tripsInBand) tripsInBand.set(k, n * WEEKDAYS_PER_MONTH);

  const frequency = buildFrequency(connections, stopName);

  // ---- Incidents per band, weighted the same way the score model weights ----
  const segments = await prisma.segment.findMany({
    select: { id: true, routeId: true, fromStation: true, toStation: true,
              fromStopId: true, toStopId: true, mode: true },
  });
  const segById = new Map(segments.map((s) => [s.id, s]));

  const rows = await prisma.delayIncident.findMany({
    where: { segmentId: { not: null }, minDelay: { gt: 0 } },
    select: { segmentId: true, hour: true, occurredAt: true },
  });

  const denominator = effectiveMonths(WINDOW_MONTHS);
  /** segmentId -> band -> weighted incident count. */
  const weighted = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const w = recencyWeight(r.occurredAt, now);
    const band = bandOf(r.hour);
    let byBand = weighted.get(r.segmentId!);
    if (byBand === undefined) { byBand = new Map(); weighted.set(r.segmentId!, byBand); }
    byBand.set(band, (byBand.get(band) ?? 0) + w);
  }

  // ---- Compare each band's per-trip risk with the pooled figure ------------
  interface Row { segmentId: string; band: string; pooled: number; band_: number; ratio: number }
  const comparisons: Row[] = [];
  let scorablePooled = 0;
  const bandSurvivors = new Map<string, number>();

  for (const [segmentId, byBand] of weighted) {
    const seg = segById.get(segmentId);
    if (seg === undefined) continue;
    const total = [...byBand.values()].reduce((a, b) => a + b, 0);
    if (confidenceFor(total) === "unknown") continue;

    const segKey = key(seg.routeId, seg.fromStopId ?? seg.fromStation, seg.toStopId ?? seg.toStation);
    const tripsAllDay = frequency.tripsPerMonth.get(segKey);
    if (tripsAllDay === undefined || tripsAllDay <= 0) continue;
    scorablePooled++;

    const pooled = (total / denominator) / tripsAllDay;

    for (const b of BANDS) {
      const trips = tripsInBand.get(`${segKey}|${b.name}`);
      if (trips === undefined || trips <= 0) continue;
      // Would the pooled rate predict enough incidents here to notice their
      // absence? If not, this band cannot distinguish "quiet" from "unobserved".
      if (pooled * trips * denominator < MIN_EXPECTED) continue;
      bandSurvivors.set(b.name, (bandSurvivors.get(b.name) ?? 0) + 1);

      const incidents = byBand.get(b.name) ?? 0;
      const bandRisk = (incidents / denominator) / trips;
      comparisons.push({
        segmentId, band: b.name, pooled, band_: bandRisk,
        ratio: pooled > 0 ? bandRisk / pooled : 0,
      });
    }
  }

  // ---- Does the pattern persist, or is it Poisson noise? -------------------
  // Same shape of test that settled severity (E-D10): split the window, measure
  // each segment-band ratio in both halves, and rank-correlate. A ratio that
  // does not survive the split cannot be used to condition anything.
  const split = new Date(now.getTime() - (WINDOW_MONTHS / 2) * 30.44 * 24 * 3600 * 1000);
  const halves: Array<Map<string, Map<string, number>>> = [new Map(), new Map()];
  for (const r of rows) {
    const half = r.occurredAt < split ? 0 : 1;
    const band = bandOf(r.hour);
    let byBand = halves[half]!.get(r.segmentId!);
    if (byBand === undefined) { byBand = new Map(); halves[half]!.set(r.segmentId!, byBand); }
    // Unweighted inside a half: recency decay across a 9-month window would
    // reintroduce the very time trend the split is meant to control for.
    byBand.set(band, (byBand.get(band) ?? 0) + 1);
  }

  const firstHalf: number[] = [];
  const secondHalf: number[] = [];
  for (const c of comparisons) {
    const seg = segById.get(c.segmentId)!;
    const segKey = key(seg.routeId, seg.fromStopId ?? seg.fromStation, seg.toStopId ?? seg.toStation);
    const trips = tripsInBand.get(`${segKey}|${c.band}`)!;
    const all = frequency.tripsPerMonth.get(segKey)!;

    const ratioIn = (half: number): number | null => {
      const byBand = halves[half]!.get(c.segmentId);
      if (byBand === undefined) return null;
      const total = [...byBand.values()].reduce((a, b) => a + b, 0);
      if (total < MIN_EXPECTED * 2) return null;
      const pooledHalf = total / all;
      if (pooledHalf <= 0) return null;
      return ((byBand.get(c.band) ?? 0) / trips) / pooledHalf;
    };
    const a = ratioIn(0);
    const b = ratioIn(1);
    if (a === null || b === null) continue;
    firstHalf.push(a);
    secondHalf.push(b);
  }
  const rho = firstHalf.length >= 30 ? spearman(firstHalf, secondHalf) : null;

  // ---- Report --------------------------------------------------------------
  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
  const median = (v: number[]): number => {
    if (v.length === 0) return 0;
    const s = [...v].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };

  console.log("\n=== Does pooling across the day misrepresent the risk? ===\n");
  console.log(`Observation edge  ${now.toISOString().slice(0, 10)}`);
  console.log(`Scorable segments ${scorablePooled} (pooled across the day)\n`);

  console.log("Per band, against the pooled figure for the same segment:");
  console.log("band      segments  median ratio   >1.5x    <0.67x");
  for (const b of BANDS) {
    const inBand = comparisons.filter((c) => c.band === b.name);
    if (inBand.length === 0) {
      console.log(`${b.name.padEnd(9)} ${String(0).padStart(8)}   — too few incidents to say`);
      continue;
    }
    const ratios = inBand.map((c) => c.ratio);
    const hi = ratios.filter((r) => r >= MATERIAL_RATIO).length;
    const lo = ratios.filter((r) => r <= 1 / MATERIAL_RATIO).length;
    console.log(
      `${b.name.padEnd(9)} ${String(inBand.length).padStart(8)}   ` +
      `${median(ratios).toFixed(2).padStart(10)}   ` +
      `${pct(hi / inBand.length).padStart(6)}   ${pct(lo / inBand.length).padStart(6)}`,
    );
  }

  // What conditioning would cost: a segment is only conditionable where at
  // least one band clears the sample bar it would need on its own.
  const conditionable = new Set(comparisons.map((c) => c.segmentId)).size;
  console.log(`\nSegments with at least one band scorable on its own: ` +
    `${conditionable} of ${scorablePooled} (${pct(scorablePooled === 0 ? 0 : conditionable / scorablePooled)})`);
  console.log("Bands scorable per segment (how much of the day survives slicing):");
  for (const b of BANDS) {
    console.log(`  ${b.name.padEnd(9)} ${String(bandSurvivors.get(b.name) ?? 0).padStart(6)} segments`);
  }

  // ---- Verdict -------------------------------------------------------------
  const material = comparisons.filter(
    (c) => c.ratio >= MATERIAL_RATIO || c.ratio <= 1 / MATERIAL_RATIO,
  ).length;
  const share = comparisons.length === 0 ? 0 : material / comparisons.length;

  console.log("\nDoes the pattern persist between halves of the window?");
  if (rho === null) {
    console.log(`  Not enough segment-bands survive the split (${firstHalf.length}) to say.`);
  } else {
    console.log(`  Pairs split         ${firstHalf.length}`);
    console.log(`  Spearman rho        ${rho.toFixed(3)}   (bar: ${MIN_BAND_RHO})`);
  }

  console.log(`\nBand/segment pairs compared      ${comparisons.length}`);
  console.log(`Misrepresented by >= ${MATERIAL_RATIO}x        ${material} (${pct(share)})`);
  console.log(`Pre-registered bar               ${pct(MATERIAL_SHARE)}`);

  // Both conditions have to hold. A spread that does not persist is noise, and
  // conditioning on it would fit the noise while spending the sample.
  if (comparisons.length < 30) {
    console.log("\nVERDICT: NO VERDICT — too few band/segment pairs to decide.");
  } else if (rho === null) {
    console.log("\nVERDICT: NO VERDICT — the spread is there, but too few segment-bands");
    console.log("         survive a split to tell signal from Poisson noise.");
  } else if (share >= MATERIAL_SHARE && rho >= MIN_BAND_RHO) {
    console.log("\nVERDICT: POOLING MISREPRESENTS, and the pattern is real. Risk should be");
    console.log("         conditioned on time of day where the sample allows it.");
  } else if (share >= MATERIAL_SHARE) {
    console.log("\nVERDICT: SPREAD WITHOUT SIGNAL. Band risk varies widely but does not");
    console.log("         persist, so conditioning would fit noise. The pooled figure stands");
    console.log("         and must be labelled as an all-day average.");
  } else {
    console.log("\nVERDICT: POOLING HOLDS. Per-trip risk is stable enough across the day that");
    console.log("         conditioning would buy less than the sample it costs.");
  }
  console.log();
}

main()
  .catch((e: unknown) => { console.error(e); process.exitCode = 1; })
  .finally(() => void disconnect());
