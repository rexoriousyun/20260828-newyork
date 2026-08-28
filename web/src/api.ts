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
