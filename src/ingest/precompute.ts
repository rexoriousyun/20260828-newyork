/**
 * Turn the parsed schedule into a file the server can read instead of parse.
 *
 * Run after `npm run ingest`, and before building an image.
 *
 * Parsing `stop_times.txt` is 74% of the cold start (E-D25): 13.9 s of CSV to
 * produce five typed arrays that do not change until the next feed. This writes
 * them once. It also means `stop_times.txt` — 207 MB of the ~298 MB the app
 * ships — does not have to be in the runtime image at all.
 *
 *   npm run precompute
 */

import { parseConnections, writeConnectionCache } from "../domain/connections.js";

/** The weekday calendar pattern, the same one the planner serves. */
const WEEKDAY_SERVICE = "1";

async function main(): Promise<void> {
  const t0 = performance.now();
  const connections = await parseConnections(WEEKDAY_SERVICE);
  const parsed = performance.now() - t0;

  const t1 = performance.now();
  const bytes = await writeConnectionCache(connections, WEEKDAY_SERVICE);
  const written = performance.now() - t1;

  console.log(
    `\n  parsed  ${connections.count.toLocaleString()} connections in ${(parsed / 1000).toFixed(1)}s` +
    `\n  wrote   data/connections.bin — ${(bytes / 1048576).toFixed(1)} MB in ${written.toFixed(0)}ms` +
    `\n\n  The cache is refused if gtfs.zip changes, so re-run this after every ingest.\n`,
  );
}

await main();
