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

## D-19 — Weight evidence by recency; decay, don't truncate `ACCEPTED`
**Cites:** P-08, P-01 · **Evidence:** E-D18 · **Revises:** D-11

Exposure is computed from **recency-weighted** incidents with a **three-month half-life**,
normalised by the integral of the decay curve so the published figure stays an honest
per-month rate. Confidence is judged on the weighted sample, not a raw count.

*Why:* the network is not stationary. 35.9% of segments changed by 2x or more between the
archive's halves, and seventeen months of history predicts the near future *worse* than six
(E-D18). Decay beat every flat window in a holdout test.

**Decay rather than truncation.** A hard cutoff throws away the only evidence thin segments
have; decay keeps it and discounts it. That matters when 86% of bus segments are already
short of data.

**Recency is measured from the data's edge, not the wall clock.** The delay feed refreshes
monthly, so "now" is up to a month stale, and using the clock would silently discount the
newest month we actually have.

> **This made the product claim less, not more.** Scorable segments fell from 2,703 to
> 1,167 and 52 Lawrence West from 25 stretches to 7 — after recalibrating the confidence
> bar, not before. The evidence was always this thin; the flat average was hiding it. It
> sharpens Q-A considerably: the map is now emptier than the one that question was written
> about.

**Reversed if:** a longer holdout shows the three-month half-life is overfit to this
particular two-month window, which is worth re-testing as the archive grows.

---

## D-20 — The map keeps the screen; the answer peeks `ACCEPTED · IMPLEMENTED`
**Cites:** P-09, D-14, D-15 · **Problems:** PR-01, PR-04 · **Evidence:** E-L12

Results arrive as a list — where there is real choice, comparison is the point. The moment a
rider picks one, the sheet folds to a **peek**: the chosen answer stays, the alternatives go
behind a labelled handle ("2 other ways"), and the map takes the rest of the screen.

*Why:* the first build gave the map 232px of an 844px phone. D-14 calls the map "the retrieval
mechanism", and a map that small retrieves nothing — a rider cannot see where the route goes,
which is the one thing a drawn route is for. Vertical space is zero-sum on a phone, so the
comparison has to yield once it has been used.

The fit is **measured from the live layout**, not from constants: the topbar and sheet both
change height, and the hardcoded inset that preceded this drew half the route underneath the
sheet.

**Reversed if:** riders re-open the list on most trips, which would mean the choice is not
settled by picking and the list should stay.


## D-21 — Rider names, not GTFS names `ACCEPTED · IMPLEMENTED`
**Cites:** P-09, D-18 · **Problems:** PR-02

Search and the step list show the place, not the record: "Sherbourne Station", not
"Sherbourne Station - Eastbound Platform"; "Jane St at Eglinton Ave West", not the same with
"North Side" appended. Results are deduplicated on that name, exact-prefix matches rank first,
and station codes from the incident feed ("BLOOR-YONGE") are cased back for display.

*Why:* raw GTFS filled the top eight hits with the same corner listed once per direction and
once per platform, and led with the wrong place — searching "Sherbourne" put a stop on The
Esplanade above Sherbourne Station. The suffixes answer a question nobody asks while choosing
a destination.

**Scoring still keys on the raw name.** The segment index was built from it, and a prettier
string at that boundary would silently miss every lookup — the same class of bug that held
journey coverage at 7.7% until it was found.

**Search offers only stops a rider can board from.** GTFS carries a parent node per station
with a clean name and no departures; deduplicating on the display name made that node win,
and picking it returned "no journey found" for a trip that plans fine.


## D-22 — Waiting is a step `ACCEPTED · IMPLEMENTED`
**Cites:** P-09, D-02 · **Problems:** PR-01, PR-03

The step-by-step list shows the gap between arriving and the next departure as its own row —
"Wait at Eglinton Ave West at Jane St · 5 min" — recessed, and without a clock time, so it
reads as the gap it is rather than an instruction.

*Why:* `Min Gap` is the metric the whole product is built on (D-02). Folding the wait into the
adjacent leg would hide the one cost a rider actually feels, in the one screen that lists what
happens to them minute by minute.


