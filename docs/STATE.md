# Project State

**Read this first.** A single anchor for where the project stands, so no finding depends
on anyone remembering a conversation. Everything below is reproducible from the repo.

**Last updated:** 2026-08-28, after M6.

---

## What this is

A reliability-aware view of the TTC. Not "how fast is this route" but **"how likely is it
to actually work, and where does it break."**

The differentiated asset is the **segment layer**: reliability below the route level,
which no existing tool publishes. Reliability-aware TTC routing already exists
([Reroute](https://rerouteapp.ca/ttc), E-M01); segment-level reliability does not.

## Where everything lives

| Path | What |
|---|---|
| `CLAUDE.md` | Working conventions, verification habits, gotchas |
| `docs/STATE.md` | This file — the anchor |
| `docs/ux/README.md` | How the decision system works |
| `docs/ux/01-evidence.md` | Every factual claim, with source and date (`E-*`) |
| `docs/ux/02-problems.md` | Rider problems, ranked (`PR-*`) |
| `docs/ux/03-principles.md` | Design rules derived from evidence (`P-*`) |
| `docs/ux/04-personas.md` | Who we build for — `U-02`, `U-04`, `U-05`, **provisional** |
| `docs/ux/05-journeys.md` | Moments of need (`J-01`..`J-05`) |
| `docs/ux/06-decisions.md` | What we chose and what would reverse it (`D-*`) |
| `docs/ux/07-flows.md` | Screen-level user flows (`F-*`), built vs proposed |
| `docs/architecture/SYSTEM.md` | Data flow, filtering funnel, scoring model, audit gates |
| `docs/design/00-concept.md` | Design concept, and the design work still needed |
| `docs/design/01-system.md` | The four design rules, encoding, tokens, validation |
| `docs/product/PLAN.md` | v1 scope, milestones, engine contract |
| `docs/portfolio/CASE-STUDY.md` | Portfolio narrative |
| `src/` | Engine: ingest, domain, api, audits |
| `web/` | Mobile-first segment map |

**The chain:** `Evidence -> Problem -> Principle -> Decision -> Implementation`.
No decision without a principle; no principle without evidence; every decision names what
would reverse it.

## Status

| Milestone | State |
|---|---|
| M0 scaffold | done |
| M1 ingestion | done — 163,725 incidents + GTFS |
| M2 `Min Gap` audit *(gate)* | **passed** |
| M3 segment model | done — 142 subway, 18,840 surface |
| M4 reliability scoring | done |
| M5 surface geocoding | done — 76.6% (baseline 66.1%) |
| M6 segment map | done |
| M7 routing engine | **done** — Connection Scan, 1.2M connections, 6–12ms |
| M8 reliability ranking | **done** — disruption rate per journey, 53ms |
| M9 app shell | **done** — plan/explore, stop search, results, trip detail on a map |
| M10 departure advice | **done** — arrive-by search, both outcomes, buffer priced |
| Per-leg risk and route key | **done** — which part of the trip, and what the colours mean |
| Time-of-day conditioning | **done** — one toggle, defaulted to the rider's own window (D-27) |
| Benchmark | **done** — every trip ranked against typical ones of its length (D-28) |
| M11 day-of disruptions | **done** — detours, bypasses and closures qualify today's answer (D-29) |
| M12 step-free routing | **done** — the planner routes *around* blocked stations (D-30) |

## The numbers that matter

| | value | source |
|---|---|---|
| Station unreliability persistence | rho **0.78** | E-D01 |
| Segment **exposure** persistence | rho **0.68** | E-D10 |
| Segment **severity** persistence | rho **0.10** | E-D10 |
| Bus vs subway delay burden | **~17x** | E-D05 |
| Surface vs subway wait (p95) | **73 min vs 23** | E-D13 |
| Bus incidents with bunching signature | **83.8%** | E-D09 |
| Subway records that are zero-minute | **65%** | E-D04 |
| Delay attributed to terminals/yards | **20.7%** | E-D03 |
| Bus segments at high confidence | **3.1%** | E-D12 |
| Best predictor of the next 2 months | **3-month half-life decay** | E-D18 |
| Segments that shifted 2x between halves | **35.9%** | E-D18 |
| TTC riders who are equity-deserving | **66.6%** | E-L10 |
| Scarborough transit access score | **20.97** vs 102.8 affluent | E-L10 |
| Ice/snow incident average duration | **68.8 min** | E-D02 |
| Downtown vs Scarborough route density | **26 vs 17** routes per box | E-D14 |
| Worst surface route by rider-wait | **504 King**, 105,302 min | E-D14 |

## The three findings that reshaped the product

1. **Exposure persists; severity does not** (E-D10). How *often* a segment costs you time
   is predictable (rho 0.68). How *long* you wait once it happens is not (rho 0.10, with
   only 3% ties, so not a measurement artifact). Per-segment percentiles would be noise
   formatted as precision, so severity is pooled per mode and labelled. This **revised the
   engine contract written the same day** — see `D-11`.

2. **Toronto has no redundancy, so this is a forecast and not a router** (E-L12). The
   TTC's own CEO calls the system "binary" — when a line goes down there is one option.
   New York has parallel lines and express tracks, so a reliability tool there picks
   between options; Toronto usually has no second option, so the product must say whether
   the trip is viable and when to leave. See `D-13`.

3. **Delay data points at terminals and yards, not at rider risk** (E-D03). 20.7% of
   subway delay-minutes land on 12 of ~70 stations, because that is where the log entry is
   written. Shipping the obvious map would have been confidently wrong. See `D-06`, `D-12`.

## Personas and journeys

Three personas, split on the axis the research supports — **does the rider have an
alternative?** IDs are non-contiguous because U-01 was merged into U-02 and U-03 demoted to
a hypothesis; the gaps are deliberate, so existing citations stay valid.

| | rider | needs | journeys |
|---|---|---|---|
| **U-02** | captive — one route, no car | a **forecast** | J-01, J-02, J-03 |
| **U-05** | downtown — can walk | a **comparison** | J-05 |
| **U-04** | access-constrained — binary failure | a **constraint** | J-03 (named, unserved) |

| | journey | built |
|---|---|---|
| J-01 | pre-trip: when do I leave? | no (M7) |
| J-02 | at the stop: is it coming? | no — **most acute pain** |
| J-03 | mid-trip disruption | no |
| J-04 | exploratory: is this route always like this? | **yes (M6)** |
| J-05 | downtown: transit or walk? | no |

## What is open

| # | Question | Blocks |
|---|---|---|
| **Q-A** | Does a mostly-unknown map build trust or read as broken? | the interface |
| Q-B | Is the segment or the corridor the rider's unit? | D-01 |
| Q-C | Does "31 min/mo of wait caused" mean anything to a rider? | D-05 |
| Q-D | Is compass direction the right handle, or headsigns? | polish |
| Q-3 | Do riders want a verdict or the evidence? | D-05 |
| Q-5 | Does per-segment severity persist over a longer window? | D-11 |
| Q-6 | Is the segment or the corridor the rider's unit? | D-01 |

| Q-E | Do riders re-open the list after picking, or is the choice settled? | D-20 |
| Q-F | Does the two-outcome answer read as honest, or as hedging? | D-24, P-01 |

**Known gap:** GTFS-RT trip updates and vehicle positions are **not fetched at all** — only
the alerts feed is. J-02 (at-stop) and J-03 (mid-trip) both need them.

> **Fixed 2026-08-29.** Arriving between roughly 03:30 and 06:00 used to return no journey:
> the hour was read as this service day rather than the one still running from yesterday, so
> the search covered a window with almost no service. Every hour of the clock now plans.
> An earlier version of this file blamed those hours on Blue Night not being ingested, which
> was wrong — **all 35 Blue Night routes are in the loaded weekday service**, and the claim
> came from reading a service window whose hours had been printed modulo 24.

## Running it

```bash
npm install && npx prisma db push && npx prisma generate
npm run ingest            # downloads TTC open data + GTFS, builds segments, attributes
npm run audit:gap         # M2 gate — is Min Gap trustworthy?
npm run audit:stability   # M4 — does segment reliability persist?
npm run audit:coverage    # M5 — surface geocoding rate
npm run audit:timeofday   # does pooling across the day misrepresent the risk?
npm run benchmark         # what a typical trip looks like, for the comparison (D-28)
npm test                  # 135 tests
npm run dev               # API on :3000
cd web && npm install && npm run dev   # UI on :5173
node scripts/shot.mjs     # screenshot the app, including a downtown street zoom
```

All data is public Toronto Open Data + TTC GTFS. **No API keys.**
