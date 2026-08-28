/**
 * M5 — surface geocoding coverage.
 *
 * Runs the same resolver the attribution pass uses, so the rate published here
 * is the rate actually achieved. Measuring one code path and shipping another is
 * how a coverage claim quietly becomes false (P-08).
 *
 * Two rates are reported, because they answer different questions:
 *
 *   raw         — share of all surface delay-minutes we can place on a map
 *   addressable — share of *rider-facing* delay-minutes we can place
 *
 * The gap between them is garages and loops: real delay, logged where no rider
 * is waiting. Counting those as failures understates coverage; counting them as
 * covered puts phantom risk on the map (D-12).
 */

import { prisma, disconnect } from "../db/client.js";
import { buildSurfaceIndex, resolveSurfaceLocation } from "../domain/surface-resolver.js";

const BASELINE = 0.661;

async function main(): Promise<void> {
  const index = await buildSurfaceIndex();
  const incidents = await prisma.delayIncident.findMany({
    where: { mode: { in: ["bus", "streetcar"] }, minDelay: { gt: 0 } },
    select: { locationRaw: true, minGap: true },
  });

  const bucket = { intersection: 0, station: 0, landmark: 0, loop: 0, nonRevenue: 0, unresolved: 0 };
  const gaps = new Map<string, number>();

  for (const i of incidents) {
    const r = resolveSurfaceLocation(i.locationRaw, index);
    if (r.kind === "stop") {
      if (r.via === "intersection") bucket.intersection += i.minGap;
      else if (r.via === "station") bucket.station += i.minGap;
      else bucket.landmark += i.minGap;
    } else if (r.kind === "excluded") {
      if (r.reason === "loop") bucket.loop += i.minGap;
      else bucket.nonRevenue += i.minGap;
    } else {
      bucket.unresolved += i.minGap;
      gaps.set(i.locationRaw, (gaps.get(i.locationRaw) ?? 0) + i.minGap);
    }
  }

  const total = Object.values(bucket).reduce((a, b) => a + b, 0);
  const resolved = bucket.intersection + bucket.station + bucket.landmark;
  const excluded = bucket.loop + bucket.nonRevenue;
  const raw = resolved / total;
  const addressable = resolved / (total - excluded);
  const pct = (n: number): string => `${((n / total) * 100).toFixed(1)}%`;

  console.log("=".repeat(72));
  console.log("M5 — surface geocoding coverage");
  console.log("=".repeat(72));
  console.log(`\nsurface delay-minutes: ${total.toLocaleString()}\n`);
  console.log(`  intersection resolved   ${pct(bucket.intersection).padStart(7)}`);
  console.log(`  station resolved        ${pct(bucket.station).padStart(7)}`);
  console.log(`  landmark resolved       ${pct(bucket.landmark).padStart(7)}`);
  console.log(`  ---`);
  console.log(`  loop (turnaround)       ${pct(bucket.loop).padStart(7)}  excluded, D-06`);
  console.log(`  garage / division       ${pct(bucket.nonRevenue).padStart(7)}  excluded, D-06`);
  console.log(`  ---`);
  console.log(`  UNRESOLVED              ${pct(bucket.unresolved).padStart(7)}  the real coverage gap`);
  console.log(`\nraw coverage         ${(raw * 100).toFixed(1)}%   (baseline ${(BASELINE * 100).toFixed(1)}%)`);
  console.log(`addressable coverage ${(addressable * 100).toFixed(1)}%   (excluding non-rider locations)`);

  console.log("\nlargest remaining gaps:");
  [...gaps]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([loc, m]) => console.log(`  ${m.toString().padStart(6)}  ${loc}`));

  console.log("\n" + "=".repeat(72));
  if (raw > BASELINE) {
    console.log(`VERDICT: PASS — raw coverage ${(raw * 100).toFixed(1)}% beats the ${(BASELINE * 100).toFixed(1)}% baseline.`);
  } else {
    console.log(`VERDICT: FAIL — raw coverage ${(raw * 100).toFixed(1)}% does not beat ${(BASELINE * 100).toFixed(1)}%.`);
    process.exitCode = 1;
  }
  console.log("=".repeat(72));
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(disconnect);
