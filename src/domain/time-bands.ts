/**
 * Time bands, defined once for both the audit and the product.
 *
 * E-D20 established that per-trip risk varies by time of day and that the
 * variation persists (rho = 0.406 across 953 segment-bands). If the audit that
 * proved it and the scorer that uses it could disagree about where the day is
 * cut, the evidence would stop applying to the thing it was measured on.
 *
 * The splits are the TTC's own peak periods, not equal slices of the clock.
 * Night is separated because service changes shape there rather than merely
 * thinning.
 */

export interface Band {
  id: string;
  /** How a rider would say it. */
  label: string;
  /** Inclusive start hour, exclusive end hour, local time. */
  from: number;
  to: number;
}

export const BANDS: readonly Band[] = [
  { id: "night", label: "midnight to 6am", from: 0, to: 6 },
  { id: "am-peak", label: "6 to 9am", from: 6, to: 9 },
  { id: "midday", label: "9am to 3pm", from: 9, to: 15 },
  { id: "pm-peak", label: "3 to 7pm", from: 15, to: 19 },
  { id: "evening", label: "7pm to midnight", from: 19, to: 24 },
] as const;

export function bandOf(hour: number): Band {
  return BANDS.find((b) => hour >= b.from && hour < b.to) ?? BANDS[0]!;
}

/**
 * The band a departure falls in. GTFS times run past midnight — a trip leaving
 * at 25:10 is one a rider would call 01:10, and belongs to night.
 */
export function bandOfSeconds(secondsSinceMidnight: number): Band {
  return bandOf(Math.floor(secondsSinceMidnight / 3600) % 24);
}

/**
 * How much exposure a band needs before its own figure is used instead of the
 * all-day one.
 *
 * Expressed as incidents the *pooled* rate predicts across the trips that
 * actually run in the band, not as incidents observed. Gating on observations
 * would drop every quiet band and leave only the bad ones, which is the bias
 * that made the first run of the time-of-day audit report the opposite result
 * (E-D20). Three is the same bar the evidence was established under.
 */
export const MIN_EXPECTED_IN_BAND = 3;

export const DAY_SECONDS = 24 * 3600;

/**
 * A wall-clock time, placed in the service day the schedule actually uses.
 *
 * GTFS runs a service day past midnight: this feed's weekday service spans
 * 03:28 to 30:35, meaning 06:35 the following morning. A rider asking at 01:45
 * is asking about 25:45, and comparing 01:45 against the window directly made
 * the planner refuse trips that exist — it reported "no journey" for a 01:14
 * departure that was right there in the data.
 *
 * Anything still before the window after the shift is genuinely outside the
 * loaded service, and the caller says so rather than implying the network
 * stops there (P-03).
 */
export function inServiceDay(seconds: number, window: { from: number; to: number }): number {
  return seconds < window.from && seconds + DAY_SECONDS <= window.to
    ? seconds + DAY_SECONDS
    : seconds;
}
