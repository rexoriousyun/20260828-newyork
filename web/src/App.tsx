import { useEffect, useMemo, useState } from "react";
import {
  fetchRoutes,
  fetchRouteReliability,
  type RouteSummary,
  type RouteReliability,
  type SegmentReliability,
} from "./api.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Exposure bands, in gap-minutes per month.
 *
 * Fixed thresholds rather than a per-route relative scale: a rider comparing two
 * routes needs the colours to mean the same thing on both. Normalising within a
 * route would paint its least-bad segment green even when the whole route is bad.
 */
const BANDS = [
  { max: 15, varName: "--e0", label: "under 15" },
  { max: 40, varName: "--e1", label: "15-40" },
  { max: 80, varName: "--e2", label: "40-80" },
  { max: 140, varName: "--e3", label: "80-140" },
  { max: Infinity, varName: "--e4", label: "140+" },
] as const;

function bandFor(minutes: number): (typeof BANDS)[number] {
  return BANDS.find((b) => minutes < b.max) ?? BANDS[BANDS.length - 1]!;
}

function Bar({ segment }: { segment: SegmentReliability }): JSX.Element {
  // An unknown segment is not a low-exposure segment. It gets its own visual
  // treatment so it can never be read as good news (P-03).
  if (segment.confidence === "unknown" || segment.exposure === null) {
    return (
      <div className="bar unknown" title="Not enough data to say">
        <span>no data</span>
      </div>
    );
  }
  const minutes = segment.exposure.gapMinutesPerMonth;
  return (
    <div className="bar" style={{ background: `var(${bandFor(minutes).varName})` }}>
      <span>{Math.round(minutes)} min/mo</span>
    </div>
  );
}

