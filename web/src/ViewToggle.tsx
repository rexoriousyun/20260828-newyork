import type { ScoredJourney } from "./api.js";
import { bandLabel, type View } from "./view.js";

/**
 * One control for which measurement the whole screen is showing.
 *
 * It governs the numbers *and* the colours on the map, because a map coloured
 * on one basis beside text written on another is worse than either alone.
 *
 * It only appears when there is a real choice: on a trip where no stretch
 * carries enough exposure in its own band, there is nothing to switch to, and
 * a toggle with one working setting is a promise the data cannot keep.
 */
export function ViewToggle({
  journey,
  view,
  onChange,
}: {
  journey: ScoredJourney;
  view: View;
  onChange: (v: View) => void;
}): JSX.Element | null {
  if (journey.atTime === null) return null;
  return (
    <div className="view-toggle" role="group" aria-label="Which measurement">
      <button aria-pressed={view === "atTime"} onClick={() => onChange("atTime")}>
        {bandLabel(journey)}
      </button>
      <button aria-pressed={view === "allDay"} onClick={() => onChange("allDay")}>
        All day
      </button>
    </div>
  );
}
