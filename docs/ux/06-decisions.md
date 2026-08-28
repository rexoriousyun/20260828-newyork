# Decision Log

Every decision cites the principles behind it and states what would reverse it.
Superseded decisions are marked, never deleted.

---

## D-01 — The segment reliability layer is the core asset `ACCEPTED`
**Cites:** P-02, P-04 · **Problems:** PR-02 · **Evidence:** E-M01, E-M02, E-D01

Build inter-stop **segment**-level reliability as the foundational data product. Routing
sits on top of it later.

*Why:* reliability-aware TTC routing already exists (Reroute) and does it competently.
Nobody exposes reliability below the route level. rho = 0.78 says segment scores are
stable enough to be meaningful. A router without the segment layer is a worse version of
a product that already ships.

**Reversed if:** segment-level scores prove unstable once terminal/yard correction is
applied (rho drops below ~0.5 at segment granularity), or a competitor ships the layer
first and does it well.

## D-02 — Headway gap is the primary metric `ACCEPTED`
**Cites:** P-02, P-01 · **Problems:** PR-01, PR-08 · **Evidence:** E-D09, E-L06

`Min Gap` is the headline metric throughout. `Min Delay` is diagnostic only.

*Why:* the gap is what a rider experiences. Vehicle lateness understates bus pain by ~58%,
and 83.8% of bus incidents carry the bunching signature. This is public data nobody is
using correctly, and it directly answers the documented critique that official metrics
hide lived experience.

**Reversed if:** `Min Gap` turns out to be unreliably recorded.

> **Confirmed 2026-08-28 (M2 audit, `npm run audit:gap`).** Among incidents with a real
> delay: coherence (gap >= delay) 99.1% bus / 98.6% streetcar / 95.2% subway;
> completeness (gap > 0) 99.6% / 99.5% / 95.3%; zero absurd values; 57 mode-months
> checked with none below the stability floor. Pre-registered thresholds were 95%
> coherence and completeness. **Q-1 closed, D-02 holds.**

## D-03 — v1 serves J-01 and J-04 only `ACCEPTED`
**Cites:** P-06, P-03 · **Journeys:** J-01, J-04

Ship pre-trip departure advice and the exploratory segment map. Defer J-02 (at-stop) and
J-03 (mid-trip).

*Why:* both need **no realtime feed**, so they dodge the subway realtime gap (E-D06)
entirely. J-04 is where our differentiation is visible and where trust gets built; J-01 is
where value is delivered. J-02 and J-03 are higher-pain but depend on realtime
infrastructure and a much higher correctness bar.

**Reversed if:** user validation shows the at-stop moment (J-02) is the only one people
will actually open an app for.

## D-04 — Build the engine on subway, but target buses as the product `ACCEPTED`
**Cites:** P-02, P-03 · **Problems:** PR-02, PR-05 · **Evidence:** E-D05, E-D07, E-L08

Develop the segment model against subway data first — clean station names, fixed topology,
trivially derived segments. **But buses are the product**, and we do not ship a
subway-only release.

*Why:* buses carry ~17x the subway's delay burden and the 2h+ commute tail is suburban and
bus-dependent. The subway is a convenient *development substrate*, not the market.

> **Revises an earlier recommendation.** Before the data work, a "subway-only vertical
> slice" was proposed as the first shippable release. E-D05 and E-L08 invalidated that:
> it would have been a demo of the least painful part of the network. The engine still
> starts on subway; the release does not.

**Reversed if:** surface geocoding cannot be pushed meaningfully past 66% (E-D07), making
bus segments too sparse to score honestly.

## D-05 — Verdict first, distribution one level down `ACCEPTED`
**Cites:** P-01, P-06 · **Personas:** U-01, U-03

Primary view gives a single actionable answer. The distribution, confidence and history
live one interaction beneath it.

*Why:* resolves the standing tension between P-01 and P-06. U-03 will not study a chart;
U-01 will not trust a bare number. Layering serves both without averaging them into
something that serves neither.

**Reversed if:** testing shows U-01 does not trust a verdict whose uncertainty is hidden,
even one tap away.

## D-06 — Terminal and yard incidents are modelled separately `ACCEPTED`
**Cites:** P-04 · **Problems:** PR-09 · **Evidence:** E-D03

Incidents logged at terminals and yards are excluded from through-rider segment risk and
modelled as their own class.

