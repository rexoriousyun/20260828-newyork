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

/**
 * Top of the gradient, in rider-wait minutes per month.
 *
 * The 95th percentile of segments above the threshold. Values beyond this clamp,
 * so a single 415-minute outlier cannot flatten the ramp for everything else.
 */
export const RAMP_MAX = 170;

export interface Tokens {
  /** The route itself. Green is identity — "this is your line" — not a verdict. */
  typical: string;
  /** Sequential single-hue ramp, light to dark, applied above the threshold. */
  unreliable: [string, string, string];
  unknown: string;
  selection: string;
}

/** Validated for CVD separation, normal-vision floor and 3:1 contrast in both modes. */
export const LIGHT: Tokens = {
  typical: "#1e8f59",
  unreliable: ["#a32a14", "#82170e", "#5e0f08"],
  // Unknown is the route colour, dashed and thinned — greyscale belongs to the
  // basemap alone, so it cannot be borrowed to mean "no data".
  unknown: "#1e8f59",
  selection: "#1f6feb",
};

export const DARK: Tokens = {
  typical: "#7fd3a1",
  unreliable: ["#b8402e", "#d64c33", "#f25c3c"],
  unknown: "#7fd3a1",
  selection: "#6ea8ff",
};

export function tokensFor(dark: boolean): Tokens {
  return dark ? DARK : LIGHT;
}

/**
 * Colour by state, with a gradient inside the reserved one.
 *
 * A flat red above the threshold hides real magnitude — 50 minutes and 200
 * minutes a month are not the same problem, and reading them as identical was
 * the defect this ramp fixes.
 *
 * The gradient is a single hue, light to dark, and applies *only* within the
 * reserved colour. Typical stays flat neutral and unknown stays outside the ramp
 * entirely, so colour still marks one thing: where the trip costs you time.
 *
 * The ramp's ends were chosen against the neutrals, not for looks: a darker end
 * collides with the typical ink for protanopic vision, and a lighter start
 * collides with the unknown grey for everyone.
 */
export function lineColorExpression(t: Tokens): unknown {
  const mid = UNRELIABLE_THRESHOLD + (RAMP_MAX - UNRELIABLE_THRESHOLD) / 2;
  return [
    "case",
    ["==", ["get", "confidence"], "unknown"],
    t.unknown,
    [">=", ["coalesce", ["get", "gapMinutesPerMonth"], 0], UNRELIABLE_THRESHOLD],
    [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "gapMinutesPerMonth"], 0],
      UNRELIABLE_THRESHOLD, t.unreliable[0],
      mid, t.unreliable[1],
      RAMP_MAX, t.unreliable[2],
    ],
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

/**
 * Opacity for the unknown state.
 *
 * Unknown shares the route hue, so the distinction is carried entirely by dash,
 * weight and this transparency — three non-colour channels. It must read as
 * *unfinished*, never as a lighter shade of fine (P-03).
 */
export const UNKNOWN_OPACITY = 0.45;

/** CSS gradient for the legend swatch, so it teaches the ramp rather than one step. */
export function legendGradient(t: Tokens): string {
  return `linear-gradient(90deg, ${t.unreliable[0]}, ${t.unreliable[1]}, ${t.unreliable[2]})`;
}
