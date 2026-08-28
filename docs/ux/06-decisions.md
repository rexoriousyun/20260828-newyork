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
**Cites:** P-01, P-06, P-09 · **Personas:** U-01, U-03, U-05

Primary view gives a single actionable answer. The distribution, confidence and history
live one interaction beneath it.

*Why:* resolves the standing tension between P-01 and P-06. U-03 will not study a chart;
U-01 will not trust a bare number. Layering serves both without averaging them into
something that serves neither.

> **Sharpened by P-09.** The layering defers the *method*, not the *uncertainty*. A verdict
> may hide its sample size; it may never hide that it is low-confidence. The current detail
> view puts methodology in front of the rider before they have asked — that is a P-09
> violation and is being corrected.

**Reversed if:** testing shows U-01 does not trust a verdict whose method is hidden, even
one tap away. Note this is Q-C in D-08 and is genuinely open.

## D-06 — Terminal and yard incidents are modelled separately `ACCEPTED`
**Cites:** P-04 · **Problems:** PR-09 · **Evidence:** E-D03

Incidents logged at terminals and yards are excluded from through-rider segment risk and
modelled as their own class.

*Why:* 20.7% of subway delay-minutes are an artifact of where the log entry gets written.
Including them produces a map that is confidently wrong, which under PR-08 is worse than
having no map.

**Reversed if:** analysis shows terminal incidents do propagate to through-riders in a
measurable way — in which case model the propagation rather than simply re-including them.

## D-07 — Accessibility filters before ranking `ACCEPTED · IMPLEMENTED`
**Cites:** P-05 · **Personas:** U-04 · **Evidence:** E-L09

Accessibility constraints reduce the candidate route set before any reliability ranking.
Never a weight, never a post-filter.

*Why:* the failure mode is binary and can strand a rider mid-journey. A blended score
implies a 95%-accessible route is 95% as good; for U-04 it is unusable.

> **Implemented 2026-08-28.** Baseline from GTFS `wheelchair_boarding`, live outages parsed
> from the GTFS-RT alerts feed (`E-D17`). A `stepFree` filter marks every segment whose
> endpoint station a step-free rider cannot use; blocked stretches render struck out rather
> than recoloured, because a blocked segment is *unavailable*, not "more unreliable", and
> putting it on the reliability scale would say the wrong thing. The constraint leads the
> detail sheet, above the number.
>
> **`unknown` counts as blocked.** Absence of an alert is not evidence an elevator works,
> and U-04 abandons us the first time we route them somewhere we could not verify.

**Reversed if:** never, while U-04 is a target user. Dropping this means dropping U-04 —
which would itself be a decision requiring an entry here.

## D-08 — Validate personas with real riders `OPEN`
**Cites:** P-08 · **Personas:** all

Personas are derived from literature and delay data, not interviews. Validate before
committing to the v1 information architecture.

**Building M6 changed what this needs to ask.** The original framing was "are these
personas real?" Four questions now block the interface, and three of them could not have
been written before there was something on screen.

### Q-A — Does an honest, mostly-empty map build trust or destroy it? *(highest priority)*
**From:** E-D12 · **Threatens:** P-03, D-05

**86% of bus segments are unknown.** P-03 says absence of data must never read as good
news, so the map renders them hatched — and a real bus route shows as alternating known
and unknown stretches. Two readings, opposite implications:

- The honesty reads as credibility, and directly answers the distrust in PR-08.
- The sparsity reads as a broken product, and the rider leaves before the honesty lands.

We cannot reason our way to the answer. **Show riders the actual Morningside screen and
watch what they do.** If it reads as broken, either the granularity changes (Q-B) or P-03
needs a gentler expression — but P-03 itself is not negotiable.

### Q-B — What is the unit riders actually reason about?
**From:** E-D12 · **Threatens:** D-01

The map currently shows `Morningside Ave at Halfway Ave -> Morningside Ave at Sewells Rd`
— roughly 200 metres, with the road name repeated on both ends. Nobody thinks about their
commute that way, and stop-to-stop granularity is what makes the data look sparse: pooling
the same incidents into corridors (Finch to Sheppard, say) would raise confidence and read
more like how riders describe trips.

But a corridor is not a segment, and D-01 stakes the product on the segment being the
unit. **Ask riders to describe where their trip goes wrong, unprompted, and note the unit
they reach for.** If it is consistently corridors, D-01 needs revising — the stable
signal is real either way, only its resolution changes.

### Q-C — Does "31 min/mo of wait caused" mean anything to a rider?
**From:** D-11 · **Threatens:** D-05, P-06

