/**
 * The benchmark table's shape and buckets, shared by the builder and the API.
 */

export const BENCHMARK_PATH = "data/benchmark.json";

/**
 * Coverage both sides of a comparison must reach.
 *
 * A trip measured on a fifth of its length looks safe because most of it was
 * never checked. Ranking it against trips measured on most of theirs compares
 * how much data we hold, not how the routes run. The bar matches the one the
 * interface already uses to call coverage thin, so a trip that earns a
 * comparison is exactly a trip we do not caveat.
 */
export const MIN_COMPARABLE_COVERAGE = 0.5;

export interface DurationBucket {
  /** Inclusive lower bound, exclusive upper bound, in minutes. */
  from: number;
  to: number;
  /** How the reference class is named on screen. */
  label: string;
}

/**
 * Comparable means the same length: a 70-minute trip crosses more stretches
 * than a 20-minute one and has more chances to meet an incident, so ranking
 * them together would tell a rider that long trips are badly run rather than
 * anything about the routes they chose.
 */
export const DURATION_BUCKETS: readonly DurationBucket[] = [
  { from: 0, to: 20, label: "under 20 min" },
  { from: 20, to: 35, label: "20–35 min" },
  { from: 35, to: 50, label: "35–50 min" },
  { from: 50, to: 70, label: "50–70 min" },
  { from: 70, to: 1000, label: "over 70 min" },
] as const;

export function bucketFor(minutes: number): number | null {
  const i = DURATION_BUCKETS.findIndex((b) => minutes >= b.from && minutes < b.to);
  return i === -1 ? null : i;
}

export interface BenchmarkTable {
  builtAt: string;
  sampled: number;
  /** Departure times sampled, seconds since midnight, one per band covered. */
  departAt: number[];
  buckets: Array<DurationBucket & {
    /** Sorted disruption risks, or null when too few trips to be a reference. */
    allDay: number[] | null;
    /**
     * The same, keyed by band id.
     *
     * Kept separate per band rather than pooled: comparing a 5pm trip's
     * pm-peak figure against a reference sampled at 8am would rank it against
     * a different measurement, which is the error the toggle exists to avoid.
     */
    atTime: Record<string, number[] | null>;
  }>;
}

/**
 * How far from typical a trip must be before the comparison takes a side.
 *
 * Rank alone is not enough. Comparable trips cluster tightly, so a trip 15%
 * riskier than the median can still be safer than only a seventh of its class —
 * and "riskier than most trips this long" printed beside "1 in 218, typically
 * 1 in 250" reads as the product overselling a rounding difference. A rider who
 * checks our arithmetic and finds it strained stops believing the rest (PR-08).
 *
 * So a verdict needs both: an unusual rank *and* a difference worth acting on.
 * Otherwise the honest answer is that this trip is ordinary.
 */
export const MATERIAL_RATIO = 1.25;

/**
 * Where a value sits in a sorted reference, as a share of trips it beats.
 * Returns null when there is no reference to compare against — a missing
 * comparison is stated, never filled in with a plausible one (P-03).
 */
export type Verdict = "safer-4in5" | "safer-most" | "typical" | "riskier-most" | "riskier-4in5";

/**
 * The side the comparison takes, decided once.
 *
 * Rank and magnitude both have to agree, and the rule lives here rather than in
 * the interface so there is a single bar rather than two that drift.
 */
export function verdictFor(saferThan: number, ratioToTypical: number | null): Verdict {
  if (ratioToTypical === null) return "typical";
  if (saferThan >= 0.6 && ratioToTypical <= 1 / MATERIAL_RATIO) {
    return saferThan >= 0.8 ? "safer-4in5" : "safer-most";
  }
  if (saferThan <= 0.4 && ratioToTypical >= MATERIAL_RATIO) {
    return saferThan <= 0.2 ? "riskier-4in5" : "riskier-most";
  }
  return "typical";
}

export function percentileOf(value: number, sorted: readonly number[] | null | undefined): number | null {
  if (sorted === null || sorted === undefined || sorted.length === 0) return null;
  let below = 0;
  for (const v of sorted) {
    if (v > value) break;
    below++;
  }
  // Share of the reference this trip is *safer* than.
  return Number((1 - below / sorted.length).toFixed(3));
}
