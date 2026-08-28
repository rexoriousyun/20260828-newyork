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
| `docs/STATE.md` | This file — the anchor |
| `docs/ux/README.md` | How the decision system works |
| `docs/ux/01-evidence.md` | Every factual claim, with source and date (`E-*`) |
| `docs/ux/02-problems.md` | Rider problems, ranked (`PR-*`) |
| `docs/ux/03-principles.md` | Design rules derived from evidence (`P-*`) |
| `docs/ux/04-personas.md` | Who we build for (`U-*`) — **provisional** |
| `docs/ux/05-journeys.md` | Moments of need (`J-*`) |
| `docs/ux/06-decisions.md` | What we chose and what would reverse it (`D-*`) |
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
| M7 departure advice | **not started** — hold pending D-08 Q-A, Q-C |

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
| TTC riders who are equity-deserving | **66.6%** | E-L10 |
| Scarborough transit access score | **20.97** vs 102.8 affluent | E-L10 |
| Ice/snow incident average duration | **68.8 min** | E-D02 |

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

## What is open

| # | Question | Blocks |
|---|---|---|
| **Q-A** | Does a mostly-unknown map build trust or read as broken? | the interface |
| Q-B | Is the segment or the corridor the rider's unit? | D-01 |
| Q-C | Does "31 min/mo of wait caused" mean anything to a rider? | D-05 |
| Q-D | Is compass direction the right handle, or headsigns? | polish |
| Q-3 | Do riders want a verdict or the evidence? | D-05 |
| Q-5 | Does per-segment severity persist over a longer window? | D-11 |

**Known gap:** `D-07` commits to accessibility as a hard routing constraint for U-04, and
**nothing is implemented** — no elevator data is ingested. The decision stands; the build
has not honoured it.

## Running it

```bash
npm install && npx prisma db push && npx prisma generate
npm run ingest            # downloads TTC open data + GTFS, builds segments, attributes
npm run audit:gap         # M2 gate — is Min Gap trustworthy?
npm run audit:stability   # M4 — does segment reliability persist?
npm run audit:coverage    # M5 — surface geocoding rate
npm test                  # 50 tests
npm run dev               # API on :3000
cd web && npm install && npm run dev   # UI on :5173
```

All data is public Toronto Open Data + TTC GTFS. **No API keys.**
