/**
 * Map layer construction.
 *
 * Kept out of the component so the colour rules — which encode P-03 — are
 * readable in one place rather than buried in an effect.
 */

export interface Band {
  max: number;
  color: string;
  label: string;
}

/**
 * Exposure bands in gap-minutes per month, as fixed thresholds rather than a
 * per-route relative scale. A rider comparing two routes needs the colours to
 * mean the same thing on both; normalising within a route would paint its
 * least-bad segment green even when the whole route is bad.
 */
export const BANDS: Band[] = [
  { max: 15, color: "#3f9e6a", label: "under 15" },
  { max: 40, color: "#c9a227", label: "15-40" },
  { max: 80, color: "#e08a3c", label: "40-80" },
  { max: 140, color: "#d4593f", label: "80-140" },
  { max: Infinity, color: "#a8322a", label: "140+" },
];

export const UNKNOWN_COLOR = "#9a9a94";

/**
 * MapLibre colour expression for a segment line.
 *
 * Unknown segments are NOT given a pale version of the scale — a lighter green
 * reads as "mildly fine". They get a distinct grey, and the layer that draws
 * them is dashed, so absence of data is a different visual kind rather than a
 * low value (P-03).
 */
export function lineColorExpression(): unknown {
  const steps: unknown[] = ["step", ["get", "gapMinutesPerMonth"], BANDS[0]!.color];
  for (const b of BANDS.slice(0, -1)) {
    steps.push(b.max, BANDS[BANDS.indexOf(b) + 1]!.color);
  }
  return ["case", ["==", ["get", "confidence"], "unknown"], UNKNOWN_COLOR, steps];
}

export function bandFor(minutes: number): Band {
  return BANDS.find((b) => minutes < b.max) ?? BANDS[BANDS.length - 1]!;
}
