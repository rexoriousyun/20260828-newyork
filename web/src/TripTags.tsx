import { useState } from "react";
import type { PlanResult, ScoredJourney } from "./api.js";
import { reliabilityFor, type View } from "./view.js";

/**
 * The conditions attached to a trip, as tags that open.
 *
 * These used to be four stacked prose blocks — today's disruptions, a route
 * that often does not turn up, thin history, what step-free cost — and they can
 * all apply at once. Four paragraphs of qualification pushed the answer and the
 * map off a phone screen, and a rider skimming could not see at a glance how
 * many things were wrong.
 *
 * `D-05` is the shape: the verdict first, the detail one interaction beneath.
 *
 * **The label carries the claim, never the tap.** `P-09` permits deferring how
 * we know and forbids deferring what we do not know — "that confidence is low"
 * and "that a segment has no data" are both in its never-hide column. So a tag
 * reads "Little data", not "Details"; the expansion adds the number, not the
 * fact. Anything that cannot be said in three words does not become a tag.
 */

const NEVER_CAME_NOTABLE = 0.5;

interface Tag {
  id: string;
  label: string;
  /** severe: this can stop the trip. warn: it changes what you should do. */
  tone: "severe" | "warn" | "unknown";
  body: JSX.Element;
}

export function TripTags({
  journey,
  view,
  alerts,
  stepFree,
}: {
  journey: ScoredJourney;
  view: View;
  alerts: { ageHours: number | null; stale: boolean } | undefined;
  stepFree: PlanResult["stepFree"];
}): JSX.Element | null {
  const [open, setOpen] = useState<string | null>(null);
  const rel = reliabilityFor(journey, view);
  const tags: Tag[] = [];

  const routeIds = journey.legs.flatMap((l) => (l.routeId === undefined ? [] : [l.routeId]));
  for (const d of journey.disruptions) {
    const named = d.routeIds.filter((r) => routeIds.includes(r)).join(", ") || d.routeIds[0] || "";
    const label =
      d.kind === "no-service" ? `${named} not running`
      : d.kind === "bypass" ? `${named} skipping stops`
      : `${named} on detour`;
    tags.push({
      id: d.id,
      label,
      tone: d.kind === "detour" ? "warn" : "severe",
      body: (
        <>
          <p>
            {d.text}
            {d.shuttle && " Shuttle buses are running."}
          </p>
          <p className="tag-note">
            Reported by the TTC
            {alerts?.ageHours != null &&
              (alerts.ageHours < 1 ? " in the last hour" : ` ${Math.round(alerts.ageHours)} hours ago`)}
            . The figures on this trip are from normal days and do not include it.
          </p>
        </>
      ),
    });
  }

  if (rel.neverCame !== null && rel.neverCame >= NEVER_CAME_NOTABLE) {
    tags.push({
      id: "never",
      label: "Often doesn't turn up",
      tone: "warn",
      body: (
        <>
          <p>
            <strong>{Math.round(rel.neverCame * 100)}%</strong> of the waiting on this trip is a
            vehicle that never comes — cancelled, sent on diversion, taken away to run a shuttle,
            or never staffed — rather than one running late.
          </p>
          <p className="tag-note">
            Waiting longer does not produce one. Across the network this is 36% of all waiting,
            and none of it on the subway.
          </p>
        </>
      ),
    });
  }

  if (stepFree != null && !stepFree.changedNothing && stepFree.blockedStations.length > 0) {
    tags.push({
      id: "stepfree",
      label: `Avoids ${stepFree.blockedStations.length} station${stepFree.blockedStations.length > 1 ? "s" : ""}`,
      tone: "warn",
      body: (
        <p>
          The quickest way uses{" "}
          <strong>
            {stepFree.blockedStations.map((b) => titleCase(b.station)).join(", ")}
          </strong>
          , which {stepFree.blockedStations.length > 1 ? "are" : "is"} not step-free. This route
          goes around{" "}
          {stepFree.blockedStations.length > 1 ? "them" : "it"}.
        </p>
      ),
    });
  }

  if (rel.coverage < 0.5) {
    tags.push({
      id: "thin",
      label: "Little data",
      tone: "unknown",
      body: (
        <p>
          We have enough history for <strong>{Math.round(rel.coverage * 100)}%</strong> of this
          route. The rest has too few recorded incidents to say anything about, so the figures
          here describe part of the trip rather than all of it.
        </p>
      ),
    });
  }

  if (tags.length === 0) return null;
  const expanded = tags.find((t) => t.id === open);

  return (
    <div className="tags">
      <div className="tag-row">
        {tags.map((t) => (
          <button
            key={t.id}
            className={`tag tag-${t.tone}`}
            aria-expanded={open === t.id}
            onClick={() => setOpen(open === t.id ? null : t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {expanded !== undefined && <div className="tag-body">{expanded.body}</div>}
    </div>
  );
}

const titleCase = (v: string): string =>
  v.toLowerCase().replace(/(^|[\s\-/])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
