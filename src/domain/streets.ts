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
  return streetTokens(name)[0] ?? null;
}

/** All identifying tokens, in order. */
export function streetTokens(name: string): string[] {
  return name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length > 0 && !NOISE.has(t));
}

/**
 * Builds an order-independent key for a street pair, so "KING AND PARLIAMENT"
 * and "Parliament St at King St East" produce the same key.
 */
export function intersectionKey(a: string, b: string): string | null {
  const tokensA = streetTokens(a);
  const tokensB = streetTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return null;

  const [ta, tb] = [tokensA[0]!, tokensB[0]!];
  if (ta !== tb) return [ta, tb].sort().join("|");

  // Streets sharing a first token — "Wilson Ave at Wilson Heights Blvd" — would
  // otherwise collapse to a self-pair and be discarded. Fall back to the full
  // names, which still differ.
  const fullA = tokensA.join(" ");
  const fullB = tokensB.join(" ");
  return fullA === fullB ? null : [fullA, fullB].sort().join("|");
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
