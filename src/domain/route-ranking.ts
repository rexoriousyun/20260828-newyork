/**
 * Which routes cost riders the most time.
 *
 * `PR-02` is that unreliability is unevenly distributed and nobody publishes
 * where. The segment map answers that for one route at a time; this answers it
 * across the network, which is what `J-04` opens with — a rider suspects their
 * route is bad and wants to know whether it is bad compared with anything.
 *
 * **Total harm, not per-trip risk.** These are different questions and both are
 * honest. Per-trip risk is what the planner ranks on: how likely *your* ride
 * goes wrong, with frequency normalised away. Total harm is minutes of waiting
 * a route causes across everyone who rides it, and it is the civic question —
 * where the city's problem actually is. A busy route dominates precisely
 * because it carries more people through more failures, and that is the point
 * rather than a distortion.
 *
 * The unit is the same one the explore map already draws, so the list and the
 * map speak the same language.
 */

export interface RouteHarmInput {
  routeId: string;
  mode: string;
  /** Segments on this route, whether or not any of them could be scored. */
  segmentCount: number;
  /** Recency-weighted gap minutes, already divided by effective months. */
  gapMinutesPerMonth: number;
  /** Distinct segments that contributed any measured exposure. */
  measuredSegments: number;
  /** Leading cause by weighted gap minutes, as the TTC describes it. */
  leadingCause: string | null;
  /** Share of the waiting where the vehicle never came, or null if unmeasured. */
  neverCameShare: number | null;
  name: string;
}

export interface RankedRoute extends RouteHarmInput {
  /** Share of the route's segments carrying any measurement. */
  coverage: number;
  /**
   * True when much of the route is unmeasured, so the figure is a floor rather
   * than a total. Never silently corrected upwards: dividing by coverage would
   * invent the minutes we failed to attribute, which is the estimate `P-03`
   * forbids. Stated instead.
   */
  partial: boolean;
  rank: number;
}

/**
 * Below this, the measured total is too small a sample of the route to present
 * as its burden without saying so on the same line.
 */
export const PARTIAL_COVERAGE = 0.8;

/**
 * Ranked within mode, not across it.
 *
 * Surface delay is only partly geocodable (`E-D07`) while every subway incident
 * names a station, so the two modes are measured to different standards: across
 * the top of the list subway sits at 100% coverage and buses near 51%. Ranking
 * them together would put the subway above buses for being better recorded,
 * dressed up as being worse to ride. `D-11` already refuses to compare modes
 * for severity; this is the same refusal for exposure.
 */
export function rankRoutes(input: readonly RouteHarmInput[]): Map<string, RankedRoute[]> {
  const byMode = new Map<string, RankedRoute[]>();
  for (const r of input) {
    const mode = r.mode === "subway" ? "subway" : "surface";
    const coverage = r.segmentCount === 0 ? 0 : r.measuredSegments / r.segmentCount;
    const row: RankedRoute = {
      ...r,
      coverage: Number(coverage.toFixed(2)),
      partial: coverage < PARTIAL_COVERAGE,
      rank: 0,
    };
    const list = byMode.get(mode);
    if (list === undefined) byMode.set(mode, [row]);
    else list.push(row);
  }
  for (const list of byMode.values()) {
    list.sort((a, b) => b.gapMinutesPerMonth - a.gapMinutesPerMonth);
    list.forEach((r, i) => { r.rank = i + 1; });
  }
  return byMode;
}