function Detail({ segment }: { segment: SegmentReliability }): JSX.Element {
  const { exposure, severity, sample, causes, confidence } = segment;
  const [showWhy, setShowWhy] = useState(false);

  // Not knowing is never deferred. P-09 hides the method, never the uncertainty.
  if (confidence === "unknown") {
    return (
      <div className="detail">
        <p className="answer">We don&rsquo;t have enough data on this stretch to say.</p>
        <p className="quiet">
          {sample.incidents} recorded {sample.incidents === 1 ? "incident" : "incidents"}
          {sample.filters.length > 1 ? " under these filters" : ""} — not enough to describe how
          it behaves. Shown as unknown rather than as reliable.
        </p>
      </div>
    );
  }

  return (
    <div className="detail">
      {/* The answer, alone. Everything that produced it waits until asked. */}
      <p className="answer">
        Costs riders <strong>{Math.round(exposure?.gapMinutesPerMonth ?? 0)} minutes</strong> of
        waiting a month
        {severity !== null && (
          <>
            , typically <strong>{severity.p50} min</strong> at a time
          </>
        )}
        .
      </p>

      {/* Low confidence is part of the claim, not part of the method. Always shown. */}
      {confidence === "low" && (
        <p className="caveat">Based on limited data — treat as a rough signal.</p>
      )}

      <button className="why" onClick={() => setShowWhy(!showWhy)} aria-expanded={showWhy}>
        {showWhy ? "Hide details" : "Why this number?"}
      </button>

      {showWhy && (
        <div className="why-body">
          <dl>
            <dt>Incidents</dt>
            <dd>{exposure?.incidentsPerMonth ?? 0} per month</dd>
            <dt>Sample</dt>
            <dd>
              {sample.incidents.toLocaleString()} incidents
              {sample.window ? `, ${sample.window.start} to ${sample.window.end}` : ""}
            </dd>
            <dt>Confidence</dt>
            <dd>{confidence}</dd>
          </dl>

          {severity !== null && (
            <>
              <h3>Wait once it happens</h3>
              <div>
                typically {severity.p50} min, {severity.p90} at the 90th percentile,{" "}
                {severity.p95} at the 95th
              </div>
              <p className="quiet">
                These percentiles describe{" "}
                {severity.basis === "pooled-subway" ? "the subway" : "surface routes"} as a whole,
                not this segment. How <em>often</em> a segment costs you time persists over time;
                how <em>long</em> the wait runs does not, so a per-segment figure would imply a
                precision the data does not support.
              </p>
            </>
          )}

          {causes.length > 0 && (
            <>
              <h3>Most common causes</h3>
              <ul>
                {causes.map((c) => (
                  <li key={c.code}>
                    {c.description.toLowerCase()} — {Math.round(c.share * 100)}%
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="quiet">Filters applied: {sample.filters.join("; ")}</p>
        </div>
      )}
    </div>
  );
}

export function App(): JSX.Element {
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [day, setDay] = useState<string>("");
  const [hour, setHour] = useState<string>("");
  const [data, setData] = useState<RouteReliability | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRoutes()
      .then((r) => {
        setRoutes(r.routes);
        if (r.routes[0]) setSelected(`${r.routes[0].routeId}|${r.routes[0].direction}`);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (selected === "") return;
    const [routeId, direction] = selected.split("|") as [string, string];
    setLoading(true);
    setOpenId(null);
    fetchRouteReliability(routeId, direction, {
      ...(day !== "" ? { dayOfWeek: day } : {}),
      ...(hour !== "" ? { hour: Number(hour) } : {}),
    })
      .then(setData)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [selected, day, hour]);

  const current = useMemo(
    () => routes.find((r) => `${r.routeId}|${r.direction}` === selected),
    [routes, selected],
  );

  return (
    <div className="wrap">
      <h1>TTC segment reliability</h1>
      <p className="sub">
        Which stretches of a route actually cost riders time, from {" "}
        {data?.segments[0]?.sample.window?.start ?? "2025"} onward.
      </p>

      {error !== null && <p className="msg">Could not load data: {error}</p>}

      <div className="controls">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Route">
          {routes.map((r) => (
            <option key={`${r.routeId}|${r.direction}`} value={`${r.routeId}|${r.direction}`}>
              {r.name} · {r.direction} ({r.scored}/{r.segments})
            </option>
          ))}
        </select>
        <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day of week">
          <option value="">Any day</option>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {d}
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

      {data !== null && (
        <div className="coverage">
          <span>
            <strong>{data.coverage.scored}</strong> of <strong>{data.coverage.segments}</strong>{" "}
            segments have enough data
          </span>
          {data.coverage.unknown > 0 && <span>· {data.coverage.unknown} unknown</span>}
          {current && <span>· {current.name}</span>}
        </div>
      )}

      <div className="legend">
        {BANDS.map((b) => (
          <span key={b.label}>
            <i style={{ background: `var(${b.varName})` }} />
            {b.label}
          </span>
        ))}
        <span>
          <i
            style={{
              background:
                "repeating-linear-gradient(-45deg, var(--unknown) 0 4px, transparent 4px 8px)",
              border: "1px dashed var(--unknown)",
            }}
          />
          no data
        </span>
        <span>min of wait caused per month</span>
      </div>

      {loading && <p className="msg">Loading…</p>}

      {!loading &&
        data?.segments.map((s) => (
          <div key={s.segment.id}>
            <button
              className="seg"
              aria-expanded={openId === s.segment.id}
              onClick={() => setOpenId(openId === s.segment.id ? null : s.segment.id)}
            >
              <span className="name">
                {s.segment.fromStation}
                {s.segment.isTerminalApproach && <span className="flag">terminal</span>}
                <br />
                <span className="to">to {s.segment.toStation}</span>
              </span>
              <Bar segment={s} />
            </button>
            {openId === s.segment.id && <Detail segment={s} />}
          </div>
        ))}

      {!loading && data?.segments.length === 0 && (
        <p className="msg">No segments for this route and direction.</p>
      )}
    </div>
  );
}
