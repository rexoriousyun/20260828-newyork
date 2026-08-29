import type { Disruption, ScoredJourney } from "./api.js";

/**
 * What the TTC has flagged on this way today.
 *
 * The reliability figures on this screen are a record of normal days. When a
 * route is on detour or partly out of service, today is not one, and the number
 * below is quietly wrong in a direction the rider cannot see. Saying so is not
 * optional: P-09 permits hiding *how* we know, never hiding that a figure does
 * not cover the situation in front of them.
 *
 * What we do not do is estimate the cost. The feed says a route is on detour;
 * it does not say by how many minutes, and no amount of history tells us what
 * today's blocked track adds. A plausible number here would be the exact
 * failure P-03 exists to prevent, and it would be the most trusted number on
 * the screen.
 */
function label(d: Disruption, routeIds: string[]): string {
  const routes = d.routeIds.filter((r) => routeIds.includes(r));
  const named = routes.length > 0 ? routes.join(", ") : d.routeIds.slice(0, 2).join(", ");
  switch (d.kind) {
    case "no-service":
      return `No service on part of the ${named}`;
    case "bypass":
      return `The ${named} is skipping stops`;
    default:
      return `The ${named} is on detour`;
  }
}

/** "3 hours ago" reads as a judgement a rider can make; a timestamp does not. */
function ago(hours: number): string {
  if (hours < 1) return "in the last hour";
  const h = Math.round(hours);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

export function Disruptions({
  journey,
  hasClearAlternative,
  alerts,
}: {
  journey: ScoredJourney;
  hasClearAlternative: boolean;
  alerts: { ageHours: number | null; stale: boolean } | undefined;
}): JSX.Element | null {
  // Silence would read as "nothing is wrong today". When we have not been able
  // to check, the honest output is that we do not know (P-03).
  if (alerts?.stale === true) {
    return (
      <div className="today today-unknown">
        <p className="today-head">Today</p>
        <p className="today-note">
          We could not check live service alerts
          {alerts.ageHours !== null && <> — the last we saw was {ago(alerts.ageHours)}</>}. There
          may be detours or closures this does not know about.
        </p>
      </div>
    );
  }
  if (journey.disruptions.length === 0) return null;
  const routeIds = journey.legs.flatMap((l) => (l.routeId === undefined ? [] : [l.routeId]));
  const worst = journey.disruptions.some((d) => d.kind === "no-service" || d.kind === "bypass");

  return (
    <div className={`today${worst ? " today-severe" : ""}`}>
      <p className="today-head">
        Today
        {alerts?.ageHours != null && <span className="today-age">checked {ago(alerts.ageHours)}</span>}
      </p>
      <ul className="today-list">
        {journey.disruptions.map((d) => (
          <li key={d.id}>
            <strong>{label(d, routeIds)}</strong>
            {d.cause !== null && <> — due to {d.cause}.</>}
            {d.shuttle && <> Shuttle buses are running.</>}
          </li>
        ))}
      </ul>
      <p className="today-note">
        The figures below are from normal days and do not include this.
        {hasClearAlternative && " One of the other ways is not affected."}
      </p>
    </div>
  );
}
