/**
 * Is "runs every N minutes" a discriminating thing to tell a rider?
 *
 * `D-34` puts a tag on a trip when one of its waits sits on service running at
 * or above `NOTABLE_HEADWAY_MINUTES`. That threshold is a judgement, and a
 * judgement about a threshold is worth exactly as much as the distribution it
 * was made against — which nobody had looked at.
 *
 * Two ways it could be wrong, and they fail in opposite directions:
 *
 * - **Too high.** The tag almost never appears, and the app stays silent about
 *   the thing it exists to say.
 * - **Too low.** The tag appears on nearly every trip, which is wallpaper. A
 *   condition present everywhere carries no information, and it would push the
 *   tags that *are* rare — a closure, a route that does not turn up — down a
 *   row on a phone.
 *
 * **Measured in departures, not in segments.** Counting segment-bands would
 * answer a question about the shape of the network; a rider does not board a
 * uniformly-drawn segment, they board the one their trip uses, and busy service
 * is busy precisely because it is frequent. Weighting each segment-band by the
 * trips that run on it asks the rider's question instead: across all the
 * service this city runs, how often is the next vehicle 20 minutes away?
 *
 * Departures are a proxy for ridership, not ridership — the open data carries
 * no boarding counts, and the benchmark makes the same substitution for the
 * same reason. It is the right direction of approximation here: it weights
 * frequent service up, which is the conservative choice for a threshold whose
 * failure mode is firing too often.
 *
 * This is also the honest correction to a mistake already made twice here — a
 * reference class sampled without service weighting made every real trip look
 * terrible (E-D21), and gating a band on observed incidents kept only the bad
 * bands (E-D20). Both were the same error: the population measured was not the
 * population on screen.
 */

import { buildConnections } from "../domain/connections.js";
import { buildFrequency, key, WEEKDAYS_PER_MONTH } from "../domain/frequency.js";
import { prisma, disconnect } from "../db/client.js";
import { BANDS, bandOfSeconds } from "../domain/time-bands.js";
import { headwayMinutes, MIN_TRIPS_IN_BAND, NOTABLE_HEADWAY_MINUTES } from "../domain/wait.js";

/* ---- Pre-registered thresholds -------------------------------------------
   Fixed before any number was looked at. */

/**
 * Below this share of departures the tag is a curiosity: true, but so rare that
 * building a summary-level affordance for it is not worth the row.
 */
const MIN_SHARE = 0.05;

/**
 * Above this share it is wallpaper. Half of all departures is the point at which
 * "this one is infrequent" stops distinguishing anything — the rider would see
 * it on most trips and learn to skip it, which is worse than not showing it,
 * because it also teaches them to skip the tags beside it.
 */
const MAX_SHARE = 0.5;

const WEEKDAY_SERVICE = "1";

async function main(): Promise<void> {
  const connections = await buildConnections(WEEKDAY_SERVICE);
  const stops = await prisma.stop.findMany({ select: { id: true, name: true } });
  const stopNames = new Map(stops.map((s) => [s.id, s.name]));
  const frequency = buildFrequency(connections, (id) => stopNames.get(id) ?? id);

  /** Departures per segment-band, which is the weight each headway carries. */
  const departures = new Map<string, number>();
  for (let i = 0; i < connections.count; i++) {
    const route = connections.tripRoute[connections.trip[i]!]!;
    const from = connections.stopIds[connections.fromStop[i]!]!;
    const to = connections.stopIds[connections.toStop[i]!]!;
    const band = bandOfSeconds(connections.depTime[i]!).id;
    const k = `${key(route, from, to)}|${band}`;
    departures.set(k, (departures.get(k) ?? 0) + 1);
  }

  const perBand = new Map<string, { notable: number; measured: number; thin: number }>();
  for (const b of BANDS) perBand.set(b.id, { notable: 0, measured: 0, thin: 0 });
  const headways: number[] = [];

  for (const [k, weight] of departures) {
    const at = k.lastIndexOf("|");
    const bandId = k.slice(at + 1);
    const [route, from, to] = k.slice(0, at).split("|");
    const band = BANDS.find((x) => x.id === bandId)!;
    const row = perBand.get(bandId)!;
    const h = headwayMinutes(frequency, route!, from!, to!, band);
    if (h === null) {
      // Service too sparse for a mean gap to describe — reported rather than
      // folded into either side, because an unmeasurable headway is not a short
      // one (P-03).
      row.thin += weight;
      continue;
    }
    row.measured += weight;
    for (let n = 0; n < weight; n++) headways.push(h);
    if (h >= NOTABLE_HEADWAY_MINUTES) row.notable += weight;
  }

  headways.sort((a, b) => a - b);
  const pct = (p: number): number => headways[Math.floor((headways.length - 1) * p)] ?? 0;
  const totals = [...perBand.values()].reduce(
    (a, r) => ({ notable: a.notable + r.notable, measured: a.measured + r.measured, thin: a.thin + r.thin }),
    { notable: 0, measured: 0, thin: 0 },
  );
  const share = totals.measured === 0 ? 0 : totals.notable / totals.measured;

  console.log(`\nHeadway exposure, weighted by departures — weekday service, ${WEEKDAY_SERVICE}`);
  console.log(`  threshold: ${NOTABLE_HEADWAY_MINUTES} min · floor for a measurable band: ${MIN_TRIPS_IN_BAND} trips`);
  console.log(`  departures measured: ${totals.measured.toLocaleString()}`);
  console.log(`  departures on service too sparse to describe: ${totals.thin.toLocaleString()}`);
  console.log(`  weekday departures per month (measured): ${Math.round(totals.measured * WEEKDAYS_PER_MONTH).toLocaleString()}\n`);

  console.log("  band          departures   >= threshold    share   too sparse");
  for (const b of BANDS) {
    const r = perBand.get(b.id)!;
    const s = r.measured === 0 ? 0 : r.notable / r.measured;
    console.log(
      `  ${b.id.padEnd(12)} ${String(r.measured).padStart(9)} ${String(r.notable).padStart(14)}` +
      ` ${(s * 100).toFixed(1).padStart(7)}% ${String(r.thin).padStart(11)}`,
    );
  }

  console.log(`\n  headway behind a departure:`);
  console.log(`    p25 ${pct(0.25).toFixed(1)} min · p50 ${pct(0.5).toFixed(1)} min · p75 ${pct(0.75).toFixed(1)} min · p90 ${pct(0.9).toFixed(1)} min`);

  const pass = share >= MIN_SHARE && share <= MAX_SHARE;
  console.log(
    `\n  VERDICT: ${(share * 100).toFixed(1)}% of departures sit at or above ${NOTABLE_HEADWAY_MINUTES} min` +
    ` — pre-registered band ${(MIN_SHARE * 100).toFixed(0)}–${(MAX_SHARE * 100).toFixed(0)}%.`,
  );
  console.log(`  ${pass ? "PASS — the threshold discriminates." : "FAIL — the threshold does not discriminate; D-34 needs a different number."}\n`);

  await disconnect();
  if (!pass) process.exitCode = 1;
}

await main();
