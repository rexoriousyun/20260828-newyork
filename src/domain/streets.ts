/**
 * Street-name normalisation for matching surface delay locations to GTFS stops.
 *
 * Surface delay records identify location as free text ("KING AND PARLIAMENT")
 * with no coordinates, while GTFS names stops as "King St West at Parliament St".
 * Matching them is what unlocks bus segments (E-D07, M5).
 *
 * The baseline to beat is 66% of delay-minutes resolved.
 */

/** Directional and type suffixes that carry no identity for matching purposes. */
const NOISE = new Set([
  "ST", "STREET", "AVE", "AV", "AVENUE", "RD", "ROAD", "BLVD", "BOULEVARD",
  "DR", "DRIVE", "CRES", "CRESCENT", "PKWY", "PARKWAY", "WAY", "TR", "TRL",
  "TRAIL", "CT", "COURT", "GDNS", "GARDENS", "SQ", "SQUARE", "CIR", "CIRCLE",
  "LANE", "LN", "PL", "PLACE", "TERR", "TERRACE", "HWY", "HIGHWAY",
  "N", "S", "E", "W", "NORTH", "SOUTH", "EAST", "WEST", "NB", "SB", "EB", "WB",
]);

/**
 * Reduces a street name to its identifying token.
 * "King St West" -> "KING", "Lawrence Ave E" -> "LAWRENCE"
 */
export function streetToken(name: string): string | null {
  const tokens = name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length > 0 && !NOISE.has(t));
  return tokens[0] ?? null;
}

/**
 * Builds an order-independent key for a street pair, so "KING AND PARLIAMENT"
 * and "Parliament St at King St East" produce the same key.
 */
export function intersectionKey(a: string, b: string): string | null {
  const ta = streetToken(a);
  const tb = streetToken(b);
  if (ta === null || tb === null || ta === tb) return null;
  return [ta, tb].sort().join("|");
}

/** Splits a GTFS stop name like "Danforth Rd at Kennedy Rd" into its street pair. */
export function keyFromStopName(stopName: string): string | null {
  const parts = stopName.split(/\s+at\s+/i);
  if (parts.length !== 2) return null;
  return intersectionKey(parts[0]!, parts[1]!);
}

/** Splits a delay record location like "KING AND PARLIAMENT" into its street pair. */
export function keyFromDelayLocation(location: string): string | null {
  const parts = location.split(/\s+AND\s+/i);
  if (parts.length !== 2) return null;
  return intersectionKey(parts[0]!, parts[1]!);
}

/** True when a delay location names a subway station rather than an intersection. */
export function isStationLocation(location: string): boolean {
  return /\b(STATION|STN)\b/i.test(location);
}
