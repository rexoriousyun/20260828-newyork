import { ingestDelays, ingestCodes, type Mode } from "./delays.js";
import { ingestGtfs } from "./gtfs.js";
import { buildSegments } from "./segments.js";
import { attributeSubwayIncidents, attributeSurfaceIncidents } from "../domain/attribute.js";
import { buildSurfaceSegments } from "./surface-segments.js";
import { disconnect } from "../db/client.js";

const MODES: Mode[] = ["subway", "bus", "streetcar"];

async function main(): Promise<void> {
  console.log("GTFS static...");
  const gtfs = await ingestGtfs();
  console.log(`  ${gtfs.stops.toLocaleString()} stops, ${gtfs.routes} routes`);

  for (const mode of MODES) {
    const codes = await ingestCodes(mode);
    const { read, written } = await ingestDelays(mode);
    console.log(
      `${mode}: ${written.toLocaleString()}/${read.toLocaleString()} incidents, ${codes} codes`,
    );
  }

  console.log("\nSegments (M3)...");
  const seg = await buildSegments();
  console.log(`  ${seg.segments} segments across ${seg.patterns} route/direction patterns`);

  const attr = await attributeSubwayIncidents();
  const rate = ((attr.attributed / attr.considered) * 100).toFixed(1);
  console.log(`  attributed ${attr.attributed.toLocaleString()}/${attr.considered.toLocaleString()} subway incidents (${rate}%)`);
  console.log(`    non-revenue (excluded by D-06): ${attr.nonRevenue.toLocaleString()}`);
  console.log(`    no direction recorded:          ${attr.unknownDirection.toLocaleString()}`);
  console.log(`    station name unresolved:        ${attr.unresolvedStation.toLocaleString()}`);
  console.log(`    no matching segment:            ${attr.noMatchingSegment.toLocaleString()}`);

  const surf = await buildSurfaceSegments();
  console.log(`\n  ${surf.segments.toLocaleString()} surface segments across ${surf.routes} routes`);
  const sattr = await attributeSurfaceIncidents();
  const srate = ((sattr.attributed / sattr.considered) * 100).toFixed(1);
  console.log(`  attributed ${sattr.attributed.toLocaleString()}/${sattr.considered.toLocaleString()} surface incidents (${srate}%)`);
  console.log(`    excluded (loop/garage):         ${sattr.nonRevenue.toLocaleString()}`);
  console.log(`    location unresolved:            ${sattr.unresolvedStation.toLocaleString()}`);
  console.log(`    no direction recorded:          ${sattr.unknownDirection.toLocaleString()}`);
  console.log(`    no matching segment:            ${sattr.noMatchingSegment.toLocaleString()}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(disconnect);
