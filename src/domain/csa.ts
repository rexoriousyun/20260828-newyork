/**
 * Connection Scan: earliest-arrival journey planning.
 *
 * One pass over connections sorted by departure time. Chosen over RAPTOR
 * because it is short enough to be obviously correct, and correctness matters
 * more here than the last millisecond — the reliability layer is the product,
 * the planner underneath it just has to be right.
 */

import type { ConnectionSet } from "./connections.js";
import { MIN_TRANSFER_S, type Footpaths } from "./footpaths.js";

const INF = 0x7fffffff;

export interface Leg {
  kind: "ride" | "walk";
  fromStop: string;
  toStop: string;
  departAt: number;
  arriveAt: number;
  /** Present on a ride. */
  routeId?: string;
  tripId?: string;
}

export interface Journey {
  legs: Leg[];
  departAt: number;
  arriveAt: number;
  transfers: number;
}

interface Reached {
  /** Connection index that produced the best arrival at this stop, or -1. */
  viaConnection: Int32Array;
  /** Stop walked from, or -1 when the arrival was a ride. */
  viaWalk: Int32Array;
  arrival: Int32Array;
}

/**
 * Earliest arrival at every stop, given a departure time and origin.
 *
 * A connection is boardable when we are already aboard its trip, or when we
 * reached its departure stop early enough to transfer. Tracking trip
 * reachability is what keeps a rider from being charged a transfer penalty for
 * simply staying on the vehicle.
 */
function scan(
  c: ConnectionSet,
  paths: Footpaths,
  origin: number,
  departAt: number,
  horizonSeconds: number,
): Reached {
  const stops = c.stopIds.length;
  const arrival = new Int32Array(stops).fill(INF);
  const viaConnection = new Int32Array(stops).fill(-1);
  const viaWalk = new Int32Array(stops).fill(-1);
  const onTrip = new Uint8Array(c.tripIds.length);

  const relaxWalks = (stop: number): void => {
    for (let e = paths.offset[stop]!; e < paths.offset[stop + 1]!; e++) {
      const to = paths.target[e]!;
      const t = arrival[stop]! + paths.seconds[e]!;
      if (t < arrival[to]!) {
        arrival[to] = t;
        viaConnection[to] = -1;
        viaWalk[to] = stop;
      }
    }
  };

  arrival[origin] = departAt;
  relaxWalks(origin);

  // Binary search to the first connection departing at or after departAt:
  // scanning the earlier ones cannot help and there are hundreds of thousands.
  let lo = 0;
  let hi = c.count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c.depTime[mid]! < departAt) lo = mid + 1;
    else hi = mid;
  }

  const limit = departAt + horizonSeconds;
  for (let i = lo; i < c.count; i++) {
    const dep = c.depTime[i]!;
    if (dep > limit) break;

    const trip = c.trip[i]!;
    const from = c.fromStop[i]!;
    const boardable = onTrip[trip] === 1 || arrival[from]! + MIN_TRANSFER_S <= dep;
    if (!boardable) continue;

    onTrip[trip] = 1;
    const to = c.toStop[i]!;
    if (c.arrTime[i]! < arrival[to]!) {
      arrival[to] = c.arrTime[i]!;
      viaConnection[to] = i;
      viaWalk[to] = -1;
      relaxWalks(to);
    }
  }

  return { arrival, viaConnection, viaWalk };
}

/** Walks the back-pointers from the target to the origin and reverses. */
function reconstruct(c: ConnectionSet, r: Reached, origin: number, target: number): Leg[] | null {
  if (r.arrival[target] === INF) return null;

  const legs: Leg[] = [];
  let at = target;
  let guard = 0;

  while (at !== origin && guard++ < 500) {
    const conn = r.viaConnection[at]!;
    if (conn !== -1) {
      // Walk back along the same trip to find where this ride was boarded, so
      // a ten-stop journey on one bus reads as one leg, not ten.
      const trip = c.trip[conn]!;
      let first = conn;
      let boardStop = c.fromStop[conn]!;
      while (
        r.viaConnection[boardStop] !== -1 &&
        c.trip[r.viaConnection[boardStop]!] === trip
      ) {
        first = r.viaConnection[boardStop]!;
        boardStop = c.fromStop[first]!;
      }
      legs.push({
        kind: "ride",
        fromStop: c.stopIds[boardStop]!,
        toStop: c.stopIds[at]!,
        departAt: c.depTime[first]!,
        arriveAt: c.arrTime[conn]!,
        routeId: c.tripRoute[trip]!,
        tripId: c.tripIds[trip]!,
      });
      at = boardStop;
      continue;
    }

    const walked = r.viaWalk[at]!;
    if (walked === -1) return null;
    legs.push({
      kind: "walk",
      fromStop: c.stopIds[walked]!,
      toStop: c.stopIds[at]!,
      departAt: r.arrival[walked]!,
      arriveAt: r.arrival[at]!,
    });
    at = walked;
  }

  if (at !== origin) return null;
  return legs.reverse();
}

export function plan(
  c: ConnectionSet,
  paths: Footpaths,
  fromStopId: string,
  toStopId: string,
  departAt: number,
  horizonSeconds = 3 * 3600,
): Journey | null {
  const origin = c.stopIndex.get(fromStopId);
  const target = c.stopIndex.get(toStopId);
  if (origin === undefined || target === undefined) return null;

  const reached = scan(c, paths, origin, departAt, horizonSeconds);
  const legs = reconstruct(c, reached, origin, target);
  if (legs === null || legs.length === 0) return null;

  return {
    legs,
    departAt: legs[0]!.departAt,
    arriveAt: legs[legs.length - 1]!.arriveAt,
    transfers: Math.max(0, legs.filter((l) => l.kind === "ride").length - 1),
  };
}
