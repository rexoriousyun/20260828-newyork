# Reliable Transit — a UX case study

**Role:** research, product definition, interaction design, implementation
**Timeframe:** one working session, 2026-08-28
**Status:** engine and exploratory interface built; rider validation outstanding
**Artefacts:** evidence base, problem inventory, principles, personas, journeys, user
flows, system architecture, decision log — all in `docs/`

---

## The brief

> "Transit delays cluster on specific lanes because of usage, maintenance, and
> infrastructure. I want a route map showing the fastest *and* most reliable way from A to
> B, and exposing which lanes are worst."

A good instinct with a testable assumption inside it. So the first work was not design. It
was finding out whether the premise was true.

## 1. Interrogating the premise before designing for it

Toronto publishes every TTC delay incident since 2014. I pulled 163,725 records covering
January 2025 to July 2026 and tested the assumption directly.

**The load-bearing question:** is unreliability a stable property of a place, or noise? If
it is noise, there is nothing to predict and no product. I ranked stations independently
across two periods and correlated the rankings.

> **Spearman rho = 0.78.** Bad places stay bad.

The premise held. The *explanation* did not.

**Stated cause:** maintenance and infrastructure.
**Actual causes:** disorderly patron 9.9%, injured/ill customer 11.7%, unauthorised at
track level 5.2%, security 5.2%. **~32% is passenger and security incidents.** Equipment
is a much thinner slice.

This mattered for design, not just accuracy. Infrastructure wear is opaque to a rider.
Crowding and time-of-day are *legible* — things a person can plan around. The product got
more useful the moment the real cause was known.

## 2. The finding that relocated the whole product

Every public tool reports `Min Delay` — how late the vehicle is. The same dataset carries
`Min Gap`: the headway hole left behind, which is **what the rider actually stands in**.

| | median delay | median gap | ratio |
|---|---|---|---|
| Subway | 5 min | 8 min | 1.38x |
| Bus | 13 min | **26 min** | **1.58x** |

**83.8% of bus incidents carry the bunching signature.** The industry-standard metric
understates bus pain by ~58%, and the correction is sitting unused in public data.

It also settled the target. Subway: 117,924 delay-minutes. **Bus: 2,052,791 — ~17x.** The
subway gets the attention; the buses carry the pain. I had earlier recommended a
subway-first release. The data killed that recommendation, and I recorded the reversal
rather than quietly changing course.

## 3. The trap I nearly shipped

20.7% of subway delay-minutes are attributed to 12 of ~70 stations — and they are
**terminals and yards**. Kipling is not dangerous to ride through. It is where trains turn
around and where the log entry gets written.

A naive "avoid the red stations" map would have been confidently wrong, and every
competing visualisation I reviewed appears to make exactly this mistake. The same artifact
reappeared on the surface network wearing different names: **garages and loops**, nearly
5% of surface delay logged where no rider is ever waiting.

Cheap to get wrong. Invisible once shipped. This is the finding I am most glad the
research surfaced early.

## 4. Building a system, not a pile of opinions

The client asked for a UX-driven project, so decisions needed to survive being questioned
six weeks later. I set up a traceable chain:

```
Evidence (E-*) -> Problem (PR-*) -> Principle (P-*) -> Decision (D-*) -> Implementation
```

Four rules make it work:

1. **No orphan decisions.** Every decision cites a principle; every principle cites
   evidence. A decision with no chain is a preference, and gets labelled one.
2. **Evidence expires.** Each claim records when it was measured.
3. **Every decision names its kill condition.** A decision nobody can imagine reversing is
   usually an unexamined assumption.
4. **Superseded, never deleted.** The reasoning history survives.

Twelve decisions, twelve principles, thirteen pieces of evidence, twelve ranked rider
problems.

## 5. Cutting the personas down

The first pass produced five personas. Three survived.

**U-01, the Deadline Commuter, was not a persona.** A hard arrival time changes how a rider
reads a number; it does not make them a different rider. The segmentation research divides
riders by *regularity*, not by deadline — and the two descriptions were plainly the same
human, since precarious work and unforgiving deadlines travel together in Toronto. Merged
into U-02 as a modifier.

**U-03, the Regional Commuter, had not earned its place.** Its evidence described the same
axis another persona already occupied — having an alternative — without showing a different
need. Demoted to a documented hypothesis with a revisit condition, so it does not get
silently reinvented.