Exposure is the metric that survived the persistence test, so it is what the product can
honestly rank on. But gap-minutes per month is an analyst's unit. A rider asks "how often
does this go wrong, and how bad is it" — and our honest answer is split awkwardly across
two numbers with different bases: exposure is segment-specific, severity is pooled.

**Do not lead the witness.** Show the segment detail and ask what they take from it. If
the unit does not land, the underlying model still holds — only the presentation moves.

### Q-D — Is compass direction the right handle?
**From:** M6 build

The UI offers N/S/E/W because that is what the delay data records. Riders say "towards
Finch" or "going downtown". GTFS carries trip headsigns, so this is fixable — but only
worth fixing if it is actually a barrier.

### Still open from the original framing
- **U-02's core assumption is untested:** that rerouting is often not a real option in the
  suburbs. It drives the whole "permission to stop refreshing" design in J-02.
- **U-01's asymmetric tolerance is untested:** that a missed pickup costs far more than a
  wasted ten minutes.

**Priority:** Q-A first, and with the real screen in hand rather than a description of it.
Everything in `04-personas.md` stays provisional until this closes.

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

## D-12 — Garages and loops are excluded, and coverage is reported two ways `ACCEPTED`
**Cites:** P-03, P-04, P-08 · **Evidence:** E-D11 · **Extends:** D-06

Surface locations are classified before geocoding. Garages and divisions are non-revenue
and excluded outright; loops are turnarounds and flagged. Coverage is published as both a
**raw** rate (share of all surface delay placed) and an **addressable** rate (share of
rider-facing delay placed).

*Why:* garages are the surface equivalent of subway yards, and loops of subway terminals —
the same attribution artifact E-D03 identified, wearing different names. Folding them into
either "covered" or "failed" misleads in opposite directions. Two rates with the exclusion
declared is the only honest presentation.

**Reversed if:** riders turn out to experience meaningful waiting at loops, which would
make loops ordinary segments rather than turnarounds.

## D-13 — Build a forecast, not a router `SUPERSEDED by D-14`
**Cites:** P-06, P-07, P-01 · **Problems:** PR-01, PR-04 · **Evidence:** E-L12, E-L13

The product's primary job is to tell a rider **whether their trip is viable, when to
leave, and when to give up** — not to choose between alternatives. Routing is a later,
narrower feature, most useful in the GO corridors where alternatives actually exist.

*Why:* Toronto has almost no network redundancy. The TTC's own CEO calls the system
"binary": when a line goes down there is one option, shuttle buses, and sometimes not even
those. New York has express and local tracks, parallel lines and 24-hour service, so a
reliability tool there answers *"which of my options is best?"*. Asking that question in
Toronto usually has no answer.

This is the sharpest way the two cities differ, and it changes what the product *is*.
A reliability-aware router is a New York product. Toronto needs a reliability-aware
forecast — which is also, conveniently, what our data can actually support: exposure
persists, severity does not (E-D10), and a forecast tolerates that asymmetry where a
router does not.

> **Reframes the original brief**, which asked for a route map showing the fastest and most
> reliable way from A to B. The A-to-B framing imports an assumption from cities with
> redundancy. The underlying goal — expose which lanes are unreliable — is unchanged and is
> better served by a forecast.

> **Downtown is the exception.** The core has 321 stops across 26 routes in the
> King/Queen/Dundas box against 131 across 17 in an equivalent Scarborough box, plus
> walking and bike share. For U-05, "which option" is a real question and comparison is
> worth building. Treat it as a downtown feature, not a citywide one — building it
> citywide would import the New York assumption through the back door.

**Reversed if:** the Ontario Line opens and gives downtown genuine parallel capacity, or GO
coverage expands enough that most riders have a real second option.

> **Superseded 2026-08-28 by D-14, on the product owner's direction.** The redundancy
> evidence (E-L12) stands and still shapes *how* routing should behave. What was wrong was
> the conclusion drawn from it: I read "Toronto has few alternatives" as "do not build a
> router", when the brief had twice asked for A-to-B. Low redundancy is an argument about
> what a router should *say*, not a reason to withhold one. Recorded rather than rewritten,
> because the reasoning error is worth keeping visible.

## D-14 — A map-first trip planner, with reliability as the differentiator `ACCEPTED`
**Cites:** P-01, P-06, P-09 · **Problems:** PR-01, PR-02, PR-03, PR-04 · **Evidence:** E-L12, E-D15
**Supersedes:** D-13

The product is **a transit app you pull out to get from A to B with fewer surprises** —
map-first, in the shape people already know from Google Maps. Reliability is not the
product; it is the layer underneath that makes the answers better than everyone else's.

Three things it must do that mainstream planners do not:

