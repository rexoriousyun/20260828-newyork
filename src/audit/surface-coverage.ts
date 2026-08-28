/**
 * M5 — surface geocoding coverage.
 *
 * The plan's criterion is to beat the 66% baseline in E-D07 and publish the
 * achieved rate. Two rates are reported, because they answer different
 * questions:
 *
 *   raw         — share of all surface delay-minutes we can place on a map
 *   addressable — share of *rider-facing* delay-minutes we can place
 *
 * The gap between them is garages and loops: real delay, logged at places no
 * rider is waiting. Counting those as geocoding failures would understate
 * coverage; counting them as covered would put phantom risk on the map. They
 * are excluded and declared instead (D-06, P-03).
 */

import { prisma, disconnect } from "../db/client.js";
import {
  classifySurfaceLocation,
  resolveIntersection,
  buildPrefixIndex,
  resolveByName,
  applySurfaceAlias,
} from "../domain/surface.js";

const BASELINE = 0.661;

function canonicalStation(name: string): string {
  return name.toUpperCase().replace(/\s*STATION\s*$/i, "").replace(/\s+/g, " ").trim();
}

async function main(): Promise<void> {
  const stops = await prisma.stop.findMany({ select: { id: true, name: true, streetKey: true } });

  const byKey = new Map<string, string>();
  for (const s of stops) {
    if (s.streetKey !== null && !byKey.has(s.streetKey)) byKey.set(s.streetKey, s.id);
  }
  const prefixIndex = buildPrefixIndex(byKey.keys());

  const stationStops = new Map<string, string>();
  for (const s of stops) {
    if (/\bstation\b/i.test(s.name)) {
      const key = canonicalStation(s.name.replace(/\s*-\s*.*$/, ""));
      if (key !== "" && !stationStops.has(key)) stationStops.set(key, s.id);
    }
  }
  const stationNames = [...stationStops.keys()];

  // Every stop, indexed by canonical name, for landmark matching.
  const byName = new Map<string, string>();
  for (const s of stops) {
    const key = canonicalStation(s.name.replace(/\s*-\s*.*$/, ""));
    if (key !== "" && !byName.has(key)) byName.set(key, s.id);
  }
  const allNames = [...byName.keys()];

  const incidents = await prisma.delayIncident.findMany({
    where: { mode: { in: ["bus", "streetcar"] }, minDelay: { gt: 0 } },
    select: { locationRaw: true, minGap: true },
  });

  const bucket = { intersection: 0, station: 0, landmark: 0, loop: 0, nonRevenue: 0, unresolved: 0 };
  const unresolvedExamples = new Map<string, number>();

  for (const i of incidents) {
    const c = classifySurfaceLocation(i.locationRaw);

    if (c.kind === "non-revenue") {
      bucket.nonRevenue += i.minGap;
    } else if (c.kind === "loop") {
      bucket.loop += i.minGap;
    } else if (c.kind === "intersection") {
      if (resolveIntersection(c.key, byKey, prefixIndex) !== null) bucket.intersection += i.minGap;
      else {
        bucket.unresolved += i.minGap;
        unresolvedExamples.set(i.locationRaw, (unresolvedExamples.get(i.locationRaw) ?? 0) + i.minGap);
      }
    } else if (c.kind === "station") {
      // Station names truncate too, so an unambiguous prefix is accepted.
      const aliased = applySurfaceAlias(c.name);
      const exact = stationStops.get(aliased);
      const prefixed = exact === undefined ? stationNames.filter((n) => n.startsWith(aliased)) : [];
      if (exact !== undefined || prefixed.length === 1) bucket.station += i.minGap;
      else {
        bucket.unresolved += i.minGap;
        unresolvedExamples.set(i.locationRaw, (unresolvedExamples.get(i.locationRaw) ?? 0) + i.minGap);
      }
    } else if (resolveByName(applySurfaceAlias(c.raw), byName, allNames) !== null) {
      bucket.landmark += i.minGap;
    } else {
      bucket.unresolved += i.minGap;
      unresolvedExamples.set(i.locationRaw, (unresolvedExamples.get(i.locationRaw) ?? 0) + i.minGap);
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
  [...unresolvedExamples]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
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
