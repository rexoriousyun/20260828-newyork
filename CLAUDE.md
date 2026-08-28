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
npm run dev               # API on :3000
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
`"type": "module"` context. A script in `/tmp` fails to import `playwright`.

---

## Standing gaps

Named so they are not silently carried:

- **`D-07` commits to accessibility as a hard routing constraint and nothing is
  implemented.** Elevator status *is* available in the GTFS-RT alerts feed (`E-D15`), so
  this is buildable, not blocked. U-04 is currently served by nothing.
- **GTFS-Realtime is verified live and unconsumed.** J-02 and J-03 need it.
- **The four design rules are not in the decision log** with IDs and kill conditions, which
  makes them orphans under rule 1.
- **`D-08` is open.** Every persona is provisional — derived from research and data, never
  from talking to a Toronto rider. Q-A is the highest-value question: does a mostly-unknown
  map read as honest or as broken?
