/**
 * Surface (bus and streetcar) location resolution — M5.
 *
 * Surface delay records identify location as free text with no coordinates
 * (E-D07). Resolving them is what unlocks bus segments, and buses are the
 * product (D-04, E-D05).
 *
 * The published field truncates at 22 characters and mixes several kinds of
 * value. Treating them all as failed geocodes conflates two very different
 * things: a location we could not resolve, and a location where no rider was
 * ever waiting. Only the first is a coverage gap (P-03).
 */

import { intersectionKey } from "./streets.js";

const TRUNCATION_LENGTH = 22;

/**
 * Garages and divisions are where vehicles are stored and maintained. They are
 * the surface equivalent of subway yards: no rider is ever aboard, so incidents
 * logged there can never be through-rider risk (D-06, E-D03).
 */
const NON_REVENUE = /\b(GARAGE|DIVISION|CARHOUSE|YARD|BARNS?)\b/;

/**
 * Loops are terminal turnarounds. Riders do pass through some of them, but they
 * accumulate layover and turnaround incidents exactly as subway terminals do, so
 * they are flagged rather than scored as ordinary track (D-06).
 */
const LOOP = /\bLOOP\b/;

/** "STATION" survives truncation as STA / STATIO / STATI / STN. */
const STATION = /\b(STATIONS?|STATIO|STATI|STAT|STA|STN)\b/;

export type SurfaceLocation =
  | { kind: "intersection"; key: string; truncated: boolean }
  | { kind: "station"; name: string; truncated: boolean }
  | { kind: "loop"; name: string }
  | { kind: "non-revenue"; name: string }
  | { kind: "unresolved"; raw: string };

/** Separators the TTC uses between the two streets of an intersection. */
const SEPARATOR = /\s+(?:AND|AT|&|\/)\s+|\s*\/\s*/;

export function classifySurfaceLocation(raw: string): SurfaceLocation {
  const value = raw.toUpperCase().trim().replace(/\s+/g, " ");
  const truncated = value.length >= TRUNCATION_LENGTH;

  if (NON_REVENUE.test(value)) return { kind: "non-revenue", name: value };
  if (LOOP.test(value)) return { kind: "loop", name: value };

  if (STATION.test(value)) {
    return {
      kind: "station",
      name: value.replace(STATION, "").replace(/\s+/g, " ").trim(),
      truncated,
    };
  }

  const parts = value.split(SEPARATOR);
  if (parts.length === 2 && parts[0]!.trim() !== "" && parts[1]!.trim() !== "") {
    const key = intersectionKey(parts[0]!, parts[1]!);
    if (key !== null) return { kind: "intersection", key, truncated };
  }

  return { kind: "unresolved", raw: value };
}

/**
 * Resolves an intersection key against known GTFS keys, tolerating truncation.
 *
 * A truncated record like "ST CLAIR AND BIRCHMOUN" yields the key
 * "BIRCHMOUN|ST CLAIR", which matches no stop exactly. Each half is therefore
 * also tried as a prefix. An ambiguous prefix resolves to nothing rather than
 * to a guess — a wrong corner would move delay onto a street that never saw it
 * (P-08).
 */
export function resolveIntersection(
  key: string,
  known: ReadonlyMap<string, string[]>,
  prefixIndex: ReadonlyMap<string, string[]>,
): string[] | null {
  const exact = known.get(key);
  if (exact !== undefined) return exact;

  const [a, b] = key.split("|") as [string, string];

  // One half is complete, the other was clipped: find keys whose complete half
  // matches and whose other half starts with the clipped token.
  for (const [whole, clipped] of [
    [a, b],
    [b, a],
  ] as const) {
    const candidates = prefixIndex.get(whole);
    if (candidates === undefined) continue;

    const matches = candidates.filter((other) => other.startsWith(clipped));
    if (matches.length === 1) {
      const resolved = [whole, matches[0]!].sort().join("|");
      const stops = known.get(resolved);
      if (stops !== undefined) return stops;
    }
  }
  return null;
}

/** Builds the token -> co-occurring tokens index that prefix matching needs. */
export function buildPrefixIndex(keys: Iterable<string>): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const key of keys) {
    const [a, b] = key.split("|") as [string, string];
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const) {
      const list = index.get(from);
      if (list === undefined) index.set(from, [to]);
      else list.push(to);
    }
  }
  return index;
}

/**
 * Landmark and named-place resolution.
 *
 * Many surface stops are named for a destination rather than a corner —
 * "Sherway Gardens", "Humber College", "Sunnybrook Hospital". These are real
 * rider locations, so failing them as unresolved understates coverage.
 *
 * Matching is exact-then-unique-prefix on the canonical name. An ambiguous
 * prefix resolves to nothing: putting delay on the wrong landmark is worse than
 * admitting the gap (P-08).
 */
export function resolveByName(
  name: string,
  exact: ReadonlyMap<string, string[]>,
  names: readonly string[],
): string[] | null {
  const direct = exact.get(name);
  if (direct !== undefined) return direct;

  const matches = names.filter((n) => n.startsWith(name));
  return matches.length === 1 ? (exact.get(matches[0]!) ?? null) : null;
}

/**
 * Surface station names that differ from GTFS: renames the delay archive has
 * not caught up with, and short forms the TTC logs by hand.
 */
export const SURFACE_ALIASES: Readonly<Record<string, string>> = {
  // Renamed when the Eglinton Crosstown opened; delay data still logs the old name.
  "EGLINTON WEST": "CEDARVALE",
  MAIN: "MAIN STREET",
  "SCARBOROUGH TOWN CENTRE": "SCARBOROUGH CENTRE",
};

/**
 * Applies an alias, tolerating truncation.
 *
 * "SCARBOROUGH TOWN CENTRE" arrives clipped to "SCARBOROUGH TOWN CENTR", so an
 * exact lookup misses. An unambiguous prefix of exactly one alias key is
 * accepted; anything ambiguous is left alone.
 */
export function applySurfaceAlias(name: string): string {
  const exact = SURFACE_ALIASES[name];
  if (exact !== undefined) return exact;

  const keys = Object.keys(SURFACE_ALIASES).filter((k) => k.startsWith(name));
  return keys.length === 1 ? SURFACE_ALIASES[keys[0]!]! : name;
}
