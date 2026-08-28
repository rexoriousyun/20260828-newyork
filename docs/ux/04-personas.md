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

**3. There is usually no second option.**
The TTC's own CEO calls the system **"binary"** (E-L12). No express tracks, no parallel
downtown line, weekend closures sometimes with no shuttle at all.

*Consequence for us:* this is where the New York analogy breaks, and it is the most
important difference. Toronto is like New York in density, commute length and transit
dependence — but New York has redundancy. There, a reliability tool picks between options.
Here, it usually has to tell you the truth about the only option you have. See `D-13`.

**4. Since One Fare, GO is a real alternative — in the few corridors it serves.**
Double fares between TTC and GO ended in February 2024 (E-L13). Where GO runs, "go another
way" is now honest advice rather than a downtown assumption.

---

## U-02 — The Scarborough Bus Rider *(PRIMARY)*
**"There's one bus. If it doesn't come, I don't go."**

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
  dangerous one
- **Unvalidated assumption:** that rerouting is usually not a real option for them (D-08)
- **Served worst by what we built:** **86% of bus segments are unknown** (E-D12). This
  persona opens the map and mostly sees hatching. That is Q-A

## U-01 — The Deadline Commuter *(primary)*
**"I don't need to be fast. I need to not be late."**

A hard arrival time with a penalty attached: a shift that docks you for lateness, a daycare
charging by the minute, a clinic that gives the slot away. Note this is often the *same
person* as U-02 — precarious work and hard deadlines travel together in Toronto. Rides the
same trip daily, already knows it is unreliable, and has no way to reason about how much to
over-leave.

- **Optimises:** the 95th percentile, not the mean (E-L03)
- **Problems:** PR-01, PR-03, PR-05
- **Currently does:** leaves 20 minutes early every day, paying the worst case on every
  good day — an hour a week of unpaid insurance
- **Needs from us:** "leave by 8:12 to make 9:00 with 90% confidence", and the honest cost
  of that buffer
- **Abandons us if:** we are wrong once in the late direction. Their tolerance is
  asymmetric — a wasted 10 minutes is an annoyance, a missed pickup is a fee and a warning
- **Anti-goal:** never show a single confident ETA. That is the number that gets them in
  trouble
- **Unvalidated assumption:** the asymmetry itself (D-08)

## U-03 — The Regional Commuter *(secondary — the growth case)*
**"I'll take transit if I trust it. Otherwise I'm driving."**

Lives in the 905 or near a GO corridor, or owns a car and chooses per trip. Since One Fare
(E-L13), combining GO and TTC no longer costs extra, so they genuinely have options — the
only Toronto rider who reliably does. Documented as churning away from transit because of
**uncertainty rather than average slowness** (E-L05).

- **Optimises:** avoiding the bad outcome; will pay to remove variance
- **Problems:** PR-07, PR-03, PR-08
- **Currently does:** drives, because the downside is bounded and parking is a known cost
- **Needs from us:** a fast, trustworthy read on whether *this trip today* is a good bet
- **Abandons us if:** we feel like a dashboard. They will not study a map — they want a
  verdict in five seconds
- **Anti-goal:** never bury the answer behind exploration. Analysis is for J-04, not for
  them

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

---

## Who we are not building for (yet)

- **Tourists and one-off riders.** Optimise raw travel time (E-L04), have no route priors,
  get no value from history. Google Maps serves them.
- **Transit planners and advocates.** Would want the segment layer — TTCriders built a
  whole report for want of it — but the product shape differs. A plausible later market.

## How well the built product serves each of them

| | served today | gap |
|---|---|---|
| **U-02** Scarborough bus | partially — segments exist and rank | 86% unknown (E-D12); no at-stop view; nothing seasonal |
| **U-01** deadline commuter | not yet — M7 unbuilt | exposure published; "leave by" not calculated |
| **U-03** regional commuter | no | needs a verdict; no GO data ingested |
| **U-04** access-constrained | **not at all** | `D-07` decided, nothing implemented, no elevator data |

U-04 is the uncomfortable one: a decision recorded that the build has not honoured.

## What the personas jointly imply

U-01 and U-02 need **distributions**. U-03 needs a **verdict**. U-04 needs a
**constraint**. Same model, sharply different presentation — which is `D-05`.

And all four are riding a network with no redundancy, in a city where waiting outside is
seasonally dangerous, on an app that assumes a data plan. Those three facts constrain the
product more than any individual persona does.
