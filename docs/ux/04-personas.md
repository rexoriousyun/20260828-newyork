# Personas

**Status: PROVISIONAL.** Derived from published research and our own delay analysis —
*not yet from interviews with Toronto riders*. Validating them is `D-08`. Treat as
hypotheses with evidence behind them, not as findings.

Each persona names an **anti-goal**: the thing we must not do to them even though it would
be easy.

---

## Four realities that shape every persona

These are not attributes of one rider. They are the conditions all of them ride in, and
they are specific to Toronto.

**1. The modal TTC rider is not a downtown professional.**
**66.6% of riders are equity-deserving** (E-L10). Scarborough's transit access score is
**20.97 against 102.8** in affluent neighbourhoods. Riders in the inner suburbs are
disproportionately newcomers, racialized, in precarious work, and without a car. Lower-income
riders also **pay more per ride**, because they cannot front a monthly pass.

*Consequence for us:* we are building an app, which assumes a smartphone, a data plan, and
tolerance for an analytics interface. Every one of those is a barrier for part of our
actual audience.

**2. Waiting is a physical risk for a third of the year.**
Toronto plans **100 heated shelter kits over seven years** (E-L11). Riders have been
stranded at stops for hours in storms. Our own data puts ice and snow incidents at **68.8
minutes average** against a 7.8-minute mean.

*Consequence for us:* "your bus is 26 minutes away" is information in July and a safety
decision in January. Same number, different stakes.

**3. There is usually no second option — except downtown.**
The TTC's own CEO calls the system **"binary"** (E-L12). No express tracks, no parallel
downtown line, weekend closures sometimes with no shuttle at all.

The core is the exception: **321 stops across 26 routes** in the King/Queen/Dundas box
against 131 across 17 in an equivalent Scarborough box, plus walking and bike share. U-05
has choices; U-02 does not.

*Consequence for us:* this is where the New York analogy breaks, and it is the most
important difference. Toronto is like New York in density, commute length and transit
dependence — but New York has redundancy. There, a reliability tool picks between options.
Here, it usually has to tell you the truth about the only option you have. See `D-13`.

**4. Since One Fare, GO is a real alternative — in the few corridors it serves.**
Double fares between TTC and GO ended in February 2024 (E-L13). Where GO runs, "go another
way" is now honest advice rather than a downtown assumption.

---

## U-02 — The Captive Rider *(PRIMARY)*
**"There's one bus. If it doesn't come, I don't go."**

> Absorbs the former **U-01, the Deadline Commuter**, merged 2026-08-28. A hard arrival
> time is a *trip attribute*, not a person: it changes how a rider reads a number, not
> which rider they are, and the research segments by regularity rather than by deadline
> (E-L04). The two descriptions were also the same human — precarious work and unforgiving
> deadlines travel together in Toronto. The deadline now lives below as a modifier.

Works a shift that starts at a fixed time — warehouse near Pearson, long-term care home,
retail, hospital cleaning. Lives north of Sheppard where the nearest subway is a 25-minute
bus ride away. **No car in the household.** Pays per ride on PRESTO because $156 up front
for a monthly pass is not available in the first week of the month. May be a newcomer;
English may be a second language.

Their route is 52 Lawrence West, 102 Markham Road, 86 Scarborough — the routes carrying
the most delay in the entire system (E-D05), where each incident costs about three times a
subway one (E-D13), and where the 2h+ commute tail lives (E-L08).

In February they are standing at an unsheltered stop in −18°C, and the honest answer is
often a **26-minute median wait** (E-D09).

- **Optimises:** whether the trip is viable at all, and how long they will be outside
- **Problems:** PR-01, PR-04, PR-05, PR-10
- **Currently does:** stands there with no information; if the shift is at risk, pays for
  an Uber they cannot afford, or is late and penalised
- **Needs from us:** an honest wait, and permission to act on it — "25 minutes, go back
  inside" is a *useful* answer, not a failure to help
- **Abandons us if:** we only cover the subway, or we recommend alternatives that do not
  exist in their neighbourhood
- **Anti-goal:** never offer a reroute that assumes downtown density. A 20-minute walk to
  a parallel route is a downtown answer to a suburban question — and in January it is a
  dangerous one. Second anti-goal, inherited from U-01: never show a single confident ETA
  to a rider with a deadline. That is the number that gets them in trouble
- **When a hard deadline is attached** (a shift that docks lateness, daycare charging by
  the minute, a clinic that gives the slot away) their tolerance turns **asymmetric**: a
  wasted 10 minutes is an annoyance, a missed pickup is a fee and a warning. They plan by
  the 95th percentile, not the average (E-L03), and today buy blanket insurance by leaving
  20 minutes early every day — about an hour a week of unpaid buffer
- **Unvalidated assumptions:** that rerouting is usually not a real option for them, and
  that the deadline asymmetry is as sharp as assumed (D-08)
- **Served worst by what we built:** **86% of bus segments are unknown** (E-D12). This
  persona opens the map and mostly sees hatching. That is Q-A

## U-04 — The Access-Constrained Rider *(primary for correctness)*
**"A broken elevator doesn't delay my trip. It ends it."**

Depends on elevators, or cannot stand for long, or travels with a mobility device. **Only
55 of 75 stations are fully accessible** and the TTC missed Ontario's 2025 deadline
(E-L09). Winter compounds it: an accessible entrance that is not cleared is not accessible,
and it is often the far entrance from the elevator.

