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

> **Revised 2026-08-28 by D-11.** This contract originally specified per-segment
> percentiles. Segment-level testing showed severity does not persist (rho = 0.10), so
> percentiles are pooled across the network and only exposure is segment-specific.

```
GET /segments/:id/reliability?dayOfWeek=Monday&hour=8

{
  "segment":    { "id": "1:N:DAVISVILLE->EGLINTON", "routeId": "1", "direction": "N", ... },
  "exposure":   { "gapMinutesPerMonth": 172.4, "incidentsPerMonth": 14.09 },
  "severity":   { "p50": 9, "p90": 17, "p95": 23, "basis": "pooled-network" },
  "sample":     { "incidents": 267, "window": {...}, "filters": [...] },
  "causes":     [ { "code": "MUIR", "description": "...", "share": 0.094 }, ... ],
  "confidence": "high" | "low" | "unknown"
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
| **M3** | Segment model — **DONE** | Network decomposed into inter-stop segments with stable IDs | M4 |
| **M4** | Reliability scoring — **DONE** | Engine contract above satisfied, incl. terminal/yard correction | M5, M6 |
| **M5** | Surface geocoding — **DONE** | Beat 66% baseline (`E-D07`); publish the achieved rate | M6 (bus) |
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
| Segment score stability | rho > 0.5 split-half at segment granularity | **MET: 0.681 on exposure.** Severity failed at 0.10, reshaping the contract (D-11) |
| Surface coverage | > 66% of delay-minutes geocoded | **MET: 76.6% raw, 80.6% addressable** (E-D11) |
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
| ~~Geocoding stalls at 66%~~ | — | **Resolved: 76.6% achieved (E-D11)** |
| Segment scores unstable | `D-01` fails, product thesis dies | Split-half test at segment level in M4 |
| Personas wrong (`D-08`) | M6/M7 build the wrong interface | Interviews in parallel, before M6 |