## D-23 — Colour on this app means risk, and nothing else `ACCEPTED · IMPLEMENTED`
**Cites:** P-03, D-16, D-18

Two corrections fell out of building the trip view:

- **Disclosures are monotone.** "Why this number?" and "Step by step" were accent blue. Next
  to a green-to-red scale, a blue link is a second colour channel competing for the same
  attention and teaches a rider that colour marks *affordance*. Underline carries "tappable";
  blue is now focus rings only.
- **Walking takes no colour from the scale.** A walk leg was drawn in the scale's green, which
  claims "reliable" about a footpath the model has never measured. It is now a dark neutral
  dash (`--walk`), off the scale entirely.

The second one bends the rule that greyscale belongs to the basemap alone. The boundary: trip
*geometry* may take ink; a *data state* may not. `unknown` stays on the scale, dashed and
thinned, because it is a claim about measurement — walking is not.

---

## D-24 — Work backwards from the deadline `ACCEPTED · IMPLEMENTED`
**Cites:** P-01, P-09 · **Journeys:** J-01 · **Problems:** PR-01, PR-03, PR-05 · **Evidence:** E-L03

"Arrive by" is the default, not "leave at". The rider this is built for knows their arrival
time and not their departure time — a shift, a clinic slot, a daycare that charges by the
minute. A planner that asks for a departure time asks them to solve the problem before it
will answer it.

The planner searches backwards: earliest arrival is monotone in departure time, so the
latest departure that still makes the deadline is found by bisection over the existing
Connection Scan. Eleven probes, ~50ms warm.

**The answer is a departure time and both outcomes**, never one number:

> **Leave 08:33** — arrives 08:57, 2 min to spare
> About **1 morning in 181** this runs long — you would arrive 09:21.
> Leaving **07:37** covers that — at 57 min earlier every day.

J-01's named failure is a single confident ETA; for a rider with a penalty attached to being
late, that is the number that gets them in trouble. Each option in the list is also scored
against the deadline directly — "2 min spare", "16 min late" — because arrival time alone
does not answer the question being asked.

**What the model does not cover, stated on screen.** The reliability layer measures *logged*
TTC disruptions, not whether an undisrupted bus keeps its timetable. So the advice is never
phrased as a percentile of arrival time: a model that sees only large events puts the 90th
percentile at the scheduled time and tells a rider with a deadline to leave with no buffer at
all — the failure case dressed as statistics. The footer says so in one line rather than
deferring it.

### The buffer is priced, never prescribed

> **Reversed during implementation, and the first attempt is left here on purpose.**
> The first build had a threshold: recommend the earlier departure above roughly one
> disruption in two hundred trips. It shipped advice no honest person would give — *leave 58
> minutes earlier every morning* to cover something that happens twice a year. Rewriting it
> as expected value fails the other way: the expected cost of a disruption is a fraction of a
> minute, so no buffer is ever "worth it".
>
> Neither is bad arithmetic. **The recommendation is the wrong act.** What a buffer is worth
> depends on what being late costs *this* rider, which ranges from an annoyance to a missed
> shift and a warning (U-02), and we do not know which. We know the rate and the price; they
> know the penalty. So the advice states both numbers and stops — which is what U-02 needs
> from us: an honest number and permission to act on it, not an instruction.

The tail percentile the covered departure buys against is pre-registered in
`src/domain/departure.ts`, not argued here, so it cannot be renegotiated after seeing a
number. A rider with a hard deadline plans by the tail (E-L03), so "covered" means covered on
all but the worst tenth of bad mornings, not on the median one.

**Reversed if:** riders read the two-outcome answer as hedging and want to be told what to do,
which would be a real finding about P-01 and not just about this screen.


## D-25 — The trip form folds once the trip is stated `ACCEPTED · IMPLEMENTED`
**Cites:** D-15, D-20 · **Problems:** PR-04

Origin, destination and time are one card, and once a plan lands it collapses to a single
summary line that taps back open.

