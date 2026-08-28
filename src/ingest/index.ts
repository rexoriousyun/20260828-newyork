import { ingestDelays, ingestCodes, type Mode } from "./delays.js";
import { ingestGtfs } from "./gtfs.js";
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
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(disconnect);
