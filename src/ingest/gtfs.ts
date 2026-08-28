/**
 * GTFS static ingestion — network topology and stop coordinates.
 *
 * Only stops.txt and routes.txt are loaded. stop_times.txt is ~207MB and is not
 * needed until segment construction (M3), so it is deliberately left on disk.
 */

import { mkdir, writeFile } from "node:fs/promises";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { prisma } from "../db/client.js";
import { findResource } from "./ckan.js";
import { keyFromStopName } from "../domain/streets.js";

const GTFS_DATASET = "ttc-routes-and-schedules";

/** The archive is cached so segment construction (M3) need not re-download 35MB. */
export const GTFS_CACHE = "data/raw/gtfs.zip";

export async function ingestGtfs(): Promise<{ stops: number; routes: number }> {
  const res = await findResource(GTFS_DATASET, "ZIP", () => true);

  const response = await fetch(res.url);
  if (!response.ok) throw new Error(`GTFS download failed (${response.status})`);
  const archive = Buffer.from(await response.arrayBuffer());
  await mkdir("data/raw", { recursive: true });
  await writeFile(GTFS_CACHE, archive);
  const zip = new AdmZip(archive);

  const read = (entry: string): Array<Record<string, string>> => {
    const file = zip.getEntry(entry);
    if (!file) throw new Error(`${entry} missing from GTFS archive`);
    return parse(file.getData().toString("utf8"), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    }) as Array<Record<string, string>>;
  };

  const stops = read("stops.txt")
    .map((s) => {
      const name = (s["stop_name"] ?? "").trim();
      return {
        id: (s["stop_id"] ?? "").trim(),
        name,
        lat: Number(s["stop_lat"]),
        lon: Number(s["stop_lon"]),
        streetKey: keyFromStopName(name),
      };
    })
    .filter((s) => s.id !== "" && Number.isFinite(s.lat) && Number.isFinite(s.lon));

  const routes = read("routes.txt")
    .map((r) => ({
      id: (r["route_id"] ?? "").trim(),
      shortName: (r["route_short_name"] ?? "").trim(),
      longName: (r["route_long_name"] ?? "").trim(),
      type: Number(r["route_type"] ?? -1),
    }))
    .filter((r) => r.id !== "");

  await prisma.stop.deleteMany();
  for (let i = 0; i < stops.length; i += 2000) {
    await prisma.stop.createMany({ data: stops.slice(i, i + 2000) });
  }
  await prisma.route.deleteMany();
  await prisma.route.createMany({ data: routes });

  return { stops: stops.length, routes: routes.length };
}
