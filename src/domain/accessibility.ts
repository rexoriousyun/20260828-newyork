/**
 * Step-free access as a routing constraint.
 *
 * `P-05` and `D-07`: accessibility filters the route set *before* anything is
 * ranked. It never contributes a weight to a reliability score, because for
 * U-04 the failure is binary — a station that is 95% accessible is unusable on
 * the day it is not, and a blended score would call that "slightly worse".
 *
 * Two independent inputs, deliberately not collapsed:
 *
 *   baseline  GTFS `wheelchair_boarding` — is the station built step-free?
 *   live      GTFS-RT alerts — is an elevator out right now?
 *
 * A station can be built accessible and be unusable today. Merging them would
 * hide which is which, and the rider needs to know: one is permanent, the other
 * may clear in an hour.
 */

export type AccessState = "accessible" | "outage" | "not-accessible" | "unknown";

export interface StationAccess {
  station: string;
  state: AccessState;
  /** Present when state is "outage" — what the TTC actually said. */
  note?: string;
}

/**
 * Parses the station name from an alert description.
 *
 * The feed puts the station before a colon — "Cedarvale: Elevator out of
 * service between platform and upper concourse" — and lists *routes* in
 * `informed_entity`, never the station. So the text prefix is the only handle
 * there is.
 */
export function stationFromAlert(description: string): string | null {
  const idx = description.indexOf(":");
  if (idx <= 0 || idx > 40) return null;
  const name = description.slice(0, idx).trim().toUpperCase();
  // A route alert reads "506 Carlton: Detour via…" — a leading route number
  // means this is not a station.
  if (/^\d/.test(name) || name === "") return null;
  return name;
}

export function isElevatorAlert(description: string): boolean {
  return /\b(elevator|escalator)\b/i.test(description);
}

/**
 * Resolves one station's state.
 *
 * An outage outranks the baseline: built step-free but with the elevator out is
 * *not usable today*, which is the whole point of checking live data.
 */
export function resolveState(
  boarding: number | undefined,
  outageNote: string | undefined,
): StationAccess["state"] {
  if (outageNote !== undefined) return "outage";
  if (boarding === 1) return "accessible";
  if (boarding === 2) return "not-accessible";
  return "unknown";
}

/**
 * Whether a rider who needs step-free access can use this station.
 *
 * `unknown` is NOT usable. Absence of an alert is not evidence an elevator
 * works — the feed reports outages it knows about, and we would be inventing
 * reassurance we cannot support (P-03). U-04 abandons us the first time we
 * route them somewhere we could not verify.
 */
export function isUsable(state: AccessState): boolean {
  return state === "accessible";
}

/* ------------------------------------------------------------------------- */

import { prisma } from "../db/client.js";

/**
 * Current step-free state for every station we know about.
 *
 * Returned as a map so callers can filter cheaply. Stations named in an alert
 * that we cannot match are returned separately rather than dropped — an
 * unmatched outage is a coverage gap, and silently discarding it would let the
 * map imply a station is fine when the TTC has said otherwise (P-08).
 */
export async function stationAccessMap(): Promise<{
  states: Map<string, StationAccess>;
  unmatchedOutages: string[];
}> {
  const [baseline, alerts] = await Promise.all([
    prisma.stationAccess.findMany(),
    prisma.serviceAlert.findMany({ where: { isElevator: true, stationName: { not: null } } }),
  ]);

  const outages = new Map<string, string>();
  for (const a of alerts) outages.set(a.stationName!, a.description);

  const states = new Map<string, StationAccess>();
  for (const b of baseline) {
    const note = outages.get(b.station);
    const state = resolveState(b.boarding, note);
    states.set(b.station, note === undefined ? { station: b.station, state } : { station: b.station, state, note });
  }

  const unmatchedOutages = [...outages.keys()].filter((s) => !states.has(s));
  return { states, unmatchedOutages };
}

/**
 * State for a segment endpoint.
 *
 * Surface segments are named for street corners, not stations, and a corner has
 * no elevator — so a non-station endpoint is not "unknown accessibility", it is
 * simply not gated by one. Returning `null` keeps that distinct from a station
 * we genuinely cannot verify.
 */
export function endpointState(
  name: string,
  states: Map<string, StationAccess>,
): StationAccess | null {
  return states.get(name.toUpperCase()) ?? null;
}
