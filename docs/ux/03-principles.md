# Design Principles

Rules that constrain every design decision. Each derives from evidence — none is taste.
If you want to violate one, you must first invalidate the evidence beneath it.

---

## P-01 — Show a distribution, never a point estimate
**From:** E-L03, E-L02, PR-03 · **Serves:** U-01, U-02

Riders already reason in percentiles; the industry standard buffer index uses the 95th.
An average ETA answers a question nobody asked and creates false confidence.

*In practice:* every time is a range with a confidence. "22–38 min, usually 26." Never
"26 min."

## P-02 — Measure the wait, not the vehicle
**From:** E-D09, E-L06, PR-01 · **Serves:** U-01, U-02

`Min Delay` describes the vehicle's problem. `Min Gap` describes the rider's. On buses the
gap is **1.58x** the delay and 83.8% of incidents show the bunching signature.

*In practice:* headway gap is the primary metric everywhere in the product. Vehicle
lateness is diagnostic detail, never the headline.

## P-03 — Absence of data must never look like good news
**From:** E-D06, E-D07, PR-10 · **Serves:** all

We have no subway realtime and only 66% of surface delay is geocodable. Rendering unknown
segments in the same neutral colour as healthy ones actively misleads.

*In practice:* "unknown" is a visually distinct third state, never a shade of "fine."
Coverage is stated wherever a claim is made.

## P-04 — Never present an attribution artifact as rider risk
**From:** E-D03, PR-09 · **Serves:** all

20.7% of subway delay-minutes land on terminals and yards because that is where the log
entry is written, not where riders suffer.

*In practice:* terminal and yard incidents are modelled separately and excluded from
through-rider risk. Any segment score must answer "what happens to someone *riding
through here*," not "what got logged here."

## P-05 — Accessibility is a constraint, not a score
**From:** E-L09, PR-06 · **Serves:** U-04

Elevator failure is binary. A route that is 95% accessible is unusable on the day it is
not, potentially stranding a rider mid-trip.

*In practice:* accessibility filters the route set *before* ranking; it never contributes
a weight to a blended score. When status is unknown we say so rather than assuming.

## P-06 — Answer the decision, do not render a dashboard
**From:** E-L05, PR-07 · **Serves:** U-03, U-02

Riders with alternatives churn because they lack confidence, and they will not study a
visualisation to recover it.

*In practice:* every screen opens with the answer — leave now / wait / go another way.
Evidence sits beneath the answer, available to whoever wants it. Analysis is J-04's job,
not J-01's.

## P-07 — Severity and an alternative, or say nothing
**From:** E-L07, PR-04 · **Serves:** U-02, U-04

A notification that says "there is a delay" transfers anxiety without transferring
agency. Mid-trip, the rider's alternatives have already narrowed.

*In practice:* no alert ships without a severity estimate and at least one concrete
option — including "nothing you can do, it's ~25 minutes." That last one is a valid,
useful answer.

## P-08 — Be falsifiable, because riders already distrust transit numbers
**From:** E-L06, E-D04, PR-08 · **Serves:** all

Riders have learned that official reliability metrics do not describe their morning. We
inherit that scepticism and cannot assert our way out of it.

*In practice:* every number is traceable to its window, sample size and source. We show
where we were wrong. We filter the 65% zero-minute non-events (E-D04) and say that we do.
Where confidence is low we publish a wide range rather than a precise-looking lie.

## P-09 — Hide the machinery; never hide the uncertainty
**From:** PR-08, E-L10 · **Serves:** U-05, U-03, U-02

Magic is best when it is hidden. The rider gets an answer, not a method. Everything behind
it — sample sizes, the observation window, filter lists, percentile bases, why severity is
pooled — stays out of the way **until the rider hits a moment where they need it**, and is
then one tap away, complete and unhedged.

*Why:* the answer is the product. A rider standing at a stop in winter, or deciding
whether to walk, is not reading methodology. And our audience is not analysts — 66.6% of
TTC riders are equity-deserving (E-L10), and an interface that demands interpretation
excludes people before it helps them.

*In practice:* the primary view carries the answer and nothing else. Derivation lives
behind a "why this number" affordance that is visible but quiet. Nothing is deleted;
everything is deferred.

**But there is a line, and it is not negotiable.**

Hiding *how we know* is good design. Hiding *that we do not know* is a lie. These look
similar in a mock and are opposites in the hand:

| Hide until asked | Never hide |
|---|---|
| Sample size, observation window | That a segment has no data (P-03) |
| Which filters were applied | That confidence is low |
| Why severity is pooled, not per-segment | That severity is not segment-specific when a number is shown |
| Persistence statistics, methodology | That a figure is an estimate, not a promise |

The right-hand column is not machinery. It is the claim itself, and a rider who acts on a
number we quietly did not stand behind is worse off than one who saw a hatched bar.

Riders already distrust transit numbers because official metrics "hide more than they
reveal" (PR-08, E-L06). **Hiding the method earns trust; hiding the uncertainty is the
exact failure they have learned to expect.**

---

## Tensions to resolve deliberately

- **P-01 (distributions) vs P-06 (give the answer).** U-01 wants the range; U-03 wants the
  verdict. Resolved by `D-05`: verdict first, distribution one level down — not by
  dropping either.
- **P-03 (admit gaps) vs P-06 (be decisive).** Honesty about coverage must not turn every
  screen into caveats. Resolved by making unknown a *visual* state rather than prose.
- **P-08 (falsifiability) vs simplicity.** Traceability lives in a detail layer, not the
  primary view.
- **P-09 (hide the machinery) vs P-03 and P-08.** Resolved by the table in P-09: method is
  deferred, uncertainty never is. If a design cannot tell those apart, it has not resolved
  the tension — it has picked a side.
