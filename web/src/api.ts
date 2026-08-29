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
    blockedBy: { station: string; state: string; note?: string } | null;
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

export interface JourneyLeg {
  kind: "ride" | "walk";
  routeId?: string;
  departAt: number;
  arriveAt: number;
  fromName: string;
  toName: string;
  /** Null on a walk: a footpath has no reliability to report. */
  reliability: LegRisk | null;
}

export interface DepartureAdvice {
  leaveAt: number;
  arriveAt: number;
  slackMinutes: number;
  disrupted: { arriveAt: number; oneInTrips: number | null } | null;
  covered: { leaveAt: number; extraMinutes: number } | null;
}

export interface ScoredJourney {
  advice: DepartureAdvice | null;
  id: string;
  typicalMinutes: number;
  disruptedMinutes: number;
  transfers: number;
  departAt: number;
  arriveAt: number;
  legs: JourneyLeg[];
  reliability: {
    disruptionRisk: number;
    oneInTrips: number | null;
    minutesWhenDisrupted: number;
    minutesWhenBad: number;
    coverage: number;
    worst: Array<{ from: string; to: string; risk: number }>;
    /** The one stretch that dominates, or null when the risk is spread. */
    dominant: { from: string; to: string; risk: number } | null;
  };
  geojson: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: "LineString"; coordinates: Array<[number, number]> };
      properties: {
        kind: "ride" | "walk";
        risk: number | null;
        gapMinutesPerMonth: number | null;
        confidence: "known" | "unknown" | "none";
        from: string;
        to: string;
      };
    }>;
  };
}

export interface PlanResult {
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
): Promise<PlanResult> {
  const q = `${when.mode}=${when.seconds}`;
  return get(`/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&${q}`);
}
