/**
 * Shared surface location resolver.
 *
 * Used by both the coverage audit and the attribution pass, so the rate we
 * publish is the rate we actually achieve — measuring one path and running
 * another is how a coverage claim quietly becomes false (P-08).
 */

import { prisma } from "../db/client.js";
import {
  classifySurfaceLocation,
  resolveIntersection,
  buildPrefixIndex,
  resolveByName,
  applySurfaceAlias,
  type SurfaceLocation,
} from "./surface.js";

export type Resolution =
  /**
   * A location resolves to every stop that shares it, not to one stop.
   * A single corner carries a stop per direction and per side of the street, and
   * which of them a given route serves is not knowable from the delay record.
   * Returning the group lets the route select its own stop; returning one stop
   * silently discards most matches.
   */
  | { kind: "stop"; stopIds: string[]; via: "intersection" | "station" | "landmark" }
  | { kind: "excluded"; reason: "loop" | "non-revenue" }
  | { kind: "unresolved" };

export interface SurfaceIndex {
  byKey: Map<string, string[]>;
  prefixIndex: Map<string, string[]>;
  stationStops: Map<string, string[]>;
  stationNames: string[];
  byName: Map<string, string[]>;
  allNames: string[];
}

function canonical(name: string): string {
  return name
    .toUpperCase()
    .replace(/\s*-\s*.*$/, "")
    .replace(/\s*STATION\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function buildSurfaceIndex(): Promise<SurfaceIndex> {
  const stops = await prisma.stop.findMany({ select: { id: true, name: true, streetKey: true } });

  const byKey = new Map<string, string[]>();
  const stationStops = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string): void => {
    const list = m.get(k);
    if (list === undefined) m.set(k, [v]);
    else list.push(v);
  };

  for (const s of stops) {
    if (s.streetKey !== null) push(byKey, s.streetKey, s.id);
    const key = canonical(s.name);
    if (key !== "") push(byName, key, s.id);
    if (/\bstation\b/i.test(s.name) && key !== "") push(stationStops, key, s.id);
  }

  return {
    byKey,
    prefixIndex: buildPrefixIndex(byKey.keys()),
    stationStops,
    stationNames: [...stationStops.keys()],
    byName,
    allNames: [...byName.keys()],
  };
}

export function resolveSurfaceLocation(raw: string, index: SurfaceIndex): Resolution {
  const c: SurfaceLocation = classifySurfaceLocation(raw);

  if (c.kind === "non-revenue") return { kind: "excluded", reason: "non-revenue" };
  if (c.kind === "loop") return { kind: "excluded", reason: "loop" };

  if (c.kind === "intersection") {
    const stopIds = resolveIntersection(c.key, index.byKey, index.prefixIndex);
    return stopIds !== null ? { kind: "stop", stopIds, via: "intersection" } : { kind: "unresolved" };
  }

  if (c.kind === "station") {
    const name = applySurfaceAlias(c.name);
    const exact = index.stationStops.get(name);
    if (exact !== undefined) return { kind: "stop", stopIds: exact, via: "station" };
    const prefixed = index.stationNames.filter((n) => n.startsWith(name));
    if (prefixed.length === 1) {
      return { kind: "stop", stopIds: index.stationStops.get(prefixed[0]!)!, via: "station" };
    }
    return { kind: "unresolved" };
  }

  const stopIds = resolveByName(applySurfaceAlias(c.raw), index.byName, index.allNames);
  return stopIds !== null ? { kind: "stop", stopIds, via: "landmark" } : { kind: "unresolved" };
}

/** "52 LAWRENCE WEST" -> "52". Delay data prefixes the route number. */
export function routeShortName(lineRaw: string): string | null {
  const m = lineRaw.trim().match(/^(\d+[A-Z]?)\b/);
  return m?.[1] ?? null;
}
