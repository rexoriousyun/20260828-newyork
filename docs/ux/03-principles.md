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

---

## Tensions to resolve deliberately

- **P-01 (distributions) vs P-06 (give the answer).** U-01 wants the range; U-03 wants the
  verdict. Resolved by `D-05`: verdict first, distribution one level down — not by
  dropping either.
- **P-03 (admit gaps) vs P-06 (be decisive).** Honesty about coverage must not turn every
  screen into caveats. Resolved by making unknown a *visual* state rather than prose.
- **P-08 (falsifiability) vs simplicity.** Traceability lives in a detail layer, not the
  primary view.
