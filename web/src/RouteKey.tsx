import type { ScoredJourney } from "./api.js";

/**
 * What the colours on the drawn route mean.
 *
 * A legend is machinery, and P-09 defers machinery — but an undecoded colour is
 * not hidden method, it is a claim the rider cannot read. So the key sits on
 * the primary view, directly under the map it explains, and is kept to one
 * short row.
 *
 * It lists only the states actually drawn. A key for "not enough data" on a
 * trip that has none teaches a rider to look for something that is not there,
 * and spends height the map needs (D-20).
 *
 * Walking is deliberately absent. Three entries wrapped to two lines, and of
 * the three it is the one a rider can read off position alone — it only ever
 * appears at the ends of a trip, joining them to where they are standing. The
 * two that encode a measurement are the two that need naming.
 */
export function RouteKey({ journey }: { journey: ScoredJourney }): JSX.Element | null {
  const props = journey.geojson.features.map((f) => f.properties);
  const hasRide = props.some((p) => p.kind === "ride" && p.confidence !== "unknown");
  const hasUnknown = props.some((p) => p.kind === "ride" && p.confidence === "unknown");
  if (!hasRide && !hasUnknown) return null;

  return (
    <div className="legend route-key">
      {hasRide && (
        <span>
          <i className="k-scale" />
          less waiting → more
        </span>
      )}
      {hasUnknown && (
        <span>
          <i className="k-unknown" />
          not enough data
        </span>
      )}
    </div>
  );
}