Their failure mode is **binary**. A station that is 95% accessible is unusable on the day
it is not — potentially stranding them mid-journey, in a system with no second option
(E-L12).

- **Optimises:** certainty and the existence of a fallback, over speed entirely
- **Problems:** PR-06, PR-04, PR-10
- **Currently does:** plans manually and conservatively, avoids unfamiliar routes,
  abandons trips outright
- **Needs from us:** accessibility as a **hard routing constraint**, plus honesty when we
  do not know an elevator's status
- **Abandons us if:** we route them through a station we cannot verify is accessible. Once
- **Anti-goal:** never blend accessibility into a composite score. It is a constraint

## U-05 — The Downtown Rider *(primary)*
**"The app says 9 minutes. I can walk it in 20. Which is it?"**

Lives or works inside the core — King, Queen, Dundas, the condo corridors along Yonge and
the waterfront. Rides streetcars for trips of 10–25 minutes. Often a student (U of T, TMU,
OCAD) or works service, hospitality or an office job with some flexibility.

Their routes are the worst-performing surface routes in the system, and it is not close:

| route | rider-wait minutes |
|---|---|
| 504 King | 105,302 |
| 501 Queen | 103,678 |
| 505 Dundas | 79,223 |
| 506 Carlton | 74,073 |

Mean wait per streetcar incident is **32.1 minutes** — not far off the bus figure of 38.0.
Downtown is not spared; it is differently shaped.

**This is the one persona with real alternatives.** In the King/Queen/Dundas box there are
**321 stops across 26 routes**; the equivalent Scarborough box has 131 stops across 17.
Parallel streetcar routes are blocks apart, bike share is dense, and most core trips are
walkable — usually the decisive fact, since a 25-minute walk beats an unknown wait plus a
crawling streetcar.

They are also the rider most likely to be *misled* by an optimistic prediction, because
they have a real alternative they could have taken and didn't.

- **Optimises:** the choice between streetcar, walking, bike and parallel route — the only
  persona for whom "which option" is genuinely the question
- **Problems:** PR-01, PR-02, PR-03, PR-07
- **Currently does:** stares at a countdown that keeps resetting, then walks anyway,
  having lost 10 minutes deciding
- **Needs from us:** a fast comparison against the walk. "18 min typical wait, 22 min walk"
  ends the deliberation
- **Abandons us if:** we are slower to consult than looking up the street
- **Anti-goal:** never present the streetcar as the default because it is the transit
  option. Sometimes the honest answer is "walk" — and a transit app that says so earns more
  trust than one that never does
- **Where they complicate D-13:** the forecast framing holds system-wide, but downtown is
  precisely where routing *is* meaningful. Comparison is a downtown feature, not a
  citywide one

---

## Not personas

Kept here so they are not silently reinvented. A persona has to earn its place by producing
a **different design need**, evidenced. These do not, yet.

- **The Regional Commuter (former U-03).** Demoted to a hypothesis 2026-08-28. The evidence
  behind it (E-L05: riders with options churn because of uncertainty) describes the same
  axis U-05 already occupies — having an alternative — and does not show that a 905/GO
  rider needs something different from a downtown rider who can walk. One Fare (E-L13) is a
  real enabler, but we ingest no GO data and the case was always framed as growth rather
  than as an observed user. **Revisit if:** GO data is ingested and regional riders show a
  distinct decision, or interviews surface one.
- **Tourists and one-off riders.** Optimise raw travel time (E-L04), have no route priors,
  get no value from history. Google Maps serves them.
- **Transit planners and advocates.** Would want the segment layer — TTCriders built a
  whole report for want of it — but the product shape differs. A plausible later market.

## How well the built product serves each of them

| | served today | gap |
|---|---|---|
| **U-02** captive rider | partially — segments exist and rank | 86% unknown (E-D12); no at-stop view; nothing seasonal; no "leave by" (M7) |
| **U-05** downtown rider | partially — streetcar segments rank | no walk comparison, no realtime |
| **U-04** access-constrained | partially — step-free filter with live outages | no routing yet, so it marks rather than re-routes; no station-entrance detail |

U-04 was the uncomfortable one — a decision recorded that the build had not honoured. `D-07`
is now implemented (`E-D17`): step-free is a filter, live outages included, and `unknown`
counts as blocked. What is still missing is *routing around* a blocked station rather than
just marking it.

## Three personas, one axis

The research supports segmenting on **whether the rider has an alternative** — not on
geography, trip purpose, or deadline:

| | alternative? | needs |
|---|---|---|
| **U-02** captive | no | a **forecast** — is this viable, when do I leave, when do I give up |
| **U-05** downtown | yes, in the moment | a **comparison** — transit or walk |
| **U-04** access-constrained | rarely, and failure is binary | a **constraint** — routes that are certainly usable |

That axis is now `D-14`. It does not decide *whether* to build a router — it decides what
the router should say. For U-02 the honest answer is one route plus when to leave and when
to give up; for U-05 it is a genuine comparison; for U-04 it is a filter applied before
anything is ranked.

All three ride a network with no redundancy, in a city where waiting outside is seasonally
dangerous, using an app that assumes a data plan. Those three facts constrain the product
more than any individual persona does.
