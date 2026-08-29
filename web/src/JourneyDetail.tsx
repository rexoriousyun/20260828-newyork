import { Fragment, useState } from "react";
import { hhmm, hhmmDay } from "./clock.js";
import type { ScoredJourney } from "./api.js";
import { legReliabilityFor, type View } from "./view.js";


const mins = (a: number, b: number): number => Math.max(1, Math.round((b - a) / 60));

/**
 * Step by step.
 *
 * Behind a tap, because a rider choosing between options does not need the
 * legs — they need the duration and the risk. Once they have chosen, the
 * steps are the thing they will actually follow, so they open in place rather
 * than on another screen (P-09).
 */
export function JourneyDetail({
  journey,
  view,
}: {
  journey: ScoredJourney;
  view: View;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="detail">
      <button className="why" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide the steps" : "Step by step"}
      </button>
      {open && (
        <ol className="legs">
          {journey.legs.map((l, i) => {
            // The gap between arriving and the next departure is waiting, and
            // waiting is the thing this app measures. Folding it into a leg
            // would hide the one cost a rider actually feels (D-02).
            const prev = journey.legs[i - 1];
            const wait = prev === undefined ? 0 : Math.round((l.departAt - prev.arriveAt) / 60);
            // The scheduled gap is what the timetable promises; the headway is
            // what a vehicle not turning up actually costs. Riders have learned
            // not to believe the first (PR-08), and nothing on this screen used
            // to qualify it (D-34).
            const headway = journey.waits.find((w) => w.legIndex === i)?.headwayMinutes ?? null;
            return (
              <Fragment key={`${l.kind}-${i}`}>
                {wait >= 2 && (
                  <li className="leg leg-wait">
                    <span className="leg-time" />
                    <span className="leg-body">
                      <span className="leg-what">Wait at {prev!.toName}</span>
                      <span className="leg-dur">{wait} min</span>
                    </span>
                    {headway !== null && (
                      <span className="leg-headway">{headway} min to the next one</span>
                    )}
                  </li>
                )}
                <li className={`leg leg-${l.kind}`}>
                  <span className="leg-time">{hhmmDay(l.departAt, journey.departAt)}</span>
                  <span className="leg-body">
                    <span className="leg-what">
                      {l.kind === "walk" ? (
                        <>Walk to {l.toName}</>
                      ) : (
                        <>
                          <span className="route-chip">{l.routeId ?? "?"}</span> to {l.toName}
                        </>
                      )}
                    </span>
                    <span className="leg-dur">{mins(l.departAt, l.arriveAt)} min</span>
                  </span>
                  {l.disruptions.length > 0 && (
                    <span className="leg-today">
                      {l.disruptions[0]!.kind === "no-service"
                        ? "No service on part of this route today"
                        : l.disruptions[0]!.kind === "bypass"
                          ? "Skipping some stops today"
                          : "On detour today"}
                    </span>
                  )}
                  {legReliabilityFor(l, view) !== null && (
                    <span className="leg-risk">
                      {legReliabilityFor(l, view)!.oneInTrips === null ? (
                        // Never folded into the trip's figure and never left
                        // to look like the reliable end of the scale (P-03).
                        "Not enough data on this stretch"
                      ) : (
                        <>
                          Goes wrong 1 in {legReliabilityFor(l, view)!.oneInTrips}
                          {legReliabilityFor(l, view)!.isWorst && (
                            <strong> — most of this trip&rsquo;s risk</strong>
                          )}
                          {legReliabilityFor(l, view)!.coverage < 0.5 &&
                            `, measured on ${Math.round(legReliabilityFor(l, view)!.coverage * 100)}% of it`}
                        </>
                      )}
                    </span>
                  )}
                </li>
              </Fragment>
            );
          })}
          <li className="leg leg-end">
            <span className="leg-time">{hhmmDay(journey.arriveAt, journey.departAt)}</span>
            <span className="leg-body">
              <span className="leg-what">Arrive {journey.legs[journey.legs.length - 1]?.toName}</span>
            </span>
          </li>
        </ol>
      )}
    </div>
  );
}
