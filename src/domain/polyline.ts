/**
 * Projecting stops onto route shapes.
 *
 * GTFS gives each trip a `shape_id` whose polyline follows the actual streets, but
 * TTC's `stop_times.shape_dist_traveled` is empty — so there is no published link
 * between a stop and its position along that polyline. Each stop is projected onto
 * the shape instead, and the slice between two consecutive stops becomes the
 * segment's drawn geometry.
 *
 * Without this, segments render as straight lines through buildings, which is both
 * wrong and reads as unfinished.
 */

export type Point = readonly [number, number]; // [lon, lat]

/**
 * Squared distance in a locally-flat projection.
 *
 * Longitude degrees shrink with latitude, so comparing raw degrees stretches
 * east-west distance — at Toronto's latitude by about 27%. Scaling longitude by
 * cos(lat) is enough for nearest-point comparison and avoids a full geodesic.
 */
function distSq(a: Point, b: Point, cosLat: number): number {
  const dx = (a[0] - b[0]) * cosLat;
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

interface Projection {
  /** Index of the polyline vertex the projection falls after. */
  index: number;
  /** Fraction along the span from `index` to `index + 1`, in [0, 1]. */
  t: number;
  distSq: number;
}

/** Nearest point on a polyline to `p`. */
export function projectOnto(shape: readonly Point[], p: Point): Projection | null {
  if (shape.length < 2) return null;
  const cosLat = Math.cos((p[1] * Math.PI) / 180);

  let best: Projection | null = null;
  for (let i = 0; i < shape.length - 1; i++) {
    const a = shape[i]!;
    const b = shape[i + 1]!;
    const dx = (b[0] - a[0]) * cosLat;
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 0) {
      t = (((p[0] - a[0]) * cosLat * dx + (p[1] - a[1]) * dy) / lenSq);
      t = Math.max(0, Math.min(1, t));
    }
    const proj: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = distSq(proj, p, cosLat);
    if (best === null || d < best.distSq) best = { index: i, t, distSq: d };
  }
  return best;
}

function pointAt(shape: readonly Point[], pr: Projection): Point {
  const a = shape[pr.index]!;
  const b = shape[pr.index + 1]!;
  return [a[0] + (b[0] - a[0]) * pr.t, a[1] + (b[1] - a[1]) * pr.t];
}

/**
 * The portion of `shape` running from one stop to the next.
 *
 * Returns null when the two stops project out of order — which happens on
 * looping routes where a shape passes the same place twice. A reversed slice
 * would draw the segment backwards across half the city, so the caller falls
 * back to a straight line rather than render something obviously wrong.
 */
export function sliceBetween(shape: readonly Point[], from: Point, to: Point): Point[] | null {
  const a = projectOnto(shape, from);
  const b = projectOnto(shape, to);
  if (a === null || b === null) return null;
  if (b.index < a.index || (b.index === a.index && b.t <= a.t)) return null;

  const out: Point[] = [pointAt(shape, a)];
  for (let i = a.index + 1; i <= b.index; i++) out.push(shape[i]!);
  out.push(pointAt(shape, b));

  // Collapse duplicate consecutive points introduced at the slice ends.
  return out.filter((p, i) => i === 0 || p[0] !== out[i - 1]![0] || p[1] !== out[i - 1]![1]);
}