What remained splits on the one axis the research actually supports: **does this rider have
an alternative?**

| | rider | needs |
|---|---|---|
| **U-02** | captive — one route, no car | a **forecast** |
| **U-05** | downtown — can walk | a **comparison** |
| **U-04** | access-constrained — binary failure | a **constraint** |

A persona has to earn its place by producing a different design need, evidenced. Five
personas felt thorough. Three were true.

## 6. The system earning its keep

`D-01` staked the product on segment-level reliability. Before building on it, I tested
whether reliability persists at that granularity — and split the question in two.

| metric | rho | ties |
|---|---|---|
| incident count | 0.762 | 41% |
| total gap-minutes | 0.681 | 7% |
| median gap | 0.361 | 94% |
| **mean gap** | **0.104** | **3%** |

**How often a segment costs you time is predictable. How long you wait once it happens is
not.** Mean gap has only 3% ties, so the near-zero correlation is real, not an artifact of
a compressed scale.

That invalidated the engine contract I had written **that same morning**, which promised
per-segment p50/p90/p95. Publishing those would have been noise formatted as precision.
Severity is now pooled per mode and explicitly labelled `pooled-subway` /
`pooled-surface`; only exposure is segment-specific.

This is the case study's real argument: **the measurement changed the design, and the
system made that cheap instead of embarrassing.**

## 7. Designing for a product that mostly does not know

The uncomfortable result: **86% of bus segments have too little data to score.** Only 3.1%
reach high confidence.

`P-03` says absence of data must never look like good news. The honest rendering of a real
bus route is therefore a checkerboard of known and unknown.

I did not soften it. Unknown segments are **hatched and labelled "no data"** — a different
*kind* of thing, not a low value. A pale colour would have read as "fine".

Whether that honesty builds trust or reads as broken is the single biggest open question,
and it is not answerable from a desk. It goes to riders with the real screen in hand.

## 8. Hiding the machinery without hiding the doubt

The client's principle: *magic is great when it is hidden.* Adopted — the answer is the
product, and sample sizes, windows, filters and pooling rationale wait behind a quiet
"why this number".

But it needed one line drawn, because two things look identical in a mock and are opposites
in the hand:

| Hide until asked | Never hide |
|---|---|
| Sample size, observation window | That a segment has **no data** |
| Which filters were applied | That confidence is **low** |
| Why severity is pooled | That severity is **not segment-specific** |

Hiding *how we know* is good design. Hiding *that we do not know* is a lie — and it is
precisely the failure riders have already learned to expect, since official TTC metrics
"hide more than they reveal". Hiding the method earns trust; hiding the uncertainty spends
it.

## 9. What I would do differently

- **Interview earlier — but not first.** The personas are still literature-derived. Yet
  three of the four questions now blocking validation could only be written *after* there
  was a screen. Building first was right; not scheduling interviews in parallel was not.
- **I let a decision outrun the build.** `D-07` commits to accessibility as a hard routing
  constraint for riders who depend on elevators. Nothing is implemented, and no elevator
  data is ingested. Recorded as a gap rather than quietly carried — but it should not have
  drifted.
- **Two bugs were caught by looking at output, not by tests.** A U-turn pivot mislabelled
  Line 1's direction; pooled severity mixed bus waits into subway numbers. Both passed a
  typechecker and 50 tests. Rendering the thing found them in minutes. A third would have
  shipped silently: GitHub fails Mermaid diagrams without an error, so every diagram is now
  validated against the parser rather than assumed.
- **I designed five user flows without asking the product owner what they wanted.** The
  research was sound and the flows follow from it — but they were derived, not agreed. Two
  drifts from the original brief went unexamined for too long: it asked for **A-to-B
  routing**, which I argued into a forecast on evidence, and it asked twice for a **map**,
  which does not exist. Both may be right calls. Neither was a shared one.

## Outcome

A working reliability engine over public data with no API keys, an exploratory
mobile-first interface, four reproducible audits that can fail the build, and a decision
record explaining every choice and what would reverse it.

Alongside it: an evidence base, a ranked problem inventory, nine principles, three personas,
five journeys, four user flows and a system architecture — each traceable to the
measurement that produced it.

The most valuable output is not the interface. It is knowing **which half of the original
hypothesis was true** — and having the trail to prove it.
