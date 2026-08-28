# Product Plan — v1

**Status:** active · **Written:** 2026-08-28 · **Supersedes:** nothing

Assembled from decisions already made in `docs/ux/06-decisions.md`. This document adds
no new product direction — it makes existing decisions legible as scope, sequence and
a definition of done.

---

## What v1 is

**A segment-level reliability layer for the TTC, plus the two journeys that need no
realtime feed.**

| | |
|---|---|
| **Core asset** | Inter-stop segment reliability scores (`D-01`) |
| **Primary metric** | Headway gap, not vehicle delay (`D-02`) |
| **Journeys served** | J-01 pre-trip departure advice, J-04 exploratory segment map (`D-03`) |
| **Network** | Engine developed on subway, **released covering buses** (`D-04`) |
| **Realtime** | None. v1 is entirely historical. |

### The one-sentence test
*"Show me which parts of my trip are actually unreliable, and when I should leave."*

If a feature does not serve that sentence, it is not in v1.

---

## Explicitly out of scope for v1

Recorded so we stop re-litigating them:

- **Live vehicle tracking / at-stop countdowns** (J-02) — needs realtime, higher
  correctness bar, and the subway has no feed (`E-D06`)
- **Mid-trip disruption handling** (J-03) — depends on realtime
- **Multi-agency routing** (GO, UP Express, YRT) — Reroute already does this well (`E-M01`)
- **Full A-to-B trip planning** — the segment layer is the asset; routing sits on it later
- **Accounts, saved trips, notifications** — no persistence story needed to prove the thesis
- **Streetcars** — included in ingestion, excluded from scored output until bus geocoding
  is solved (same free-text problem, smaller payoff)

---

## The engine contract

The segment engine is done when it can answer this, for any segment, from historical data:

```
GET /segments/:id/reliability?dow=Mon&hour=8

{
  "segment":      { "from_stop": "...", "to_stop": "...", "route": "52", "direction": "E" },
  "wait":         { "p50": 6, "p90": 19, "p95": 26, "unit": "minutes" },
  "sample":       { "incidents": 412, "window": "2025-01..2026-07", "coverage": "high" },
  "excess":       { "vs_scheduled_headway": 2.1 },
  "causes":       [ { "code": "MFUS", "share": 0.31 }, ... ],
  "confidence":   "high" | "low" | "unknown"
}
```

Non-negotiable properties, each from a principle:

1. Percentiles, never a mean (`P-01`)
2. Headway gap as the metric (`P-02`)
3. `confidence: "unknown"` is a real, distinct state — never silently rendered as healthy (`P-03`)
4. Terminal and yard incidents excluded from through-rider scores (`P-04`, `D-06`)
5. Zero-minute records filtered, and the filter documented in the response (`P-08`, `E-D04`)
6. Every number traceable to window and sample size (`P-08`)

---

## Milestones

| # | Milestone | Done when | Blocks |
|---|---|---|---|
| **M0** | Project scaffold — **DONE** | `npm run dev` starts API + web; CI runs tests | — |
| **M1** | Data ingestion — **DONE** | TTC delay data + GTFS loaded, reproducible via one command | M2 |
| **M2** | **`Min Gap` data audit — DONE, PASSED** | **Q-1 answered: is the field trustworthy?** | **everything** |
| **M3** | Segment model | Network decomposed into inter-stop segments with stable IDs | M4 |
| **M4** | Reliability scoring | Engine contract above satisfied, incl. terminal/yard correction | M5, M6 |
| **M5** | Surface geocoding | Beat 66% baseline (`E-D07`); publish the achieved rate | M6 (bus) |
| **M6** | J-04 segment map | Explore any route's reliability by segment, hour, day | M7 |
| **M7** | J-01 departure advice | "Leave by X for 90% confidence" | ship |

**M2 was a genuine gate, and it passed** (2026-08-28). Coherence 95.2–99.1% and
completeness 95.3–99.6% across modes against a pre-registered 95% threshold, with no
temporal instability across 57 mode-months. `D-02` holds and the headway gap remains the
primary metric. Run `npm run audit:gap` to reproduce.

---

## Definition of done for v1

- A Toronto rider can look up any bus route and see **which segments** are unreliable, by
  hour and day of week — something no existing tool provides (`E-M01`, `E-M02`)
- Departure advice is stated as a confidence, never a point estimate
- Coverage gaps are visible as gaps, not as good news
- Every published number is traceable to its window and sample

## Success criteria

| Criterion | Target | Why |
|---|---|---|
| Segment score stability | rho > 0.5 split-half at segment granularity | Below this, segments are noise and `D-01` fails |
| Surface coverage | > 66% of delay-minutes geocoded | Beat the baseline in `E-D07` |
| Honest uncertainty | 100% of low-sample segments marked, none rendered as healthy | `P-03` |
| Rider validation | 5+ riders confirm a segment we flagged matches their experience | `D-08`, `P-08` |

---

## Sequencing note

The full UX exploration (service blueprint, information architecture, wireframes) is
**not a prerequisite for M0–M5**. Those milestones produce a data engine with an API and
no interface. UX exploration blocks **M6**, where pixels first appear.

Running them in parallel is fine and probably preferable — the engine informs what the
interface can honestly show, and `D-08` (rider interviews) can proceed alongside.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `Min Gap` unreliable (Q-1) | Reverses `D-02`, core metric | M2 gate before any modelling |
| Geocoding stalls at 66% (Q-2) | Bus segments too sparse; `D-04` at risk | M5 measured explicitly; fall back to route-level for sparse segments |
| Segment scores unstable | `D-01` fails, product thesis dies | Split-half test at segment level in M4 |
| Personas wrong (`D-08`) | M6/M7 build the wrong interface | Interviews in parallel, before M6 |
