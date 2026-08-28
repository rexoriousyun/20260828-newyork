/**
 * M2 — Min Gap data audit. THE GATE (docs/product/PLAN.md).
 *
 * D-02 makes headway gap the product's primary metric, on the strength of E-D09.
 * That decision is only safe if the field is actually recorded reliably. This
 * audit answers Q-1. If it fails, D-02 reverses and the core metric changes.
 *
 * Thresholds are pre-registered below so the verdict is not negotiated after
 * seeing the numbers (P-08).
 */

import { prisma, disconnect } from "../db/client.js";

const THRESHOLDS = {
  /** Gap should be at least the vehicle's own lateness. Below this is incoherent. */
  coherenceMin: 0.95,
  /** A delayed vehicle leaves a gap. A zero gap alongside a real delay is missing data. */
  completenessMin: 0.95,
  /** No month may fall below this, or the field's meaning shifted mid-window. */
  monthlyCompletenessFloor: 0.8,
} as const;

interface ModeStats {
  mode: string;
  delayed: number;
  coherent: number;
  complete: number;
  gapLessThanDelay: number;
  absurd: number;
}

async function modeStats(): Promise<ModeStats[]> {
  return prisma.$queryRawUnsafe<ModeStats[]>(`
    SELECT
      mode,
      COUNT(*)                                             AS delayed,
      SUM(CASE WHEN minGap >= minDelay THEN 1 ELSE 0 END)  AS coherent,
      SUM(CASE WHEN minGap > 0        THEN 1 ELSE 0 END)   AS complete,
      SUM(CASE WHEN minGap < minDelay THEN 1 ELSE 0 END)   AS gapLessThanDelay,
      SUM(CASE WHEN minGap > 1440     THEN 1 ELSE 0 END)   AS absurd
    FROM DelayIncident
    WHERE minDelay > 0
    GROUP BY mode
  `);
}

async function monthlyCompleteness(): Promise<Array<{ mode: string; month: string; ratio: number; n: number }>> {
  return prisma.$queryRawUnsafe(`
    SELECT mode,
           strftime('%Y-%m', occurredAt / 1000, 'unixepoch') AS month,
           CAST(SUM(CASE WHEN minGap > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS ratio,
           COUNT(*) AS n
    FROM DelayIncident
    WHERE minDelay > 0
    GROUP BY mode, month
    ORDER BY mode, month
  `);
}

/** Zero-minute records are 65% of the subway feed (E-D04) and must be excluded. */
async function zeroShare(): Promise<Array<{ mode: string; zero: number; total: number }>> {
  return prisma.$queryRawUnsafe(`
    SELECT mode,
           SUM(CASE WHEN minDelay = 0 THEN 1 ELSE 0 END) AS zero,
           COUNT(*)                                      AS total
    FROM DelayIncident
    GROUP BY mode
  `);
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const stats = await modeStats();
  const monthly = await monthlyCompleteness();
  const zeros = await zeroShare();

  console.log("=".repeat(72));
  console.log("M2 — Min Gap data audit (Q-1)");
  console.log("=".repeat(72));

  console.log("\nZero-minute records (must be filtered before any scoring — E-D04):");
  for (const z of zeros) {
    console.log(`  ${z.mode.padEnd(11)} ${pct(Number(z.zero), Number(z.total)).padStart(6)} of ${Number(z.total).toLocaleString()} records`);
  }

  console.log("\nAmong incidents with a real delay (minDelay > 0):");
  console.log(`  ${"mode".padEnd(11)}${"n".padStart(8)}${"coherent".padStart(11)}${"complete".padStart(11)}${"gap<delay".padStart(11)}${"absurd".padStart(9)}`);

  const failures: string[] = [];

  for (const s of stats) {
    const n = Number(s.delayed);
    const coherence = Number(s.coherent) / n;
    const completeness = Number(s.complete) / n;
    console.log(
      `  ${s.mode.padEnd(11)}${n.toLocaleString().padStart(8)}${pct(Number(s.coherent), n).padStart(11)}${pct(Number(s.complete), n).padStart(11)}${Number(s.gapLessThanDelay).toLocaleString().padStart(11)}${Number(s.absurd).toString().padStart(9)}`,
    );
    if (coherence < THRESHOLDS.coherenceMin) {
      failures.push(`${s.mode}: coherence ${(coherence * 100).toFixed(1)}% < ${THRESHOLDS.coherenceMin * 100}%`);
    }
    if (completeness < THRESHOLDS.completenessMin) {
      failures.push(`${s.mode}: completeness ${(completeness * 100).toFixed(1)}% < ${THRESHOLDS.completenessMin * 100}%`);
    }
  }

  // Prisma stores DateTime as integer milliseconds in SQLite, so strftime needs
  // an explicit unixepoch conversion. Without it every month comes back NULL and
  // this entire check passes vacuously — guard against that regression.
  const nullMonths = monthly.filter((m) => m.month === null || m.month === undefined).length;
  if (nullMonths > 0 || monthly.length < 12) {
    throw new Error(
      `Temporal stability check is not functioning: ${monthly.length} rows, ${nullMonths} null months. ` +
        `Expected one row per mode per month. Refusing to issue a verdict on a broken check.`,
    );
  }

  const unstable = monthly.filter((m) => Number(m.ratio) < THRESHOLDS.monthlyCompletenessFloor && Number(m.n) >= 100);
  console.log(`\nTemporal stability: ${monthly.length} mode-months checked, ${unstable.length} below floor`);
  for (const m of unstable.slice(0, 8)) {
    console.log(`  ${m.mode} ${m.month}: ${(Number(m.ratio) * 100).toFixed(1)}% complete (n=${Number(m.n)})`);
  }
  if (unstable.length > 0) {
    failures.push(`${unstable.length} mode-months below completeness floor — recording regime may have shifted`);
  }

  console.log("\n" + "=".repeat(72));
  if (failures.length === 0) {
    console.log("VERDICT: PASS — Min Gap is sound. D-02 holds; proceed to M3.");
  } else {
    console.log("VERDICT: FAIL — D-02 must be revisited before modelling:");
    for (const f of failures) console.log(`  - ${f}`);
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
