/**
 * TTC delay data ingestion.
 *
 * Rows are stored verbatim. No filtering happens here — not the 65% zero-minute
 * non-events (E-D04), not terminals (E-D03). Those are domain-layer decisions and
 * keeping the raw record intact is what makes published numbers auditable (P-08).
 */

import { parse } from "csv-parse/sync";
import { prisma } from "../db/client.js";
import { findResource, datasetRefreshedAt } from "./ckan.js";

export type Mode = "subway" | "bus" | "streetcar";

const DATASETS: Record<Mode, string> = {
  subway: "ttc-subway-delay-data",
  bus: "ttc-bus-delay-data",
  streetcar: "ttc-streetcar-delay-data",
};

interface RawRow {
  Date?: string;
  Time?: string;
  Day?: string;
  Station?: string;
  Location?: string;
  Line?: string;
  Code?: string;
  "Min Delay"?: string;
  "Min Gap"?: string;
  Bound?: string;
  Vehicle?: string;
}

/**
 * Parses a published date+time pair into a Date.
 *
 * The feeds are inconsistent: subway publishes "2025-01-01", bus publishes
 * "2025-01-01T00:00:00" with the time carried separately in `Time`. Both are
 * Toronto local wall-clock. We construct as UTC so the stored hour matches the
 * published hour exactly — every query we run is on local time-of-day, and
 * converting would silently shift incidents across hour boundaries.
 */
function parseOccurredAt(date: string, time: string): Date | null {
  const day = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const hm = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!hm) return null;

  const hour = Number(hm[1]);
  const minute = Number(hm[2]);
  if (hour > 23 || minute > 59) return null;

  return new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`);
}

/** Published numeric fields are text and are sometimes blank. */
function parseMinutes(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/**
 * Repairs double-encoded text in the published files.
 *
 * The portal's delay-code descriptions arrive as UTF-8 bytes that already encode
 * mojibake: an en-dash is published as c3 a2 c2 80 c2 93, which is the UTF-8
 * encoding of U+00E2 U+0080 U+0093, rather than as e2 80 93. The corruption is
 * baked in upstream, so decoding correctly is not enough - the extra encoding
 * round has to be undone.
 *
 * Applied only when the result decodes cleanly, so text that was never
 * double-encoded passes through untouched.
 */
export function repairMojibake(value: string): string {
  // Any latin-1 supplement character is a candidate; the fatal decode below is
  // what actually decides. Accented text that was never double-encoded fails
  // that decode and is returned unchanged.
  if (!/[\u0080-\u00ff]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(value, (ch) => {
      const code = ch.codePointAt(0)!;
      if (code > 0xff) throw new Error("not latin-1 representable");
      return code;
    });
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
}

async function fetchCsv(url: string): Promise<RawRow[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);

  // The portal serves UTF-8 but does not always declare it, and `res.text()`
  // then falls back to latin-1 — which turns every en-dash in a delay-code
  // description into mojibake. Decode explicitly.
  const text = new TextDecoder("utf-8").decode(await res.arrayBuffer());
  return parse(text, { columns: true, skip_empty_lines: true, bom: true }) as RawRow[];
}

export async function ingestDelays(mode: Mode): Promise<{ read: number; written: number }> {
  const datasetId = DATASETS[mode];

  const dataRes = await findResource(datasetId, "CSV", (n) => /Delay Data since/i.test(n));
  const refreshedAt = await datasetRefreshedAt(datasetId);

  const run = await prisma.ingestRun.create({
    data: { source: `${datasetId}/${dataRes.name}`, notes: `portal last_refreshed=${refreshedAt ?? "unknown"}` },
  });

  const rows = await fetchCsv(dataRes.url);

  const records = [];
  let skipped = 0;

  for (const row of rows) {
    const occurredAt = parseOccurredAt(row.Date ?? "", row.Time ?? "");
    const minDelay = parseMinutes(row["Min Delay"]);
    const minGap = parseMinutes(row["Min Gap"]);
    // Location is `Station` on every current feed; `Location` is kept as a
    // fallback because older published files used that header.
    const locationRaw = (row.Station ?? row.Location ?? "").trim();
    const lineRaw = (row.Line ?? "").trim();
    const code = (row.Code ?? "").trim();

    if (occurredAt === null || minDelay === null || minGap === null || code === "") {
      skipped++;
      continue;
    }

    records.push({
      mode,
      occurredAt,
      dayOfWeek: (row.Day ?? "").trim(),
      hour: occurredAt.getUTCHours(),
      locationRaw,
      lineRaw,
      code,
      minDelay,
      minGap,
      bound: (row.Bound ?? "").trim() || null,
      vehicle: (row.Vehicle ?? "").trim() || null,
      sourceFile: dataRes.name,
    });
  }

  await prisma.delayIncident.deleteMany({ where: { mode } });
  for (let i = 0; i < records.length; i += 2000) {
    await prisma.delayIncident.createMany({ data: records.slice(i, i + 2000) });
  }

  const times = records.map((r) => r.occurredAt.getTime());
  await prisma.ingestRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      rowsRead: rows.length,
      rowsWritten: records.length,
      windowStart: times.length ? new Date(Math.min(...times)) : null,
      windowEnd: times.length ? new Date(Math.max(...times)) : null,
      notes: `${run.notes}; skipped=${skipped}`,
    },
  });

  return { read: rows.length, written: records.length };
}

export async function ingestCodes(mode: Mode): Promise<number> {
  const res = await findResource(DATASETS[mode], "CSV", (n) => /^Code Descriptions/i.test(n));
  const rows = (await fetchCsv(res.url)) as unknown as Array<Record<string, string>>;

  const records = rows
    .map((r) => ({
      code: (r["CODE"] ?? r["Code"] ?? "").trim(),
      mode,
      description: repairMojibake((r["DESCRIPTION"] ?? r["Description"] ?? "").trim()),
    }))
    .filter((r) => r.code !== "");

  await prisma.delayCode.deleteMany({ where: { mode } });
  await prisma.delayCode.createMany({ data: records });
  return records.length;
}
