import { useCallback, useEffect, useRef, useState } from "react";
import { MapView } from "./MapView.js";
import { StopSearch } from "./StopSearch.js";
import { JourneyList } from "./JourneyList.js";
import { JourneyDetail } from "./JourneyDetail.js";
import { WhenControl } from "./WhenControl.js";
import { DepartureAdvice } from "./DepartureAdvice.js";
import { UNRELIABLE_THRESHOLD, stateOf } from "./map.js";
import {
  fetchRoutes,
  fetchRouteMap,
  planTrip,
  type RouteSummary,
  type RouteMap,
  type SegmentFeature,
  type ScoredJourney,
  type StopHit,
} from "./api.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const hhmm = (s: number): string =>
  `${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

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

  // Planning is the product (D-14); exploring a route is a mode within it, not
  // the home screen.
  const [mode, setMode] = useState<"plan" | "explore">("plan");
  const [from, setFrom] = useState<StopHit | null>(null);
  const [to, setTo] = useState<StopHit | null>(null);
  // Arrive-by is the default: the rider this is built for knows their arrival
  // time, not their departure time (J-01).
  const [when, setWhen] = useState<{ mode: "arriveBy" | "departAt"; seconds: number }>({
    mode: "arriveBy",
    seconds: 9 * 3600,
  });
  const [journeys, setJourneys] = useState<ScoredJourney[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planNote, setPlanNote] = useState<string | null>(null);
  // Results arrive expanded so the choice is real; picking one folds the sheet
  // back so the map — the retrieval mechanism (D-14) — gets the screen.
  const [listOpen, setListOpen] = useState(true);
  // Once the trip is stated, the form has done its job. It folds to one line so
  // the map gets the height back — three input rows is 195px of an 844px phone,
  // and the map is the retrieval mechanism, not the form (D-20).
  const [formOpen, setFormOpen] = useState(true);
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

  // The topbar floats over the canvas and changes height with the mode, so the
  // map's own controls are offset from its measured height rather than a
  // constant that was right for one of the two.
  const topbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = topbarRef.current;
    if (el === null) return;
    const set = (): void =>
      document.documentElement.style.setProperty("--topbar-h", `${Math.round(el.offsetHeight)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  useEffect(() => {
    if (mode !== "plan" || from === null || to === null) return;
    setPlanning(true);
    setPlanNote(null);
    planTrip(from.id, to.id, when)
      .then((r) => {
        if (r.journeys && r.journeys.length > 0) {
          setJourneys(r.journeys);
          setChosen(r.journeys[0]!.id);
          setListOpen(r.journeys.length > 1);
          setFormOpen(false);
        } else {
          setJourneys(null);
          setPlanNote(r.reason ?? "No journey found.");
        }
      })
      .catch((e: unknown) => setPlanNote(String(e)))
      .finally(() => setPlanning(false));
  }, [mode, from, to, when]);

  const chosenJourney = journeys?.find((j) => j.id === chosen) ?? null;

  return (
    <div className="app">
      <MapView
        data={mode === "explore" ? data : null}
        journey={mode === "plan" ? (chosenJourney?.geojson ?? null) : null}
        fitToken={`${mode}|${chosen ?? ""}|${listOpen ? "open" : "peek"}`}
        onSelect={onSelect}
        selectedId={feature?.properties.segmentId ?? null}
      />

      <div className="topbar" ref={topbarRef}>
        <div className="modes" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode === "plan"} onClick={() => setMode("plan")}>Plan a trip</button>
          <button role="tab" aria-selected={mode === "explore"} onClick={() => setMode("explore")}>Explore a route</button>
        </div>

        {mode === "plan" ? (
          formOpen || journeys === null ? (
            <div className="planner">
              <StopSearch label="From" value={from} onChange={setFrom} />
              <StopSearch label="To" value={to} onChange={setTo} />
              <WhenControl mode={when.mode} seconds={when.seconds} onChange={setWhen} />
            </div>
          ) : (
            <button className="planner trip-summary" onClick={() => setFormOpen(true)}>
              {/* Both ends truncate. Ellipsising the line as a whole ate the
                  destination, which is the half a rider is checking. */}
              <span className="trip-ends">
                <span className="trip-end">{from?.name}</span>
                <span className="arrow">→</span>
                <span className="trip-end">{to?.name}</span>
              </span>
              <span className="trip-when">
                {when.mode === "arriveBy" ? "by" : "from"} {hhmm(when.seconds)}
              </span>
            </button>
          )
        ) : (
          <>
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
                {DAYS.map((d) => <option key={d} value={d}>{d.slice(0, 3)}</option>)}
              </select>
              <select value={hour} onChange={(e) => setHour(e.target.value)} aria-label="Hour">
                <option value="">Any hour</option>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
            <button className="toggle" aria-pressed={stepFree} onClick={() => setStepFree(!stepFree)}>
              Step-free only
            </button>
          </>
        )}
      </div>

      {error !== null && <div className="sheet">Could not load: {error}</div>}

      {mode === "plan" ? (
        <div className={`sheet plan-sheet${journeys !== null && !listOpen ? " peek" : ""}`}>
          {journeys !== null && journeys.length > 1 && (
            <button
              className="grabber"
              aria-expanded={listOpen}
              onClick={() => setListOpen(!listOpen)}
            >
              <span className="grabber-bar" />
              <span className="grabber-label">
                {listOpen ? "Hide other ways" : `${journeys.length - 1} other way${journeys.length > 2 ? "s" : ""}`}
              </span>
            </button>
          )}
          {from === null || to === null ? (
            <p className="quiet">Choose where you are starting and where you are going.</p>
          ) : planning ? (
            <p className="quiet">Planning…</p>
          ) : planNote !== null ? (
            <p className="answer">{planNote}</p>
          ) : journeys !== null ? (
            <>
              {/* With a deadline the advice *is* the answer card; without one
                  the journey card is. Never both — they restate one trip. */}
              {!listOpen && chosenJourney?.advice != null ? (
                <DepartureAdvice journey={chosenJourney} />
              ) : (
                <JourneyList
                  journeys={journeys}
                  selected={chosen}
                  collapsed={!listOpen}
                  onSelect={(id) => {
                    setChosen(id);
                    setListOpen(false);
                  }}
                />
              )}
              {!listOpen && chosenJourney !== null && <JourneyDetail journey={chosenJourney} />}
              {!listOpen && chosenJourney?.advice != null && (
                <p className="advice-basis">
                  An estimate from recorded disruptions — not a promise about today&rsquo;s
                  vehicle.
                </p>
              )}
              <p className="quiet">
                {when.mode === "arriveBy" ? "Arriving by" : "Leaving at"} {hhmm(when.seconds)} on a
                weekday.
              </p>
            </>
          ) : null}
        </div>
      ) : feature !== null ? (
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
