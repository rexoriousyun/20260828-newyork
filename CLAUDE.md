# Working notes

Conventions and hard-won gotchas for this project. Read `docs/STATE.md` first — it is the
anchor for what the project is, where it stands, and what is open.

---

## Orientation

| | |
|---|---|
| **Branch** | `claude/ny-trip-app-dev-paw8s8` — develop and push here, never elsewhere |
| **What it is** | A map-first TTC trip planner whose differentiator is reliability (`D-14`) |
| **Read first** | `docs/STATE.md`, then `docs/ux/README.md` for how decisions are structured |
| **Design** | `docs/design/00-concept.md` (concept) and `01-system.md` (rules, tokens, validation) |

## Commands

```bash
npm run ingest            # TTC open data + GTFS -> SQLite, builds segments, attributes, geometry
npm run audit:gap         # M2 gate — is Min Gap trustworthy? (pre-registered thresholds)
npm run audit:stability   # does segment reliability persist? (rho > 0.5 on exposure)
npm run audit:coverage    # surface geocoding rate vs the 66.1% baseline
npm test                  # vitest
npm run typecheck
npm run dev               # API on :3000 — /plan builds a ~6s graph on first request, then 6-12ms
cd web && npm run dev     # UI on :5173, proxies /api and /tiles to :3000
```

All data is public Toronto Open Data + TTC GTFS. **No API keys anywhere.**

---

## How decisions work here

The chain is `Evidence (E-*) -> Problem (PR-*) -> Principle (P-*) -> Decision (D-*)`, and it
has four rules. They are in `docs/ux/README.md`; the two that get broken most often:

- **No orphan decisions.** A decision with no principle behind it is a preference, and gets
  labelled one.
- **Superseded, never deleted.** `D-13` is still in the log, marked superseded, with the
  reasoning error visible. Do not tidy these away — the history is the point.

When you learn something, **write it down as evidence with an ID and a date**, then follow
the chain forward to whatever it invalidates. Several decisions here were reversed by
measurement; that is the system working, not a failure.

## Working conventions

- **Ask one thing at a time.** The user is often on mobile. Multiple questions in one turn
  do not get answered.
- **Do not use the multiple-choice question widget** — it is broken on mobile in this
  setup. Ask in plain text.
- **Pre-register thresholds in the source**, not in the write-up, so a verdict cannot be
  renegotiated after seeing the numbers. See `src/audit/*.ts`.
- **Never fill a data gap with a plausible estimate.** Unknown is a designed state
  (`P-03`). An unattributed record is visible; a mis-attributed one is invisible and wrong.
- **Commit messages carry the reasoning**, not just the change: what was wrong, what was
  measured, what was traded away. They are the second-best record after the docs.
- **Do not spam artifacts.** One artifact per living document. If it already exists, publish
  to the same URL (pass `url`) so the link the user holds keeps working — use
  `action: "list"` to find it when the URL is not to hand. A new artifact is for a genuinely
  new document, never for a revision of one that exists.

## Design and flow decisions run through the UX foundation

Before deciding anything about design or a user flow, walk the foundation and cite what you
found. Not as ceremony — every time this was skipped, the decision missed a factor that was
already written down.

| Check | File | Ask |
|---|---|---|
| Who is this for | `04-personas.md` | Which persona, and what is their anti-goal? |
| When do they hit it | `05-journeys.md` | Which journey, and what must never be deferred there? |
| What breaks today | `02-problems.md` | Which `PR-*` does this address or worsen? |
| What constrains it | `03-principles.md` | Which `P-*` applies, and does this violate one? |
| What was already decided | `06-decisions.md` | Does a `D-*` already cover or contradict this? |

If the decision survives that walk, record it with the citations. If it does not, the
foundation just saved a rebuild.

**This has caught real errors.** Routing was reframed as a forecast without checking the
brief (`D-13`, superseded). Five user flows were designed without consulting the product
owner at all. A colour was chosen for its validator score without checking it against the
concept it was meant to serve.

## Verification

Typechecks and tests pass on code that is visibly broken. Three real defects shipped clean
through both before being caught by eye.

- **Render it and look.** After any visual change, screenshot it.
- **Check at street zoom** (`zoom ~14.5`, downtown). The wide view flatters everything and
  hid the blue POI icons, the muddy selection tint, and a "green" that read as black.
  `window.__map` is exposed in dev for exactly this: `__map.jumpTo({center:[-79.3905,43.6465],zoom:14.6})`.
- **Compute colour, then look at it.** The palette validator checks separation, not whether
  a colour still reads as the colour it is meant to be. It passed a near-black green.
- **Verify a framing held.** A route change fires `fitBounds`, which can land after your
  `jumpTo` and silently undo it. Assert the zoom before screenshotting.

---

## Gotchas that cost real time

**Prisma + SQLite stores `DateTime` as integer milliseconds.** `strftime('%Y-%m', col)`
returns NULL and any GROUP BY on it collapses silently. Use
`strftime('%Y-%m', col / 1000, 'unixepoch')`. This made an audit check pass vacuously — it
reported 3 rows where 57 were expected. Audits now refuse to issue a verdict if the row
count looks implausible.

**`pkill -f "server.ts"` kills your own shell**, because the pattern appears in the command
line you are running. Use `fuser -k -n tcp 3000` instead.

**The TTC portal publishes double-encoded text.** Delay-code descriptions arrive as UTF-8
bytes that already encode mojibake (`c3 a2 c2 80 c2 93` for an en-dash). Decoding correctly
is not enough — the extra encoding round must be undone. See `repairMojibake`.

