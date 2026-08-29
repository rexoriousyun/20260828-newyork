import type { RankedRoute } from "./api.js";

/**
 * Where waiting stops being the right response more often than not. The network
 * average is 36%, so a lower bar would fire everywhere and mean nothing.
 * Mirrors NEVER_CAME_NOTABLE in src/domain/vanishing.ts.
 */
const NEVER_CAME_NOTABLE = 0.5;

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

  /**
   * A second question, and a different answer.
   *
   * The costliest routes are the busy ones, and they sit near the network
   * average for vanishing service. The routes where the bus simply does not
   * come are quieter and never reach that list — so the metric would be
   * invisible exactly where it matters. Ranked separately, among routes with
   * enough waiting recorded to say anything.
   */
  const vanishing = (modes.surface ?? [])
    .filter((r) => r.neverCameShare !== null && r.neverCameShare >= NEVER_CAME_NOTABLE
                   && r.gapMinutesPerMonth >= 300)
    .sort((a, b) => (b.neverCameShare ?? 0) - (a.neverCameShare ?? 0))
    .slice(0, 5);
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
      {vanishing.length > 0 && (
        <div className="ranking-section">
          <p className="ranking-mode">Where waiting does not help</p>
          <ol className="ranking-list">
            {vanishing.map((r) => (
              <li key={r.routeId}>
                <button
                  className="ranking-row"
                  aria-pressed={r.routeId === selected}
                  onClick={() => onSelect(r.routeId)}
                >
                  <span className="ranking-rank" />
                  <span className="ranking-body">
                    <span className="ranking-name">
                      <span className="route-chip">{r.routeId}</span> {r.name}
                    </span>
                    <span className="ranking-cause">
                      of {r.gapMinutesPerMonth.toLocaleString()} min/mo waiting
                    </span>
                  </span>
                  <span className="ranking-figure">
                    <strong className="ranking-never">{Math.round(r.neverCameShare! * 100)}%</strong>
                    <span className="ranking-unit">never comes</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="ranking-note">
            Cancelled, sent on diversion, taken away to run a shuttle, or no operator rostered —
            the vehicle does not turn up at all, so waiting longer does not get you one. Across
            the network this is <strong>36%</strong> of all waiting, and none of it on the
            subway.
          </p>
        </div>
      )}
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
