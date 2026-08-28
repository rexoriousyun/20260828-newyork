# Personas

**Status: PROVISIONAL.** Derived from published research (E-L04, E-L05, E-L08, E-L09) and
our own delay analysis — *not yet from interviews with Toronto riders*. Validating them
is `D-08`. Treat as hypotheses with evidence behind them, not as findings.

Each persona names an **anti-goal**: the thing we must not do to them even though it
would be easy.

---

## U-01 — The Deadline Commuter *(primary)*
**"I don't need to be fast. I need to not be late."**

Fixed arrival obligation — a shift start, a daycare pickup with late fees, a clinic
appointment. Rides the same trip most days, so they already know it is unreliable; what
they lack is a way to reason about *how much* to over-leave.

- **Optimises:** the 95th percentile, not the mean (E-L03)
- **Problems:** PR-01, PR-03, PR-05
- **Currently does:** leaves 15–20 minutes early every day as blanket insurance, absorbing
  the cost of the worst case on every good day
- **Needs from us:** "leave by 8:12 to make a 9:00 with 90% confidence" — and the honest
  cost of the buffer
- **Abandons us if:** we are wrong once in the late-arrival direction. Their tolerance is
  asymmetric — a wasted 10 minutes is an annoyance, a missed pickup is a penalty
- **Anti-goal:** never show them a single confident ETA. It is the number that gets them
  in trouble

## U-02 — The Outer-Suburb Bus Rider *(primary)*
**"There's one route. If it doesn't come, I'm not going."**

Scarborough, North York, Etobicoke. Bus-dependent, often feeding a subway. No parallel
route within walking distance, so "reroute" is frequently not a real option. This is
where the delay burden actually sits — 52 Lawrence West, 102 Markham Road,
86 Scarborough (E-D05) — and where the 2h+ commute tail lives (E-L08).

- **Optimises:** knowing whether the trip is viable at all, and how bad the wait will be
- **Problems:** PR-01, PR-04, PR-05, PR-10
- **Currently does:** stands at the stop with no information, or gives up and drives if
  a car is available in the household
- **Needs from us:** an honest wait distribution and, when there is no alternative,
  permission to stop refreshing — "it's a 25-minute wait, go back inside"
- **Abandons us if:** we only cover the subway, or we suggest alternatives that do not
  exist in their neighbourhood
- **Anti-goal:** never offer a reroute that assumes downtown-density options. Suggesting
  a 20-minute walk to a parallel route is a downtown answer to a suburban question

## U-03 — The Optionality Rider *(secondary — the growth case)*
**"I'll take the subway if I trust it. Otherwise I'm driving."**

Has a car or affords rideshare. Chooses per-trip. Documented as actively churning away
from transit, and specifically because of **uncertainty rather than average slowness**
(E-L05).

- **Optimises:** avoiding the bad outcome; will pay money to eliminate variance
- **Problems:** PR-07, PR-03, PR-08
- **Currently does:** defaults to driving, because the downside is bounded
- **Needs from us:** a fast, trustworthy read on whether *today, this trip* is a good bet
- **Abandons us if:** we feel like a dashboard. They will not study a map — they want a
  verdict in under five seconds
- **Anti-goal:** never bury the answer behind exploration. Analysis is for U-04 and for
  us, not for them

## U-04 — The Access-Constrained Rider *(primary for correctness)*
**"A broken elevator doesn't delay my trip. It ends it."**

Depends on elevators, or cannot stand for long, or travels with a mobility device. Only
55 of 75 stations are fully accessible (E-L09). Their failure mode is **binary**: a
station that is 95% accessible is inaccessible on the day the elevator is out, potentially
stranding them mid-journey.

- **Optimises:** certainty and the existence of a fallback, over speed entirely
- **Problems:** PR-06, PR-04, PR-10
- **Currently does:** plans manually and conservatively, avoids unfamiliar routes,
  frequently abandons trips
- **Needs from us:** accessibility as a **hard routing constraint**, never a filter
  applied afterwards, plus explicit honesty when we do not know an elevator's status
- **Abandons us if:** we route them through a station we cannot verify is accessible.
  Once.
- **Anti-goal:** never blend accessibility into a composite "reliability score." It is a
  constraint, not a weighting

---

## Who we are not building for (yet)

- **Tourists and one-off riders.** Optimise for raw travel time (E-L04), have no route
  priors, and get no value from historical reliability. Well served by Google Maps.
- **Transit planners and TTC staff.** Would want our segment layer, but the product
  shape is entirely different. A plausible later market; not a v1 user.

## What the personas jointly imply

U-01 and U-02 need **distributions**. U-03 needs a **verdict**. U-04 needs a
**constraint**. The same reliability model serves all three, but the *presentation*
diverges sharply — which is `D-05`.
