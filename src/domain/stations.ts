/**
 * Subway location normalisation.
 *
 * The published `Station` field is messier than it looks. Across the 2025-26
 * window it contains at least five distinct kinds of value:
 *
 *   "BATHURST STATION"        a station
 *   "KENNEDY BD STATION"      a station, disambiguated by line at an interchange
 *   "PIONEER VILLAGE STATIO"  a station, truncated at 22 characters
 *   "UNION TO ST ANDREW"      an inter-station segment, already the unit we want
 *   "GREENWOOD YARD"          non-revenue trackage — no rider is ever on it (D-06)
 *
 * Getting this wrong is not cosmetic. Yard and build-up records are a large part
 * of the terminal/yard attribution artifact (E-D03), and silently folding them
 * into station scores is exactly the failure P-04 exists to prevent.
 */

/** The published field truncates at 22 characters. */
const TRUNCATION_LENGTH = 22;

/**
 * Non-revenue locations: yards, wyes, hostlers, and "build up" (service being
 * assembled). Riders are never aboard, so these can never be through-rider risk.
 */
const NON_REVENUE = /\b(YARD|HOSTLER|WYE|POCKET|TAIL\s*TRACK|BUILD[\s-]?UP|CARHOUSE)\b/i;

/** Line suffixes used to disambiguate interchanges: "KENNEDY BD", "ST GEORGE YUS". */
const LINE_SUFFIX = /\s+(BD|YUS|YU|SHP|SRT)$/;

export type SubwayLocation =
  | { kind: "station"; station: string; truncated: boolean }
  | { kind: "segment"; from: string; to: string; truncated: boolean }
  | { kind: "non-revenue"; raw: string };

function stripStationWord(value: string): string {
  // "STATIO" and "STATI" appear where the 22-char truncation clipped the word.
  return value.replace(/\s+(STATIONS?|STATIO|STATI|STAT|STA|STN)$/i, "").trim();
}

/** Delay records append operational qualifiers: "(PLATFORM", "- PLAT", "(APPROA". */
const QUALIFIER = /[\s(-]+(PLATFORMS?|PLATFOR|PLATF?|PLAT|APPROACHING|APPROACH|APPROA|APPRO)\)?$/i;

function canonicalise(value: string): string {
  return stripStationWord(stripStationWord(value.toUpperCase().trim()).replace(QUALIFIER, ""))
    .replace(LINE_SUFFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSubwayLocation(raw: string): SubwayLocation {
  const value = raw.toUpperCase().trim();
  const truncated = value.length >= TRUNCATION_LENGTH;

  if (NON_REVENUE.test(value)) {
    return { kind: "non-revenue", raw: value };
  }

  const between = value.split(/\s+TO\s+/);
  if (between.length === 2) {
    return {
      kind: "segment",
      from: applyAlias(canonicalise(between[0]!)),
      to: applyAlias(canonicalise(between[1]!)),
      truncated,
    };
  }

  return { kind: "station", station: applyAlias(canonicalise(value)), truncated };
}

/**
 * Canonical station name from a GTFS platform stop.
 *
 * GTFS platform naming is not uniform. All of these describe one station:
 *   "Bathurst Station - Eastbound Platform"
 *   "Finch Station - Subway Platform"
 *   "Union Station - Northbound Platform towards Vaughan Metropolitan Centre"
 *
 * Matching only the "<direction>bound Platform" form leaves the others intact,
 * which splits one station into several canonical names and fabricates segments
 * between a station and itself. Everything from the platform qualifier onward is
 * dropped instead.
 */
export function stationFromPlatform(stopName: string): string {
  const withoutPlatform = stopName.replace(/\s*-\s*[^-]*\bplatform\b.*$/i, "");
  return applyAlias(canonicalise(withoutPlatform));
}

/**
 * Names used in delay data that differ from GTFS: abbreviations the TTC logs by
 * hand, and stations renamed since the delay archive began.
 */
const ALIASES: Readonly<Record<string, string>> = {
  VMC: "VAUGHAN METROPOLITAN CENTRE",
  "VAUGHAN MC": "VAUGHAN METROPOLITAN CENTRE",
  "NORTH YORK CTR": "NORTH YORK CENTRE",
  // Renamed when the Eglinton Crosstown opened; delay data still logs the old name.
  "EGLINTON WEST": "CEDARVALE",
  // Line 1's Sheppard platform; "SHEPPARD WEST" is a different station and is
  // spelled out in full, so a bare "SHEPPARD" is unambiguous here.
  SHEPPARD: "SHEPPARD-YONGE",
};

export function applyAlias(name: string): string {
  return ALIASES[name] ?? name;
}

/** Direction letter from a GTFS platform stop name, or null if absent. */
export function directionFromPlatform(stopName: string): "N" | "S" | "E" | "W" | null {
  const m = stopName.match(/-\s*(North|South|East|West)bound\s+Platform/i);
  if (!m) return null;
  return m[1]!.charAt(0).toUpperCase() as "N" | "S" | "E" | "W";
}

/**
 * Resolves a possibly-truncated station name against the known set.
 *
 * Exact match wins. Otherwise, a truncated value may prefix exactly one known
 * station — "PIONEER VILLAGE" prefixes only "PIONEER VILLAGE". An ambiguous
 * prefix returns null rather than guessing: a wrong station here would move
 * delay onto a segment that never saw it (P-08).
 */
export function resolveStation(name: string, known: ReadonlySet<string>): string | null {
  if (known.has(name)) return name;

  const matches = [...known].filter((k) => k.startsWith(name));
  return matches.length === 1 ? matches[0]! : null;
}

/** TTC delay-data line codes to GTFS route ids. */
export const LINE_TO_ROUTE: Readonly<Record<string, string>> = {
  YU: "1",
  BD: "2",
  SHP: "4",
};

/**
 * Is this GTFS route a subway line?
 *
 * Derived from `LINE_TO_ROUTE` so the two cannot drift. Several modules need
 * the distinction for different reasons — segments key on stations rather than
 * platforms, severity pools separately, and a wait on a platform is not a wait
 * outside — and each had grown its own copy of the same three ids.
 */
const SUBWAY_ROUTE_IDS: ReadonlySet<string> = new Set(Object.values(LINE_TO_ROUTE));

export function isSubwayRoute(routeId: string): boolean {
  return SUBWAY_ROUTE_IDS.has(routeId);
}