*Why:* 20.7% of subway delay-minutes are an artifact of where the log entry gets written.
Including them produces a map that is confidently wrong, which under PR-08 is worse than
having no map.

**Reversed if:** analysis shows terminal incidents do propagate to through-riders in a
measurable way — in which case model the propagation rather than simply re-including them.

## D-07 — Accessibility filters before ranking `ACCEPTED`
**Cites:** P-05 · **Personas:** U-04 · **Evidence:** E-L09

Accessibility constraints reduce the candidate route set before any reliability ranking.
Never a weight, never a post-filter.

*Why:* the failure mode is binary and can strand a rider mid-journey. A blended score
implies a 95%-accessible route is 95% as good; for U-04 it is unusable.

**Reversed if:** never, while U-04 is a target user. Dropping this means dropping U-04 —
which would itself be a decision requiring an entry here.

## D-08 — Validate personas with real riders `OPEN`
**Cites:** P-08 · **Personas:** all

Personas are currently derived from literature and delay data, not interviews. Validate
U-01, U-02 and U-04 with Toronto riders before committing to the v1 information
architecture.

*Why:* U-02's "reroute is not a real option" assumption and U-01's asymmetric-tolerance
assumption are both load-bearing and both unverified.

**Priority:** highest-value open item. Everything in `04-personas.md` is provisional
until this closes.

## D-09 — Stack: Fastify + Prisma/SQLite + React `ACCEPTED`
**Cites:** — (engineering, not UX)

TypeScript throughout. SQLite via Prisma for zero-setup development, migrating to
Postgres when the segment tables demand it. React + Vite, mobile-first.

*Why:* the whole product is consumed on a phone at a bus stop. SQLite keeps local
development frictionless; Prisma makes the Postgres migration mechanical.

**Reversed if:** segment aggregation over multi-year history outgrows SQLite sooner than
expected — likely, and the reason Prisma was chosen over raw SQL.

## D-10 — Incidents attribute to the arriving segment `ACCEPTED`
**Cites:** P-04 · **Problems:** PR-09 · **Evidence:** E-D03

The TTC logs an incident against a single station. It is attributed to the segment
*arriving* at that station in that direction — the approach a through-rider is on when
the delay bites. Records we cannot place are left unattributed rather than guessed at.

*Why:* riders experience delay across a stretch of track, not at a point. Leaving a
record unattributed shows up as missing coverage, which is visible; mis-attributing it is
invisible and wrong (P-03).

Attribution reaches **81.4% of delayed subway incidents**. The remainder is mostly
structural: terminal departures have no approach segment, and those are the turnaround
artifacts D-06 excludes anyway.

**Reversed if:** analysis shows riders attribute delay to where they boarded rather than
where they were stopped.

## D-11 — Score exposure per segment; pool severity across the network `ACCEPTED`
**Cites:** P-01, P-03, P-08 · **Evidence:** E-D10

Segment scores publish **exposure** (gap-minutes and incidents per month). The **severity**
distribution (p50/p90/p95) is computed across the whole network and labelled
`basis: "pooled-network"`, not per segment.

*Why:* reliability has two dimensions and only one of them persists. Split-half testing at
segment level gives rho = 0.68 for exposure but **rho = 0.10 for mean wait, with only 3%
ties** — so severity instability is genuine, not an artifact of a compressed scale. How
*often* a segment costs you time is a property of place; how *long* you wait once it
happens is roughly the same everywhere.

A per-segment p95 would therefore be noise formatted as precision — exactly what P-08
forbids.

> **Revises the engine contract** written in `docs/product/PLAN.md` earlier the same day,
> which specified per-segment percentiles as the headline output. The contract was written
> before the segment-level stability test existed. This is the decision system working as
> intended: the measurement invalidated the design, and the design moved.

**Reversed if:** a larger window, or normalising by service volume, makes per-segment
severity persist. Worth re-testing when the archive extends past 2024.

---

## Open questions

| # | Question | Blocks | Owner |
|---|---|---|---|
| ~~Q-1~~ | ~~Is `Min Gap` recorded reliably enough to build on?~~ | — | **Closed 2026-08-28: yes** |
| Q-2 | Can surface geocoding beat 66%? | D-04 | engineering |
| Q-3 | Do riders want a verdict or the evidence? | D-05 | D-08 |
| Q-5 | Does per-segment severity persist over a longer window? | D-11 | data, later |
| Q-4 | Is J-02 (at-stop) the only moment people open an app? | D-03 | D-08 |
