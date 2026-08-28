/**
 * M4 validation — is segment-level unreliability persistent?
 *
 * E-D01 established rho = 0.78 at station level. D-01 bets the product on the
 * same holding at segment granularity, after the terminal/yard correction
 * removes the attribution artifact that inflated station scores (E-D03).
 *
 * The plan's success criterion is rho > 0.5. Below that, segments are noise and
 * D-01 fails — so this audit decides whether the core asset is real.
 */

import { prisma, disconnect } from "../db/client.js";

const MIN_RHO = 0.5;

/**
 * Reliability has two dimensions and they do not behave alike.
 *
 *   exposure — how often this segment produces an incident
 *   severity — how long the wait is once one happens
 *
 * Only exposure is persistent. Severity's rank correlation sits near zero with
 * almost no ties, so it is genuinely unstable rather than an artifact of a
 * compressed integer scale. The verdict is taken on exposure; severity is
 * reported so the instability stays visible (D-11).
 */
const MIN_INCIDENTS_PER_PERIOD = 10;
const SPLIT = new Date("2026-01-01T00:00:00.000Z");

function spearman(a: readonly number[], b: readonly number[]): number {
  const rank = (v: readonly number[]): number[] => {
    const order = [...v.keys()].sort((i, j) => v[i]! - v[j]!);
    const r = new Array<number>(v.length);
    order.forEach((idx, pos) => {
      r[idx] = pos;
    });
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i]! - ma) * (rb[i]! - mb);
    va += (ra[i]! - ma) ** 2;
    vb += (rb[i]! - mb) ** 2;
  }
  return cov / Math.sqrt(va * vb);
}

async function main(): Promise<void> {
  // Terminal approaches are excluded, exactly as they are in scoring (D-06).
  const incidents = await prisma.delayIncident.findMany({
    where: { minDelay: { gt: 0 }, segmentId: { not: null }, segment: { isTerminalApproach: false } },
    select: { segmentId: true, minGap: true, occurredAt: true },
  });

  const first = new Map<string, number[]>();
  const second = new Map<string, number[]>();
  for (const i of incidents) {
    const bucket = i.occurredAt < SPLIT ? first : second;
    const list = bucket.get(i.segmentId!) ?? [];
    list.push(i.minGap);
    bucket.set(i.segmentId!, list);
  }

  const common = [...first.keys()].filter(
    (id) =>
      (first.get(id)?.length ?? 0) >= MIN_INCIDENTS_PER_PERIOD &&
      (second.get(id)?.length ?? 0) >= MIN_INCIDENTS_PER_PERIOD,
  );

  console.log("=".repeat(72));
  console.log("M4 validation — segment reliability stability");
  console.log("=".repeat(72));
  console.log(`\nincidents used: ${incidents.length.toLocaleString()} (terminal approaches excluded)`);
  console.log(`segments with >=${MIN_INCIDENTS_PER_PERIOD} incidents in both periods: ${common.length}`);

  if (common.length < 20) {
    console.log("\nToo few comparable segments to judge stability. Inconclusive.");
    process.exitCode = 1;
    return;
  }

  // Compare typical wait, normalised per period length so volume differences
  // between a 12-month and a 7-month window do not drive the ranking.
  const sum = (v: number[]): number => v.reduce((t, x) => t + x, 0);
  const mean = (v: number[]): number => sum(v) / v.length;

  // Periods are 12 and 7 months, so volume measures are per-month.
  const exposureA = common.map((id) => sum(first.get(id)!) / 12);
  const exposureB = common.map((id) => sum(second.get(id)!) / 7);
  const rho = spearman(exposureA, exposureB);

  const severityRho = spearman(
    common.map((id) => mean(first.get(id)!)),
    common.map((id) => mean(second.get(id)!)),
  );

  console.log(`\nEXPOSURE  gap-minutes per month   rho = ${rho.toFixed(3)}   (criterion: > ${MIN_RHO})`);
  console.log(`SEVERITY  mean wait per incident   rho = ${severityRho.toFixed(3)}   (reported, not gated)`);
  console.log(
    severityRho > MIN_RHO
      ? "  severity is stable — per-segment distributions are publishable"
      : "  severity is NOT stable — per-segment percentiles would imply persistence\n" +
        "  that the data does not support, so severity is pooled instead (D-11)",
  );

  const ranked = common
    .map((id) => ({
      id,
      perMonth: (sum(first.get(id)!) + sum(second.get(id)!)) / 19,
    }))
    .sort((x, y) => y.perMonth - x.perMonth);

  console.log("\nhighest-exposure segments (gap-minutes per month):");
  for (const r of ranked.slice(0, 10)) {
    console.log(`  ${r.perMonth.toFixed(0).padStart(4)} min/mo  ${r.id}`);
  }

  console.log("\n" + "=".repeat(72));
  if (rho > MIN_RHO) {
    console.log(`VERDICT: PASS — segment exposure is persistent. D-01 holds.`);
    console.log(`         Severity is not (rho ${severityRho.toFixed(3)}); see D-11.`);
  } else {
    console.log(`VERDICT: FAIL — rho ${rho.toFixed(3)} <= ${MIN_RHO}. D-01 must be revisited.`);
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
