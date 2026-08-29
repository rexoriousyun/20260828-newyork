export interface RouteSummary {
  routeId: string;
  direction: string;
  mode: string;
  name: string;
  segments: number;
  scored: number;
}

export type Confidence = "high" | "low" | "unknown";

export interface SegmentReliability {
  segment: {
    id: string;
    routeId: string;
    direction: string;
    fromStation: string;
    toStation: string;
    isTerminalApproach: boolean;
  };
  exposure: { gapMinutesPerMonth: number; incidentsPerMonth: number } | null;
  severity: { p50: number; p90: number; p95: number; unit: string; basis: string } | null;
  sample: { incidents: number; window: { start: string; end: string } | null; filters: string[] };
  causes: Array<{ code: string; description: string; share: number }>;
  confidence: Confidence;
}

export interface RouteReliability {
  routeId: string;
  direction: string;
  coverage: { segments: number; scored: number; unknown: number };
  segments: SegmentReliability[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const fetchRoutes = (): Promise<{ routes: RouteSummary[] }> => get("/routes");

export function fetchRouteReliability(
  routeId: string,
  direction: string,
  filters: { dayOfWeek?: string; hour?: number },
): Promise<RouteReliability> {
  const q = new URLSearchParams();
  if (filters.dayOfWeek !== undefined) q.set("dayOfWeek", filters.dayOfWeek);
  if (filters.hour !== undefined) q.set("hour", String(filters.hour));
  const suffix = q.toString() === "" ? "" : `?${q.toString()}`;
  return get(`/routes/${encodeURIComponent(routeId)}/${direction}/reliability${suffix}`);
}

export interface SegmentFeature {
  type: "Feature";
  id: number;
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
  properties: {
    segmentId: string;
    from: string;
    to: string;
    confidence: Confidence;
    gapMinutesPerMonth: number | null;
    incidentsPerMonth: number | null;
    incidents: number;
    isTerminalApproach: boolean;
    drawnOnStreets: boolean;
    /** Set only when step-free routing is on and an endpoint blocks this segment. */
    blockedBy: { station: string; state: string; note?: string } | null | undefined;
  };
}

export interface RouteMap {
  type: "FeatureCollection";
  bbox: [number, number, number, number] | null;
  coverage: { segments: number; scored: number; approximated: number };
  features: SegmentFeature[];
}

export function fetchRouteMap(
  routeId: string,
  direction: string,
  filters: { dayOfWeek?: string; hour?: number; stepFree?: boolean },
): Promise<RouteMap> {
  const q = new URLSearchParams();
  if (filters.dayOfWeek !== undefined) q.set("dayOfWeek", filters.dayOfWeek);
  if (filters.hour !== undefined) q.set("hour", String(filters.hour));
  if (filters.stepFree === true) q.set("stepFree", "1");
  const suffix = q.toString() === "" ? "" : `?${q.toString()}`;
  return get(`/routes/${encodeURIComponent(routeId)}/${direction}/map${suffix}`);
}

export interface LegRisk {
  risk: number;
  /** Null when this leg could not be scored at all — unknown, not fine. */
  oneInTrips: number | null;
  coverage: number;
  /** This leg carries the largest single share of the trip's risk. */
  isWorst: boolean;
}

export interface Disruption {
  id: string;
  kind: "no-service" | "bypass" | "detour" | "elevator" | "notice";
  /** Every route this one event affects — the TTC publishes it once per route. */
  routeIds: string[];
  cause: string | null;
  shuttle: boolean;
  /** The alert text with its route prefix stripped. */
  text: string;
}

export interface JourneyLeg {
  kind: "ride" | "walk";
  routeId?: string;
  departAt: number;
  arriveAt: number;
  fromName: string;
  toName: string;
  /** Null on a walk: a footpath has no reliability to report. */
  reliability: LegRisk | null;
  /** The same leg on the band view. Null when it could not be conditioned. */
  reliabilityAtTime: LegRisk | null;
  /** Flagged by the TTC today. Empty on a walk. */
  disruptions: Disruption[];
}

export interface DepartureAdvice {
  leaveAt: number;
  arriveAt: number;
  slackMinutes: number;
  disrupted: { arriveAt: number; oneInTrips: number | null } | null;
  covered: { leaveAt: number; extraMinutes: number } | null;
}

export interface Comparison {
  /** Share of comparable trips this one is safer than. */
  saferThan: number;
  /** What a typical trip of this length does, as 1 in N. */
  typicalOneInTrips: number | null;
  /** This trip's risk over the typical one's. Above 1 is worse. */
  ratioToTypical: number | null;
  /** The side the comparison takes. Decided on the server; see benchmark/table.ts. */
  verdict: "safer-4in5" | "safer-most" | "typical" | "riskier-most" | "riskier-4in5";
  /** How the reference class is named. */
  label: string;
}

export interface JourneyReliability {
  disruptionRisk: number;
  oneInTrips: number | null;
  minutesWhenDisrupted: number;
  minutesWhenBad: number;
  coverage: number;
  worst: Array<{ from: string; to: string; risk: number }>;
  /** The one stretch that dominates, or null when the risk is spread. */
  dominant: { from: string; to: string; risk: number } | null;
  /**
   * How this trip ranks against others of its length, or null when there is no
   * fair reference — too few sampled trips, or too little of this one measured.
   */
  comparison: Comparison | null;
}

export interface BandReliability extends JourneyReliability {
  bands: Array<{ id: string; label: string }>;
  /** Share of scored stretches using their own band rather than the all-day figure. */
  conditionedShare: number;
}

export interface ScoredJourney {
  advice: DepartureAdvice | null;
  /** Today's events on this way, one per incident rather than one per route. */
  disruptions: Disruption[];
  /** Nothing the TTC has flagged today touches this way. */
  avoidsDisruption: boolean;
  /** Measured only in the bands this trip runs in, or null when none could be. */
  atTime: BandReliability | null;
  id: string;
  typicalMinutes: number;
  disruptedMinutes: number;
  transfers: number;
  departAt: number;
  arriveAt: number;
  legs: JourneyLeg[];
  reliability: JourneyReliability;
  geojson: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: "LineString"; coordinates: Array<[number, number]> };
      properties: {
        kind: "ride" | "walk";
        risk: number | null;
        gapMinutesPerMonth: number | null;
        gapMinutesPerMonthAtTime: number | null;
        conditioned: boolean;
        confidence: "known" | "unknown" | "none";
        from: string;
        to: string;
      };
    }>;
  };
}