*Why:* three input rows is 195px of an 844px phone, and adding the time control for D-24 took
that space directly from the map. D-20 already established the map cannot do its job through a
slot. A form that has been filled in is reference, not input — it earns one line, not three.

Red is this app's single "this costs you" colour: the scale's top end and a missed deadline
share it deliberately, because to a rider scanning three options they mean the same thing.

---

## D-26 — Say which part of the trip, not just how much `ACCEPTED · IMPLEMENTED`
**Cites:** P-03, P-09 · **Journeys:** J-01, J-04 · **Problems:** PR-02, PR-05 · **Evidence:** E-D12

Before this, the drawn route was the only thing that said *where* the risk was, and nothing
on screen said what its colours meant. Three changes:

1. **Every ride leg carries its own rate** in the step list — "Goes wrong 1 in 486", or "Not
   enough data on this stretch". Variance compounds across transfers on a long trip (PR-05),
   so which leg is fragile is a different question from how much the trip carries. The legs
   compose into the trip figure by the same formula, so the two screens cannot disagree:
   1 in 486 with 1 in 382 is exactly the 1 in 214 on the card, and there is a test asserting it.
2. **A one-line key under the map**, listing only the states actually drawn. A legend is
   machinery and P-09 defers machinery — but an undecoded colour is not hidden method, it is
   a claim the rider cannot read. Walking is deliberately left out: of the three states it is
   the one readable from position alone, and three entries wrapped to two lines.
3. **Unmeasured stretches of a planned trip are drawn as unknown** — see below.

### The defect this uncovered

> **A planned trip drew its unmeasured stretches in the most reliable colour**, from M9 until
> now. The journey features never carried `confidence`, so the map's colour ramp coalesced a
> missing exposure to zero and painted it at the green end. On one Jane–Union itinerary that
> was 8 of 18 ride segments rendered as "as good as it gets".
>
> This is the exact failure P-03 exists to forbid, and neither the typecheck nor the tests
> could see it — the expression was valid and the data was correct. It was found by adding
> the per-leg numbers and noticing a leg reading "not enough data" under a solid green line.
> Journey rides now split into a known layer and a dashed unknown layer, the same two kinds
> the explore map uses, so the encoding a rider learns in one view holds in the other.

### Dominance is a comparison with the runner-up, not with the total

> **Reversed during implementation.** "Which leg carries the risk" was first decided by the
> leg's share of the trip's total, at 50%. On a two-leg trip with equal legs each carries
> just over half the total, so the rule fired on a perfectly even split and pinned the rider
> to an arbitrary half of their journey. A unit test written before the numbers were looked
> at caught it.
>
> The rule is now `WORST_DOMINANCE = 2`, pre-registered in `src/domain/itinerary.ts`: a leg
> or a stretch is named only when it carries twice the risk of the next one. It fires far
> less often, which is the honest outcome — on most Toronto trips the risk really is spread.
> The same rule replaced the equivalent threshold on the results card, and the decision now
> happens once on the server rather than twice with two different constants.

---

## D-27 — Condition on time of day, and let the rider see the other figure `ACCEPTED · IMPLEMENTED`
**Cites:** P-01, P-03, P-09 · **Journeys:** J-01 · **Problems:** PR-01, PR-08 · **Evidence:** E-D20, E-D18

Every rate the app showed was pooled across the service day, so an 08:30 departure was quoted
a number that included 23:00 running. E-D20 measured it: the variation is real and persists
(rho = 0.406), and it misstates a morning commute by around 20%.

**One toggle, defaulted to the rider's own travel window.** "6 to 9am" or "All day". It
governs the numbers *and* the colours on the map, because a route coloured on one basis
beside a rate written for another is worse than either alone. The all-day figure stays
because it is the right thing to *compare* against — it is the same number for the route at
every hour — but it is not the one to quote by default.

The trip form now defaults to the current time rather than a hardcoded morning peak, so a
rider who opens the app gets figures conditioned on when they are actually travelling.

