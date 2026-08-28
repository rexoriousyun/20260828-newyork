/**
 * The map's visual encoding.
 *
 * Three states, each carrying two channels — colour and pattern/weight — so no
 * state is ever expressed by colour alone (design concept; P-03).
 *
 * Colour is reserved: the basemap is greyed server-side and typical segments are
 * neutral ink, so the single red marks only the stretches that cost riders time.
 */

/**
 * Minutes of rider waiting caused per month, above which a stretch is called
 * unreliable. 45 is the 75th percentile of scorable segments — "the worst
 * quarter of what we can measure" — chosen so colour stays reserved rather than
 * covering most of the map.
 */
export const UNRELIABLE_THRESHOLD = 45;

export interface Tokens {
  typical: string;
  unreliable: string;
  unknown: string;
  selection: string;
}

/** Validated for CVD separation, normal-vision floor and 3:1 contrast in both modes. */
export const LIGHT: Tokens = {
  typical: "#33332f",
  unreliable: "#b03217",
  unknown: "#87877f",
  selection: "#1f6feb",
};

export const DARK: Tokens = {
  typical: "#e5e5df",
  unreliable: "#e35f3f",
  unknown: "#8a8a83",
  selection: "#6ea8ff",
};

export function tokensFor(dark: boolean): Tokens {
  return dark ? DARK : LIGHT;
}

/** Colour by state. Unknown never receives the reserved hue. */
export function lineColorExpression(t: Tokens): unknown {
  return [
    "case",
    ["==", ["get", "confidence"], "unknown"],
    t.unknown,
    [">=", ["coalesce", ["get", "gapMinutesPerMonth"], 0], UNRELIABLE_THRESHOLD],
    t.unreliable,
    t.typical,
  ];
}

/**
 * Weight is the second channel: unreliable stretches are heavier, not just redder.
 *
 * `zoom` may only feed a top-level `step` or `interpolate`, so the per-feature
 * factor cannot wrap the ramp — it goes inside each stop's output instead.
 */
export function lineWidthExpression(): unknown {
  const heavier = (base: number): unknown => [
    "case",
    [">=", ["coalesce", ["get", "gapMinutesPerMonth"], 0], UNRELIABLE_THRESHOLD],
    Number((base * 1.45).toFixed(2)),
    base,
  ];
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    9, heavier(3),
    12, heavier(4.5),
    14, heavier(6),
    17, heavier(10),
  ];
}

export type State = "typical" | "unreliable" | "unknown";

export function stateOf(confidence: string, minutes: number | null): State {
  if (confidence === "unknown") return "unknown";
  return (minutes ?? 0) >= UNRELIABLE_THRESHOLD ? "unreliable" : "typical";
}