export interface StationAccessState {
  station: string;
  state: "accessible" | "outage" | "not-accessible" | "unknown";
  note?: string;
}

export interface PlanResult {
  /** When the live alerts feed was last seen, and whether that is recent. */
  alerts?: { ageHours: number | null; stale: boolean };
  /** Present when the rider asked for step-free. */
  stepFree?: {
    /** Stations the fastest way would have used, and this one avoids. */
    blockedStations: StationAccessState[];
    /** The rider's own origin or destination, when it is not step-free. */
    endsBlocked: StationAccessState[];
    /** The fastest way was already step-free, so the constraint cost nothing. */
    changedNothing: boolean;
  } | null;
  journeys?: ScoredJourney[];
  alternativesFound?: number;
  journey?: null;
  reason?: string;
}

export interface StopHit { id: string; name: string; lat: number; lon: number }

export const searchStops = (q: string): Promise<{ stops: StopHit[] }> =>
  get(`/stops/search?q=${encodeURIComponent(q)}`);

/**
 * `when.mode` is how the rider stated the trip, not a detail of the request:
 * a deadline makes the planner search backwards for the latest departure that
 * still makes it, which is a different question from "what leaves at 08:30".
 */
export function planTrip(
  from: string,
  to: string,
  when: { mode: "arriveBy" | "departAt"; seconds: number },
  stepFree = false,
): Promise<PlanResult> {
  const q = `${when.mode}=${when.seconds}${stepFree ? "&stepFree=true" : ""}`;
  return get(`/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&${q}`);
}

export interface RankedRoute {
  routeId: string;
  name: string;
  mode: string;
  rank: number;
  gapMinutesPerMonth: number;
  coverage: number;
  /** Much of the route is unmeasured, so the figure is a floor, not a total. */
  partial: boolean;
  leadingCause: string | null;
  causes: Array<{ code: string; cause: string; minutesPerMonth: number }>;
}

export interface Ranking {
  modes: { subway?: RankedRoute[]; surface?: RankedRoute[] };
}

/** Which routes cost riders the most time. Static between ingests. */
export function fetchRanking(): Promise<Ranking> {
  return get("/routes/ranking");
}
