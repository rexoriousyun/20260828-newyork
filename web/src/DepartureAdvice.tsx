import type { ScoredJourney } from "./api.js";
import { reliabilityFor, type View } from "./view.js";

const hhmm = (s: number): string =>
  `${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

/**
 * "When do I need to leave?" — the answer, once.
 *
 * With a deadline attached, the departure time is the headline and the
 * duration is a detail: a rider working backwards from a shift does not need
 * to be told the trip takes 24 minutes, they need to be told to leave at
 * 08:33. So this replaces the option card rather than sitting above it —
 * showing both restated the same trip twice and cost the map a third of the
 * screen it needs to be worth drawing (D-20).
 *
 * J-01 shows a departure time and a confidence, defers the percentile basis
 * and the sample, and never defers that it is an estimate. Its named failure
 * case is a single confident ETA: for a rider with a penalty attached to
 * arriving late, that is the number that gets them in trouble. So both
 * outcomes are on screen — the normal morning and the one that goes wrong —
 * and the buffer that would cover the bad one is priced, never prescribed.
 */
export function DepartureAdvice({
  journey,
  view,
}: {
  journey: ScoredJourney;
  view: View;
}): JSX.Element | null {
  const a = journey.advice;
  if (a === null) return null;

  const late = a.slackMinutes < 0;
  const routes = journey.legs.filter((l) => l.kind === "ride").map((l) => l.routeId ?? "?");
  const rel = reliabilityFor(journey, view);
  const thin = rel.coverage < 0.5;

  return (
    <div className={`advice${late ? " advice-late" : ""}`}>
      <p className="advice-lead">
        <span className="advice-time">
          {late ? `Best is ${hhmm(a.arriveAt)}` : `Leave ${hhmm(a.leaveAt)}`}
        </span>
        <span className="advice-slack">
          {late
            ? `${Math.abs(a.slackMinutes)} min late — nothing this way makes it`
            : `arrives ${hhmm(a.arriveAt)}${
                a.slackMinutes === 0 ? ", no time to spare" : `, ${a.slackMinutes} min to spare`
              }`}
        </span>
      </p>

      <p className="advice-routes">
        {routes.map((r, i) => (
          <span key={`${r}-${i}`} className="route-chip">
            {r}
          </span>
        ))}
        <span className="journey-meta">
          {journey.transfers > 0
            ? `${journey.transfers} transfer${journey.transfers > 1 ? "s" : ""}`
            : "no transfers"}
          {" · "}
          {journey.typicalMinutes} min
        </span>
      </p>

      {a.disrupted !== null && rel.oneInTrips !== null && (
        <p className="advice-risk">
          About <strong>1 morning in {rel.oneInTrips}</strong> this runs long — you would arrive{" "}
          {hhmm(a.disrupted.arriveAt)}.
        </p>
      )}

      {/* Priced, not prescribed. What the buffer is worth depends on what being
          late costs this rider, which we do not know and should not guess. */}
      {a.covered !== null && (
        <p className="advice-buffer">
          Leaving <strong>{hhmm(a.covered.leaveAt)}</strong> covers that — at{" "}
          {a.covered.extraMinutes} min earlier every day.
        </p>
      )}

      {/* Low confidence sits with the claim, never behind a tap (P-09, J-01). */}
      {thin && (
        <p className="advice-thin">
          Based on {Math.round(rel.coverage * 100)}% of this route — treat as
          rough.
        </p>
      )}
    </div>
  );
}