**MapLibre: `zoom` may only feed a top-level `step`/`interpolate`.** A per-feature factor
cannot wrap the ramp; put it inside each stop's output instead.

**MapLibre rejects a relative `sprite` URL.** The tile proxy builds an absolute one from the
request origin, so it works behind the dev proxy and in production without config.

**Vite does not emit MapLibre's web worker** when it pre-bundles the package — the worker
404s, the canvas stays blank, and nothing errors on the main thread. `optimizeDeps.exclude`
must list `maplibre-gl`.

**Do not forward `content-encoding` when proxying with `fetch`.** The body is already
decompressed; echoing the header makes the browser try to gunzip plain bytes.

**Chromium in this sandbox cannot reach tile hosts** even through the proxy, though Node
can. Tiles are proxied through the API — which is the right production choice anyway.

**Playwright scripts must run from the project directory** so they resolve the ESM
`"type": "module"` context. A script in `/tmp` fails to import `playwright`. If the bundled
browser build is missing, launch with `executablePath: "/opt/pw-browsers/chromium"` rather
than running `playwright install`.

**Headless Chromium can composite a stale white band over the map canvas.** After a DOM
change that grows a scrollable panel above the WebGL canvas, a screenshot may show the top
of the map blank while the map is drawing correctly. Two independent checks proved it is a
capture artifact, not a bug: `queryRenderedFeatures` returned every feature, and reading the
canvas back inside a `render` handler gave identical pixels in both states. **Before
chasing a blank map, read the canvas back** — `drawImage` the map canvas onto an offscreen
2D context inside `map.once("render", ...)` and sample it.

**`map.once("idle")` never fires if the map is already idle.** A screenshot script that
awaits it hangs forever. Race it against a timeout.

**Fit the map to measured chrome, not to constants.** The topbar and the sheet both float
over the canvas and both change height. `chromePadding()` in `MapView.tsx` reads their live
rects; the hardcoded insets it replaced drew half of every planned route underneath the
results sheet.

**GTFS service days run past midnight.** This feed's weekday service spans 03:28 to 30:35 —
06:35 the next morning. Comparing a wall-clock 01:45 against that window made the planner
report "no journey" for a 01:14 departure sitting in its own data. Put a wall-clock time in
the service day first (`inServiceDay`). Found only because the time control was defaulted to
*now* and the app happened to run at 01:34.

**Slice both sides of a ratio, or neither.** Peak-hour incidents over all-day trips
understates peak by the factor peak service exceeds the daily mean. Risk is incidents per
trip; if the numerator is conditioned the denominator must be too. See `frequency.ts`.

**A band gated on observed events keeps only the bad bands.** The first time-of-day audit
gated each band on incidents it had accumulated, so quiet bands vanished and every survivor
looked worse than the pooled figure — a median above 1.0 in all five bands, which is
impossible for a trip-weighted decomposition and was the tell. Gate on *expected* events
instead; an observed zero where three were predicted is evidence, not absence of it.

**`coalesce(get(x), 0)` in a colour ramp turns missing data into the best possible value.**
A planned trip drew its unmeasured stretches at the green end of the scale for a whole
milestone — valid expression, correct data, invisible to typecheck and tests. Any feature fed
to `lineColorExpression` must carry `confidence`, and unknown is drawn as a separate dashed
layer, never as a stop on the ramp. See `D-26`.

**A reference class can answer a different question from the one on screen.** The trip
benchmark ranked every real trip in the worst tenth of its class — not because Toronto's
trips are bad, but because the sampled reference had median coverage 0.23 and was therefore
mostly unmeasured and fake-safe. `P-03` applies to reference classes too. Check what the
comparison population actually looks like before believing a percentile.

**A percentile alone oversells on a tight distribution.** A trip 15% riskier than the median
can sit below 86% of its class, and "riskier than most" printed beside two nearly-equal
numbers reads as spin. A verdict needs rank *and* a ratio (`MATERIAL_RATIO`).

**A "share of the total" threshold fires on an even split.** Two equal legs each carry just
over half a journey's risk, so any share threshold at or below 50% names one of them as the
worst. Dominance is a ratio against the runner-up (`WORST_DOMINANCE`), not a share of the sum.

**A threshold that produces absurd advice is the wrong shape of answer, not a wrong number.**
Departure advice first recommended a buffer above a disruption rate — and told riders to
leave 58 minutes early for a twice-a-year event. Expected value fails the other way. The fix
was to stop recommending: state the rate and the price, and let the rider weigh a penalty
only they know. Kept visible in `D-24`.

**Never prettify a name on the path into a lookup.** `displayStopName` runs on the way to
the screen only. Scoring keys on the raw GTFS name because the segment index was built from
it — the same shape of mistake that pinned journey coverage at 7.7%.

---

## Standing gaps

Named so they are not silently carried:

- **`D-07` is implemented as a filter, not as routing.** Blocked segments are marked; the
  planner does not yet route *around* them. U-04 is partially served.
- **GTFS-Realtime alerts are consumed for elevators and for route disruptions; trip updates
  and vehicle positions are not.** J-02 (at-stop) and J-03 (mid-trip) need the latter two —
  M11 serves J-01's "is today unusual" stage only.
- **Alerts carry no `active_period`.** Presence in the latest snapshot is the only evidence
  an alert is live, so the app reports the snapshot's age and stops claiming to know past
  twelve hours. Silence would read as "nothing is wrong today".
- **`D-08` is open.** Every persona is provisional — derived from research and data, never
  from talking to a Toronto rider. Q-A is the highest-value question: does a mostly-unknown
  map read as honest or as broken?
