import type { RankedRoute } from "./api.js";

/**
 * Which routes cost riders the most time.
 *
 * `PR-02` is that unreliability is unevenly distributed and nobody publishes
 * where. Until now this app answered that one route at a time, through a
 * dropdown of 404 entries in no particular order — a rider could see their
 * route was bad but had nothing to compare it against, which is exactly where
 * `J-04` begins.
 *
 * Total minutes of waiting caused, the same unit the map draws, so the list and
 * the map say the same thing. The cause is the TTC's own words: "No operator
 * available" is a better sentence than any category we would invent, and it is
 * the "wants why" stage that journey asked for and never got.
 */
const sentence = (v: string): string =>
  v.charAt(0) + v.slice(1).toLowerCase().replace(/\bttc\b/gi, "TTC");

/**
 * The TTC's largest single bucket on several routes is the code "OTHER" — none
 * of their own categories fit. "Mostly other" is faithful and tells a reader
 * nothing, and reads like a bug. Naming it as unclassified keeps the fact that
 * the biggest cause is a shrug, which is itself worth knowing (PR-08), without
 * pretending it is an explanation.
 */
function causeLabel(cause: string): string {
  return cause.trim().toUpperCase() === "OTHER" ? "unclassified" : sentence(cause).toLowerCase();
}

/**
 * Both modes, sectioned rather than merged.
 *
 * Surface delay is only partly geocodable while every subway incident names a
 * station, so the two are measured to different standards — 100% against 51%
 * across the top of the list. One combined ranking would put the subway above
 * the buses for being better recorded and dress it up as being worse to ride.
 * Sectioning makes the split visible instead of quietly ranking through it.
 */
export function RouteRanking({
  modes,
  selected,
  onSelect,
}: {
  modes: { subway?: RankedRoute[]; surface?: RankedRoute[] };
  selected: string;
  onSelect: (routeId: string) => void;
}): JSX.Element | null {
  const sections = [
    { key: "surface", title: "Surface routes", rows: (modes.surface ?? []).slice(0, 6) },
    { key: "subway", title: "Subway", rows: (modes.subway ?? []).slice(0, 3) },
  ].filter((x) => x.rows.length > 0);
  if (sections.length === 0) return null;
  const anyPartial = sections.some((x) => x.rows.some((r) => r.partial));

  return (
    <div className="ranking">
      <p className="ranking-head">Costliest routes for riders</p>
      {sections.map((section) => (
        <div key={section.key} className="ranking-section">
          <p className="ranking-mode">{section.title}</p>
          <ol className="ranking-list">
            {section.rows.map((r) => (
              <li key={r.routeId}>
                <button
                  className="ranking-row"
                  aria-pressed={r.routeId === selected}
                  onClick={() => onSelect(r.routeId)}
                >
              <span className="ranking-rank">{r.rank}</span>
              <span className="ranking-body">
                <span className="ranking-name">
                  <span className="route-chip">{r.routeId}</span> {r.name}
                </span>
                {r.leadingCause !== null && (
                  <span className="ranking-cause">Mostly {causeLabel(r.leadingCause)}</span>
                )}
              </span>
              <span className="ranking-figure">
                <strong>{r.gapMinutesPerMonth.toLocaleString()}</strong>
                <span className="ranking-unit">min/mo{r.partial ? "+" : ""}</span>
              </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {anyPartial && (
        <p className="ranking-note">
          Minutes of waiting caused across everyone riding, per month. A <strong>+</strong> means
          part of the route is unmeasured, so the real figure is higher — we do not guess by how
          much.
        </p>
      )}
    </div>
  );
}