1. **Route on reliability, not just schedule.** Rank itineraries by what actually happens,
   using the segment exposure model. Mainstream planners route on the timetable (E-L02).
2. **Forecast rather than promise.** Departure advice with a confidence, not a single ETA
   (P-01). The forecast is a *feature the app depends on*, not the app.
3. **Absorb today.** Detours, bypasses, elevator outages, planned closures and shuttles,
   and event crowding change the answer on the day, and the feed already carries most of it
   (E-D15).

*Why this framing and not the earlier one:* "fewer surprises" is the promise, and a
surprise is only avoidable if the app is in your hand at the moment you choose a route. A
forecast screen nobody opens prevents nothing. The map is not decoration — it is the
retrieval mechanism.

**What low redundancy still changes.** E-L12 is not discarded. Where there is no real
alternative, the honest output is not a ranked list of three similar itineraries; it is one
route plus *when to leave* and *when to give up*. Where there is choice — downtown,
GO corridors — comparison is genuine. **The router adapts its answer to how much choice
actually exists**, rather than pretending every trip is a menu.

**Reversed if:** riders turn out to open the app only at the stop, in which case the
at-stop view (J-02) becomes the product and routing is secondary.


## D-15 — Mobile first `ACCEPTED`
**Cites:** P-06 · **Personas:** U-02, U-05 · **Source:** product owner direction, 2026-08-28

The phone is the target, not a breakpoint. Controls float over the map rather than spending
a header; the sheet sits in the thumb zone; every value must be legible one-handed, outdoors,
in daylight.

*Why:* U-02 is standing at a stop in winter and U-05 is deciding whether to walk. Neither is
at a desk. Contrast is therefore a gate rather than a preference.

**Reversed if:** usage shows the exploratory journey (J-04) is overwhelmingly desktop, which
would argue for a second, denser layout rather than for abandoning this one.

## D-16 — Monotone for most; colour reserved for key information `ACCEPTED`
**Cites:** P-03, P-06 · **Evidence:** E-D14 · **Source:** product owner direction, 2026-08-28

The basemap is desaturated server-side. Greyscale is map structure and is never borrowed to
encode data. Colour is spent only where it carries meaning: the reliability scale, and the
transit stops a transit map cannot do without.

*Why:* a vendor basemap paints roads orange and parks green, which competes with the one
encoding that matters. Spending colour on everything marks nothing.

**Reversed if:** riders cannot locate route data against the desaturated ground, or a second
encoded dimension becomes essential and cannot be carried by weight, pattern or position.

## D-17 — Start simple `ACCEPTED`
**Cites:** P-01, P-06 · **Evidence:** E-D10 · **Source:** product owner direction, 2026-08-28

One continuous scale plus one exception (unknown), not five discrete bands. Complexity in the
data is not a licence for complexity on screen.

*Why:* it was also forced by measurement — four states could not clear all-pairs colour
separation, so the simpler encoding is the accessible one as well as the calmer one.

**Reversed if:** riders demonstrably need finer gradation than a continuous ramp provides,
which Q-C would surface.

## D-18 — Look trustworthy; nothing casual or decorative `ACCEPTED`
**Cites:** P-08, P-09 · **Problems:** PR-08 · **Source:** product owner direction, 2026-08-28

Tabular figures, one step of emphasis, a single elevation, modest radii, no gradients or
glows used as ornament. The product should read as infrastructure rather than as a brand.

*Why:* riders already distrust transit numbers because official metrics "hide more than they
reveal" (E-L06). A playful interface spends credibility the product has not earned yet.

**Reversed if:** never, while rebuilding trust is the product's central problem. Dropping this
means dropping PR-08, which would itself require an entry here.

---

## Open questions

| # | Question | Blocks | Owner |
|---|---|---|---|
| ~~Q-1~~ | ~~Is `Min Gap` recorded reliably enough to build on?~~ | — | **Closed 2026-08-28: yes** |
| ~~Q-2~~ | ~~Can surface geocoding beat 66%?~~ | — | **Closed 2026-08-28: yes, 76.6%** |
| Q-3 | Do riders want a verdict or the evidence? | D-05 | D-08 |
| Q-5 | Does per-segment severity persist over a longer window? | D-11 | data, later |
| Q-4 | Is J-02 (at-stop) the only moment people open an app? | D-03 | D-08 |
| Q-A | Does a mostly-unknown map build trust or read as broken? | P-03, D-05 | D-08 |
| Q-B | Is the segment or the corridor the rider's unit? | D-01 | D-08 |
| Q-C | Does gap-minutes-per-month mean anything to a rider? | D-05 | D-08 |