**Conditioned where the evidence reaches, pooled everywhere else, and the mix is stated.**
Only about a third of scorable segments carry enough exposure in a band (E-D20), so the band
view substitutes the all-day figure for the rest. Dropping those stretches instead would
quietly shorten the trip and make it look safer. The share that is genuinely conditioned is
reported on screen — a rider told "at this time" deserves to know how much of it is (P-09).

**Both sides of the ratio are sliced the same way.** Peak-hour incidents over all-day trips
would understate peak by roughly the factor peak service exceeds the daily mean, and that
error is most of why the intuition "peak is much worse" does not survive measurement.

**The map's band figure is rescaled to the all-day trip volume** — "if the whole month ran at
this band's rate" — so it lands on the same ramp. Raw band minutes are smaller merely because
a band is shorter, and every stretch would slide toward the reliable end for the wrong reason.

**The toggle only appears when there is something to switch to.** On a trip where no stretch
can be conditioned there is no second view, and a control with one working setting is a
promise the data cannot keep.

### Two defects this surfaced

> **The planner refused trips that exist.** GTFS runs a service day past midnight — this
> feed's weekday service spans 03:28 to 30:35, meaning 06:35 the next morning. Comparing a
> wall-clock 01:45 against that window directly, the planner reported "no journey" for a
> 01:14 departure sitting in its own data. Found only because defaulting the time control to
> *now* ran the app at 01:34. `inServiceDay` now places a wall-clock time in the service day
> the schedule uses.
>
> **And a claim made here about Blue Night was wrong — corrected 2026-08-29.** This decision
> originally said the overnight hours were missing because Blue Night runs on a GTFS service
> id we had not ingested. That was asserted from a service window printed with hours wrapped
> modulo 24, which made 30:35 read as 06:35 and looked like a gap. **All 35 Blue Night routes
> (300–396) are in the weekday service already**, and every wall-clock hour is covered once
> the service-day shift is applied. The "we do not have Blue Night" message was therefore
> false, and is gone.
>
> A real defect remains, and it is narrower: a request to arrive between about **03:30 and
> 06:00** is read as this service day rather than the previous one still running, so the
> planner searches a window with almost no service and finds nothing. Both readings are
> valid in those hours and only one is tried. This is exactly U-02's shift-start window.

**Reversed if:** riders find two numbers for one trip confusing rather than clarifying, in
which case the band figure stands alone and the all-day one moves behind "why this number".

---

## D-28 — Compare every trip with a typical one of its length `ACCEPTED · IMPLEMENTED`
**Cites:** P-01, P-03, P-09 · **Problems:** PR-02, PR-08 · **Evidence:** E-D21 · **Answers:** Q-C

"Goes wrong 1 trip in 197" is an analyst's number. Beside it now sits a verdict and the
figure behind it: *"Safer than most trips this long — typically 1 in 139."* The ranking makes
it a judgement; the reference figure keeps the judgement checkable rather than asking the
rider to take our word for it.

This is the direct answer to Q-C, which has been open since D-11 and asks whether our units
mean anything to a rider. It does not close the question — only riders can — but it removes
the version of the problem we could fix ourselves.

**The reference class is trips of similar length.** A typical 90-minute trip goes wrong about
twelve times as often as a typical 15-minute one (E-D21), so ranking them together would tell
a rider that long trips are badly run rather than anything about the routes they chose.

**Sampled offline, per band as well as all-day.** `npm run benchmark` writes a table the API
loads at startup, so a plan request never pays for it. Band references are kept separate:
ranking a 5pm trip's pm-peak figure against a reference sampled at 8am would compare two
different measurements, which is the error D-27's toggle exists to avoid.

**Both sides must be measured to the same standard.** A trip covered on a fifth of its length
looks safe because most of it was never checked. The reference holds only trips at coverage
≥ 0.5, and only trips at that coverage are ranked — the same bar the interface already uses
to call coverage thin, so a trip that earns a comparison is exactly a trip we do not caveat.

**A verdict needs rank and magnitude.** Comparable trips cluster tightly, so a trip 15%
riskier than the median can sit below 86% of its class. Both must clear a bar or the answer
is "about typical" — see E-D21 for why rank alone would have us overselling.

### What the reference class is, and is not

