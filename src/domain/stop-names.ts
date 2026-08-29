/**
 * How a stop is named to a rider.
 *
 * GTFS names carry operational detail — which platform, which direction that
 * platform faces, which side of the street — that answers a question nobody
 * asked at the point of choosing a destination. "Sherbourne Station" is the
 * place; the platform is machinery, and it stays hidden until it matters
 * (P-09). Collapsing the names is also what lets search show eight distinct
 * places instead of eight rows for the same corner.
 */
export function displayStopName(name: string): string {
  return name
    // Two forms in the feed: "Sherbourne Station - Eastbound Platform" and
    // "Cedarvale Station Eastbound Platform". Only the first has the dash, and
    // matching on it alone let the second through onto the screen.
    .replace(/\s*-\s*[^-]*\bPlatform\b.*$/i, "")
    .replace(/\s+(North|South|East|West)bound\s+Platform\b.*$/i, "")
    .replace(/\s+(North|South|East|West)\s+Side$/i, "")
    .trim();
}

/**
 * Station names in the segment index are upper-case codes ("BLOOR-YONGE"),
 * because that is how the incident feed writes them. Riders read signs, not
 * codes, so they are cased back for display.
 */
export function displayStationName(code: string): string {
  return code
    .toLowerCase()
    .replace(/(^|[\s\-\/])([a-z])/g, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
}
