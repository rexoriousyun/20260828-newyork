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
 * unreliable. 90 is the 75th percentile of scorable segments — "the worst
 * quarter of what we can measure" — chosen so colour stays reserved rather than
 * covering most of the map.
 *
 * Recalibrated when recency weighting landed: the figure is now a
 * decay-weighted rate over ~4.3 effective months rather than a flat average
 * over 19, which roughly doubled the distribution.
 */
export const UNRELIABLE_THRESHOLD = 90;

/**
 * Top of the gradient, in rider-wait minutes per month.
 *
 * The 95th percentile of segments above the threshold. Values beyond this clamp,
 * so a single 415-minute outlier cannot flatten the ramp for everything else.
 */
export const RAMP_MAX = 170;

export interface Tokens {
  /** Scale stops: green at zero exposure, orange at the threshold, red at the top. */
  scale: [string, string, string];
  unknown: string;
  /** Struck-out treatment for a segment a step-free rider cannot use. */
  blocked: string;
  /** Casing under a planned trip, so it reads as one object over the basemap. */
  casing: string;
  /**
   * Walking legs. Deliberately off the scale: the model has nothing to say
   * about a footpath, and a green dash would claim "reliable" about a stretch
   * that was never measured. Grey is otherwise the basemap's alone — the
   * exception holds because this is trip geometry, not a data state, and it is
   * darker than any basemap ink so it never reads as a street.
   */
  walk: string;
  selection: string;
}

/** Validated for CVD separation, normal-vision floor and 3:1 contrast in both modes. */
export const LIGHT: Tokens = {
  scale: ["#1a7f4c", "#d9882c", "#c33f2b"],
  // Unknown takes the scale's low end, dashed and thinned — greyscale belongs to
  // the basemap alone, so it cannot be borrowed to mean "no data".
  unknown: "#1a7f4c",
  blocked: "#2b2b28",
  casing: "#ffffff",
  walk: "#4a4a44",
  selection: "#1f6feb",
};

export const DARK: Tokens = {
  scale: ["#57c78a", "#eda545", "#e35f4e"],
  unknown: "#57c78a",
  blocked: "#d8d8d2",
  casing: "#0d0d10",
  walk: "#9c9c94",
  selection: "#6ea8ff",
};

export function tokensFor(dark: boolean): Tokens {
  return dark ? DARK : LIGHT;
}

/**
 * One continuous green-orange-red scale across exposure.
 *
 * Green at zero, orange at the threshold, red at the top — the reading everyone
 * already knows from traffic signals, so the encoding needs no teaching.
 *
 * Values are moderate by intent. An earlier version drove the severe end almost
 * to black chasing colour-vision separation; it validated and looked wrong, and
 * a scale nobody wants to look at is not a safer scale.
 *
 * Green against red is the textbook colour-vision collision and no moderate
 * palette escapes it: the best available separation here is ΔE 7.2, inside the
 * band that is legal *only* alongside a second channel. Line weight is that
 * channel — segments above the threshold render 45% heavier — and the legend
 * names each state in words.
 */
export function lineColorExpression(t: Tokens, property = "gapMinutesPerMonth"): unknown {
  return [
    "case",
    ["==", ["get", "confidence"], "unknown"],
    t.unknown,
    [
      "interpolate",
      ["linear"],
      // Never `coalesce(..., 0)` on its own: a missing value would land on the
      // reliable end of the ramp and absence of data would read as good news
      // (P-03). The unknown case above is what keeps that honest.
      ["coalesce", ["get", property], 0],
      0, t.scale[0],
      UNRELIABLE_THRESHOLD, t.scale[1],
      RAMP_MAX, t.scale[2],
    ],
  ];
}

/**
 * Weight is the second channel: unreliable stretches are heavier, not just redder.
 *
 * `zoom` may only feed a top-level `step` or `interpolate`, so the per-feature
 * factor cannot wrap the ramp — it goes inside each stop's output instead.
 */
export function lineWidthExpression(property = "gapMinutesPerMonth"): unknown {
  const heavier = (base: number): unknown => [
    "case",
    [">=", ["coalesce", ["get", property], 0], UNRELIABLE_THRESHOLD],
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

/** CSS gradient for the legend swatch, so it teaches the scale rather than one step. */
export function legendGradient(t: Tokens): string {
  return `linear-gradient(90deg, ${t.scale[0]}, ${t.scale[1]}, ${t.scale[2]})`;
}