> It approximates trips people take, not trips that exist. There is no ridership data, so
> stops are drawn in proportion to the service that runs there — the TTC puts buses where
> people are. It is a proxy, and the wording on screen says "trips this long" rather than
> claiming to know what is typical for a person.
>
> **The first two attempts were both wrong, and both are recorded in E-D21**: uniform stop
> sampling ranked an ordinary downtown hop below 99% of its class, and an unfiltered
> reference with median coverage 0.23 ranked every real trip in the worst tenth. Neither was
> a bug in the arithmetic. Both were the reference class quietly answering a different
> question from the one on screen.

**Reversed if:** riders read the comparison as a score to optimise rather than context for a
number, which would make it a game about routes rather than information about them.

---

## D-29 — Today is stated, never estimated `ACCEPTED · IMPLEMENTED`
**Cites:** P-03, P-09 · **Journeys:** J-01 · **Problems:** PR-04, PR-08 · **Evidence:** E-D15

The reliability figures are a record of normal days. When the TTC has flagged a route on the
rider's way, today is not one, and the number is quietly wrong in a direction they cannot
see. Every trip now carries what the feed says about it:

> **TODAY** — checked 3 hours ago
> **No service on part of the 510** — due to the CNE.
> *The figures below are from normal days and do not include this.*

**We say what is happening and stop.** The feed says a route is on detour; it does not say by
how many minutes, and no amount of history tells us what today's blocked track adds. A
plausible number here would be the most trusted figure on the screen and the least earned —
exactly what P-03 exists to prevent. Where a disruption actually stops service, the planner
instead offers a way that does not use those routes, because an alternative is something we
can produce honestly and a delay estimate is not.

**Ranking is left alone.** We know a flagged route is not running normally; we do not know
whether the rider's own stretch is affected. Demoting on that would be deciding for them with
a number we do not have — the same call D-24 makes about the departure buffer.

**One event, not one alert per route.** A single security incident at Scarborough Centre
arrived as **18 separate alerts**, identical but for the route name. E-D15 predicted this;
alerts whose text matches once the route prefix is stripped are now collapsed into one event.
Eighteen warnings for one incident would bury the one that matters.

**An unrecognised alert is a notice, not a disruption.** The feed carries real public-service
announcements — "Have proof of payment ready for inspection", attached to eight routes at
once. The kind is read from the description text because the TTC populates every alert with
`UNKNOWN_EFFECT`, and anything unmatched is treated as a notice. The cost of that direction
is a missed alert; the cost of the other is an app that cries wolf, which is how riders learn
to stop reading warnings (PR-08).

**Silence is a claim, so it is qualified.** The feed carries no `active_period` — an alert's
presence in the latest snapshot is the only evidence it is live. Past twelve hours the app
says it could not check, rather than showing nothing and letting that read as "nothing is
wrong today". Even when fresh, the block carries its own age.

**Reversed if:** riders act on the detour notice as though it carried a time cost we implied,
which would mean the wording is doing the estimating we refused to do in the data.

---

## Open questions

| # | Question | Blocks | Owner |
|---|---|---|---|
| ~~Q-1~~ | ~~Is `Min Gap` recorded reliably enough to build on?~~ | — | **Closed 2026-08-28: yes** |
| ~~Q-2~~ | ~~Can surface geocoding beat 66%?~~ | — | **Closed 2026-08-28: yes, 76.6%** |
| Q-3 | Do riders want a verdict or the evidence? | D-05 | D-08 |
| Q-5 | Does per-segment severity persist over a longer window? | D-11 | data, later |
| Q-7 | Is a 3-month half-life overfit to one holdout window? | D-19 | data, later |
| Q-4 | Is J-02 (at-stop) the only moment people open an app? | D-03 | D-08 |
| Q-A | Does a mostly-unknown map build trust or read as broken? | P-03, D-05 | D-08 |
| Q-B | Is the segment or the corridor the rider's unit? | D-01 | D-08 |
| Q-C | Does gap-minutes-per-month mean anything to a rider? | D-05 | D-08 · partly addressed by D-28 |
