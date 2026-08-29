import type { ScoredJourney } from "./api.js";
import { hhmm, hhmmDay } from "./clock.js";
import { reliabilityFor, type View } from "./view.js";
import { Benchmark } from "./Benchmark.js";


interface Props {
  journeys: ScoredJourney[];
  selected: string | null;
  view: View;
  onSelect: (id: string) => void;
  /** Peek state: show the chosen answer only, and leave the map the screen. */
  collapsed: boolean;
}

function Journey({
  j,
  selected,
  onSelect,
  showSeverity,
  view,
}: {
  j: ScoredJourney;
  selected: boolean;
  view: View;
  onSelect: (id: string) => void;
  /** False when every option shares the figure and it is stated once below. */
  showSeverity: boolean;
}): JSX.Element {
  const routes = j.legs.filter((l) => l.kind === "ride").map((l) => l.routeId ?? "?");
  const rel = reliabilityFor(j, view);
  const thin = rel.coverage < 0.5;
  // Whether one stretch dominates is decided once, on the server, against the
  // next-worst stretch. The share-of-total test this replaced fired on an even
  // two-way split, which pins a rider to an arbitrary half of their trip.
  const worst = rel.dominant;
  return (
    <button className="journey" aria-pressed={selected} onClick={() => onSelect(j.id)}>
      <span className="journey-top">
        <span className="journey-time">{j.typicalMinutes} min</span>
        <span className="journey-clock">
          {hhmm(j.departAt)} → {hhmmDay(j.arriveAt, j.departAt)}
          {j.advice !== null && (
            <span className={`journey-slack${j.advice.slackMinutes < 0 ? " is-late" : ""}`}>
              {j.advice.slackMinutes < 0
                ? `${Math.abs(j.advice.slackMinutes)} min late`
                : j.advice.slackMinutes === 0
                  ? "just makes it"
                  : `${j.advice.slackMinutes} min spare`}
            </span>
          )}
        </span>
      </span>
      <span className="journey-routes">
        {routes.map((r, i) => (
          <span key={`${r}-${i}`} className="route-chip">
            {r}
          </span>
        ))}
        {j.transfers > 0 && (
          <span className="journey-meta">
            {j.transfers} transfer{j.transfers > 1 ? "s" : ""}
          </span>
        )}
      </span>
      <span className="journey-risk">
        {rel.oneInTrips === null ? (
          <>Not enough data to say how often this goes wrong.</>
        ) : (
          <>
            Goes wrong about <strong>1 trip in {rel.oneInTrips}</strong>
            {showSeverity ? (
              <>
                {" — "}
                {rel.minutesWhenDisrupted} min longer when it does.
              </>
            ) : (
              "."
            )}
          </>
        )}
      </span>
      {/* A route that is partly not running is not the same kind of statement as
          thin history, and carried the same weight as one until a tester
          skimmed past it. Severity earns the emphasis; a detour does not. */}
      {j.disruptions.length > 0 &&
        (j.disruptions.some((d) => d.kind === "no-service" || d.kind === "bypass") ? (
          <span className="journey-today is-severe">
            {j.disruptions.some((d) => d.kind === "no-service")
              ? "Part of this route is not running today"
              : "Stops are being skipped today"}
          </span>
        ) : (
          <span className="journey-today">On detour today</span>
        ))}
      {rel.comparison !== null && (
        <span className="journey-benchmark">
          <Benchmark comparison={{ ...rel.comparison, typicalOneInTrips: null }} />
        </span>
      )}
      {worst !== null && (
        <span className="journey-worst">
          Most of that sits between <strong>{worst.from}</strong> and <strong>{worst.to}</strong>.
        </span>
      )}
      {thin && (
        <span className="journey-thin">
          Based on {Math.round(rel.coverage * 100)}% of this route — treat as rough.
        </span>
      )}
    </button>
  );
}

/**
 * Results.
 *
 * Each option leads with how long it usually takes and how often it goes wrong
 * — stated as a rate, because expected added minutes rounds to zero at a 0.1%
 * per-trip risk and cannot separate two options (E-D19).
 *
 * A single result is presented as an answer, not as a one-item shortlist: where
 * the network offers no alternative, showing a menu of one is a lie about the
 * choice a rider has (D-13's surviving insight).
 *
 * Collapsed, the list shows the chosen route alone. The map is the retrieval
 * mechanism (D-14) and cannot do its job through a 230px slot, so once a rider
 * has picked, the answer stays and the comparison folds away.
 */
export function JourneyList({ journeys, selected, view, onSelect, collapsed }: Props): JSX.Element {
  const chosen = journeys.find((j) => j.id === selected) ?? journeys[0]!;

  // Severity is pooled across the network, not measured per route (D-11), so on
  // most trips every option carries the same number. Repeating it on each card
  // implies it was measured for that option; stated once, it reads as what it
  // is. It stays on the card whenever the options genuinely differ.
  const severities = new Set(journeys.map((j) => reliabilityFor(j, view).minutesWhenDisrupted));
  const shared = severities.size === 1 ? [...severities][0]! : null;

  const shownList = collapsed ? [chosen] : journeys;
  // An option that arrives after the deadline is shown, but it is not a way to
  // make the trip, and the heading should not count it as one.
  const made = journeys.filter((j) => j.advice === null || j.advice.slackMinutes >= 0).length;

  return (
    <>
      {!collapsed && (
        <p className="results-head">
          {/* Counting options that miss the deadline as "ways to make this
              trip" reads, to someone skimming under time pressure, as "these
              all get you there" — the opposite of what the red labels say. */}
          {made === 0
            ? `Nothing makes it — ${journeys.length} way${journeys.length > 1 ? "s" : ""} shown`
            : made === journeys.length
              ? made === 1
                ? "One way to make this trip"
                : `${made} ways to make this trip`
              : `${made} of ${journeys.length} ways make it in time`}
        </p>
      )}
      <ul className="journeys">
        {shownList.map((j) => (
          <li key={j.id}>
            <Journey
              j={j}
              selected={collapsed || selected === j.id}
              onSelect={onSelect}
              showSeverity={shared === null}
              view={view}
            />
          </li>
        ))}
      </ul>
      {shared !== null && reliabilityFor(chosen, view).oneInTrips !== null && (
        <p className="results-note">
          A trip that goes wrong runs about <strong>{shared} min</strong> long. That figure comes
          from the whole network, not from these routes.
        </p>
      )}
    </>
  );
}
