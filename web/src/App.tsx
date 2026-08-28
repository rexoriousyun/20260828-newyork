import { useCallback, useEffect, useState } from "react";
import { MapView } from "./MapView.js";
import { UNRELIABLE_THRESHOLD, stateOf } from "./map.js";
import {
  fetchRoutes,
  fetchRouteMap,
  type RouteSummary,
  type RouteMap,
  type SegmentFeature,
} from "./api.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The answer, and only the answer. Everything behind it waits for a tap (P-09). */
function Sheet({ feature, onClose }: { feature: SegmentFeature; onClose: () => void }): JSX.Element {
  const [showWhy, setShowWhy] = useState(false);
  const p = feature.properties;

  useEffect(() => {
    setShowWhy(false);
  }, [p.segmentId]);

  return (
    <div className="sheet" role="dialog" aria-label="Segment detail">
      <button className="sheet-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="sheet-where">
        {p.from} <span className="arrow">→</span> {p.to}
        {p.isTerminalApproach && <span className="flag">terminal</span>}
      </div>

      {p.blockedBy !== null && (
        <div className="blocked">
          <strong>
            {p.blockedBy.state === "outage"
              ? `${p.blockedBy.station}: elevator out of service`
              : `${p.blockedBy.station} is not step-free`}
          </strong>
          <span>
            {p.blockedBy.state === "outage"
              ? "Reported by the TTC right now — this may clear."
              : "This station has no step-free route. It will not change today."}
          </span>
        </div>
      )}

      {p.confidence === "unknown" ? (
        <>
          <p className="answer">We don&rsquo;t have enough data on this stretch to say.</p>
          <p className="quiet">
            {p.incidents} recorded {p.incidents === 1 ? "incident" : "incidents"} — shown as
            unknown rather than as reliable.
          </p>
        </>
      ) : (
        <>
          {/* The value gets the weight it earns; the sentence explains it. One
              step of emphasis, not a headline competing with a subhead. */}
          <div className="stat">
            <span className="stat-value">{Math.round(p.gapMinutesPerMonth ?? 0)}</span>
            <span className="stat-unit">min / month</span>
          </div>
          <p className="stat-label">
            {stateOf(p.confidence, p.gapMinutesPerMonth) === "unreliable"
              ? "of waiting caused — among the worst stretches we can measure."
              : "of waiting caused. Usually fine."}
          </p>
          {p.confidence === "low" && (
            <p className="caveat">Based on limited data — treat as a rough signal.</p>
          )}
          <button className="why" onClick={() => setShowWhy(!showWhy)} aria-expanded={showWhy}>
            {showWhy ? "Hide details" : "Why this number?"}
          </button>
          {showWhy && (
            <dl className="why-body">
              <dt>Incidents</dt>
              <dd>{p.incidentsPerMonth} per month</dd>
              <dt>Sample</dt>
              <dd>{p.incidents.toLocaleString()} incidents</dd>
              <dt>Confidence</dt>
              <dd>{p.confidence}</dd>
              {!p.drawnOnStreets && (
                <>
                  <dt>Shape</dt>
                  <dd>approximate — drawn as a straight line</dd>
                </>
              )}
            </dl>
          )}
        </>
      )}
    </div>
  );
}

export function App(): JSX.Element {
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [day, setDay] = useState("");
  const [hour, setHour] = useState("");
  const [stepFree, setStepFree] = useState(false);
  const [data, setData] = useState<RouteMap | null>(null);
  const [feature, setFeature] = useState<SegmentFeature | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoutes()
      .then((r) => {
        setRoutes(r.routes);
        const first = r.routes[0];
        if (first) setSelected(`${first.routeId}|${first.direction}`);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (selected === "") return;
    const [routeId, direction] = selected.split("|") as [string, string];
    setFeature(null);
    fetchRouteMap(routeId, direction, {
      ...(day !== "" ? { dayOfWeek: day } : {}),
      ...(hour !== "" ? { hour: Number(hour) } : {}),
      ...(stepFree ? { stepFree: true } : {}),
    })
      .then(setData)
      .catch((e: unknown) => setError(String(e)));
  }, [selected, day, hour, stepFree]);

  const onSelect = useCallback((f: SegmentFeature | null) => setFeature(f), []);

  return (
    <div className="app">
      <MapView data={data} onSelect={onSelect} selectedId={feature?.properties.segmentId ?? null} />

      <div className="topbar">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Route">
          {routes.map((r) => (
            <option key={`${r.routeId}|${r.direction}`} value={`${r.routeId}|${r.direction}`}>
              {r.name} · {r.direction}
            </option>
          ))}
        </select>
        <div className="filters">
          <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day">
            <option value="">Any day</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d.slice(0, 3)}
              </option>
            ))}
          </select>
          <select value={hour} onChange={(e) => setHour(e.target.value)} aria-label="Hour">
            <option value="">Any hour</option>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
        <button
          className="toggle"
          aria-pressed={stepFree}
          onClick={() => setStepFree(!stepFree)}
        >
          Step-free only
        </button>
      </div>

      {error !== null && <div className="sheet">Could not load: {error}</div>}

      {feature !== null ? (
        <Sheet feature={feature} onClose={() => setFeature(null)} />
      ) : (
        data !== null && (
          <div className="sheet legend-sheet">
            <div className="coverage-line">
              <strong>{data.coverage.scored}</strong> of <strong>{data.coverage.segments}</strong>{" "}
              stretches have enough data
            </div>
                  <div className="legend">
              <span>
                <i className="k-scale" />
                less waiting → more
              </span>
              <span>
                <i className="k-unknown" />
                not enough data
              </span>
              {stepFree && (
                <span>
                  <i className="k-blocked" />
                  not step-free
                </span>
              )}
            </div>
            <div className="quiet">Minutes of waiting caused per month. Tap a line.</div>
          </div>
        )
      )}
    </div>
  );
}
