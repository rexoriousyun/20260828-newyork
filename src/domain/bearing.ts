/**
 * Compass direction from segment geometry.
 *
 * Surface delay records give a compass bound (N/S/E/W), but GTFS labels bus
 * trips with an opaque direction_id (0/1). Rather than guess which id maps to
 * which heading — it varies by route — the heading is computed from the
 * segment's own coordinates.
 */

export type Compass = "N" | "S" | "E" | "W";

/** Initial bearing from one point to another, in degrees clockwise from north. */
export function bearing(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLon = toRad(toLon - fromLon);
  const y = Math.sin(dLon) * Math.cos(toRad(toLat));
  const x =
    Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) -
    Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Nearest cardinal direction. Quadrants are centred on each cardinal point. */
export function toCompass(deg: number): Compass {
  const d = ((deg % 360) + 360) % 360;
  if (d >= 315 || d < 45) return "N";
  if (d < 135) return "E";
  if (d < 225) return "S";
  return "W";
}

export function segmentCompass(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): Compass {
  return toCompass(bearing(fromLat, fromLon, toLat, toLon));
}

const COMPASS_DEGREES: Readonly<Record<Compass, number>> = { N: 0, E: 90, S: 180, W: 270 };

/** Smallest angle between two compass points, in degrees (0-180). */
export function compassDistance(a: Compass, b: Compass): number {
  const diff = Math.abs(COMPASS_DEGREES[a] - COMPASS_DEGREES[b]);
  return Math.min(diff, 360 - diff);
}

/**
 * Chooses which of a stop's candidate segments matches a published bound.
 *
 * A route's heading rarely lands neatly on a cardinal point: a northeast route
 * is "N" by bearing and "E" to the TTC, so requiring the letters to be equal
 * discards most surface incidents. The nearest candidate by angle is taken
 * instead.
 *
 * A tie is refused. If a stop's two candidates sit equally far from the bound —
 * northbound and southbound segments against an eastbound record — the data does
 * not say which the rider was on, and guessing would put the delay on the wrong
 * side of the street (P-08).
 */
export function nearestByBound<T>(
  bound: Compass,
  candidates: ReadonlyArray<{ direction: Compass; value: T }>,
): T | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!.value;

  let best: { distance: number; value: T } | null = null;
  let tied = false;

  for (const c of candidates) {
    const distance = compassDistance(bound, c.direction);
    if (best === null || distance < best.distance) {
      best = { distance, value: c.value };
      tied = false;
    } else if (distance === best.distance) {
      tied = true;
    }
  }
  return tied ? null : best!.value;
}
