# Evidence Base

Every claim the product design rests on. Nothing here is asserted without a source.

**Measured:** 2026-08-28 | **Data window:** 2025-01-01 to 2026-07-31

---

## Data evidence (our own analysis of TTC open data)

### E-D01 — Unreliability is a persistent property of place
Ranked stations by delay-minutes independently in 2025 and 2026, then correlated.
**Spearman rho = 0.78** across 87 stations with meaningful volume in both periods.

*Why it matters:* this is the load-bearing finding. If unreliability were noise, there
would be nothing to predict and no product. It is not noise.

### E-D02 — The dominant causes are people, not infrastructure
Subway delay-minutes by cause: disorderly patron 9.9%, injured/ill customer 11.7%
(medical + transport), unauthorized at track level 5.2%, security other 5.2%,
weather + ice/snow 7.6%. **~32% is passenger and security incidents.** Equipment and
infrastructure is a materially smaller share.

*Why it matters:* it invalidates the original "maintenance and infrastructure wear"
hypothesis. Unreliability tracks *crowding and time-of-day*, which are far more
predictable than component failure — and are things a rider can actually route around.

### E-D03 — Delay location is an attribution artifact, not a rider risk map
**20.7% of subway delay-minutes are attributed to 12 of ~70 stations**, and those are
overwhelmingly terminals and yards (Kipling, Kennedy, Finch, Sheppard West, Wilson,
Davisville). Delays are logged where the *train* was, not where the problem was or
where a rider suffered.

*Why it matters:* the single largest correctness trap in this product category. Naive
"red station" maps tell riders to avoid places that are not actually risky to travel
through. Every competing visualisation we reviewed appears to fall into it.

### E-D04 — Two thirds of delay records are not delays
**65% of subway delay records have Min Delay = 0** — logged incidents with no service
impact.

*Why it matters:* unfiltered, every statistic downstream is wrong.

### E-D05 — The bus network carries ~17x the subway's delay burden
Subway: 117,924 delay-minutes. Bus: 2,052,791. Worst routes: 52 Lawrence West (45,974),
97 Yonge (44,891), 29 Dufferin (41,681), 102 Markham Road (37,327), 63 Ossington (31,901).
Skewed toward outer-suburban routes.

*Why it matters:* the subway gets the attention and the press; the buses carry the pain.
This relocates the product's centre of gravity and changes who the primary user is.

### E-D06 — The subway has no realtime feed
Routes 1/2/4 exist in GTFS static but are **absent from the GTFS-RT trip feed** (which
begins at route 7). Surface transit has live positions; the subway does not.

*Why it matters:* for the highest-ridership part of the network we have schedule +
history + service alerts only. We cannot show live subway positions, and must not
imply we can.

### E-D07 — Surface delay data is only two-thirds geocodable
Surface records identify location as free text (`KING AND PARLIAMENT`) with no
coordinates or stop_id. Matching against GTFS stop names resolves **50.1% of
delay-minutes** by intersection plus **16.1%** at named subway stations = **66.1%
addressable**, leaving **33.9% unresolved**.

*Why it matters:* our map will have real holes. How we render a hole is a UX decision,
not just an engineering one (see `P-03`).

### E-D08 — Feed and data availability
Delay history refreshes monthly, current through 2026-07-31. GTFS static refreshed
2026-08-27: 236 routes, 9,402 stops, includes `shapes.txt`. All three GTFS-RT feeds
live and unauthenticated; **2,223 of 2,279 trips carry real `trip_id`s**, so realtime
joins cleanly to the static schedule.

---

## Literature evidence

### E-L01 — Reliability-aware routing produces real time savings
Reliability-based transit trip planning yields **~8.9% average travel-time savings,
up to 37.1%** on individual routes.
[Springer, Public Transport](https://link.springer.com/article/10.1007/s12469-016-0134-y)

### E-L02 — Mainstream planners ignore variance
Public planners such as Google Maps route on **scheduled times and cannot consider
reliability** of alternatives. A route can take 15% longer but carry only 20% of the
variance — invisible in every mainstream tool.
[Springer](https://link.springer.com/article/10.1007/s12469-016-0134-y) ·
[ScienceDirect, Hamburg](https://www.sciencedirect.com/science/article/abs/pii/S095741742300698X)

### E-L03 — Riders plan by buffer, not by average
Travellers add **buffer time** to arrive on time ~95% of the time; the standard measure
(buffer index) uses the **95th percentile**, not the mean.
[FHWA, Travel Time Reliability](https://ops.fhwa.dot.gov/publications/tt_reliability/ttr_report.htm)

*Why it matters:* riders already think in percentiles. An average ETA answers a question
nobody is asking.

### E-L04 — Rider segments have different concerns
Regular commuters weight reliability, safety and comfort; irregular riders weight raw
travel time. Segments are not interchangeable.
[Segmenting Preferences and Habits of Transit Users](https://www.researchgate.net/publication/277620360_Segmenting_Preferences_and_Habits_of_Transit_Users)

### E-L05 — Unreliability drives churn among riders who have alternatives
Riders with other options "are still mostly choosing those other options, because they
don't know if the bus will show up." Official on-time-performance metrics "hide more
than they reveal" versus lived experience. More accurate realtime information is among
the top things riders say would increase their transit use.
[CBC](https://www.cbc.ca/news/canada/toronto/the-ttc-is-increasing-service-levels-but-advocates-say-riders-need-more-changes-to-trust-the-system-1.6949907) ·
[TTCriders, *Lucky or Late*](https://www.ttcriders.ca/bunchingreport)

---

## Market evidence

### E-M01 — Reliability-aware TTC routing already exists
[Reroute](https://rerouteapp.ca/ttc) does reliability-aware routing on a model trained
on 393,000+ TTC delay records, with live positions and multi-agency GTA coverage.
**It does not expose segment-level reliability.**

### E-M02 — Everything else is a retrospective dashboard
[ttcdelay.kbains.com](https://ttcdelay.kbains.com/),
[TTC Delay Insights](https://ttcdelayinsights.ca/),
[sacul-git/ttc-delays](https://github.com/sacul-git/ttc-delays) — historical analysis and
visualisation, no routing, line/station granularity only.

*Why it matters:* our defensible position is the **segment layer**, not "a trip planner
with reliability in it." That space is occupied.

---

## Added 2026-08-28 (rider-problem investigation)

### E-D09 — Rider-felt wait is far worse than vehicle lateness
The delay datasets carry both `Min Delay` (vehicle lateness) and `Min Gap` (headway gap
left behind). Comparing them:

| | median delay | median gap | gap/delay | incidents with gap >= 2x delay |
|---|---|---|---|---|
| Subway | 5 min | 8 min | 1.38x | 44.0% |
| Bus | 13 min | **26 min** | **1.58x** | **83.8%** |

*Why it matters:* the metric everyone reports (`Min Delay`) **understates what a rider
actually experiences by ~58% on buses.** The gap is the wait at the stop; the delay is
the vehicle's lateness. 83.8% of bus incidents carry the bunching signature. This is our
sharpest differentiator and it is sitting unused in public data.

### E-L06 — Bunching is the dominant service failure, and it is under-reported
Riders waited **50% longer than scheduled on 10 routes** and **30% longer on 41 routes**
(Sep 1 – Nov 16). **Only 10 routes citywide met on-time targets in evening rush.**
Delays were the top complaint to the TTC, raised by **11,470+ people**.
[TTCriders, *Lucky or Late*](https://www.ttcriders.ca/bunchingreport) ·
[CBC](https://www.cbc.ca/news/canada/toronto/ttc-service-report-bunching-1.7439818) ·
[TorontoToday](https://www.torontotoday.ca/local/transportation-infrastructure/transit-riders-group-says-ttc-bunching-likely-worse-than-reported-10122617)

### E-L07 — Short-turning strands riders mid-trip
**330,000+ short-turned TTC buses since January 2012** — riders put off at the roadside
while the vehicle reverses direction.
[Global News](https://globalnews.ca/news/1702327/stranded-how-the-ttc-is-trying-to-solve-its-short-turn-problem/)

### E-L08 — Toronto has Canada's longest commutes, and transit is the slowest mode
Toronto average commute **34.9 min** (national 26.7). **Transit commuters average 44.1 min
vs 24.7 by car.** **30% of Torontonians travel 1–2 hours; 10% travel 2 hours or more.**
[StatCan](https://www150.statcan.gc.ca/n1/daily-quotidien/250826/dq250826a-eng.htm) ·
[CBC](https://www.cbc.ca/news/canada/toronto/commute-times-toronto-1.7307002)

*Why it matters:* long trips mean more transfers, and each transfer is a place where
variance compounds. The tail (10% at 2h+) is where the product's value is concentrated.

### E-L09 — Accessibility failures convert a delay into a cancelled trip
**Only 55 of 75 subway stations are fully accessible**; the TTC missed Ontario's 2025
accessibility deadline. Elevators break without warning, "instantly turning an accessible
station into an inaccessible one," forcing long detours or loss of the trip entirely.
Advocates' top ask is **realtime elevator information**.
[NOW Toronto](https://nowtoronto.com/news/for-ttc-riders-with-disabilities-one-broken-elevator-can-derail-an-entire-trip-now-theyre-pushing-for-better-accessibility/) ·
[The Local](https://thelocal.to/ttc-accessibility-aoda-deadline-missed/)

*Why it matters:* for this group a "5-minute delay" is not a smaller version of the same
problem — it is a different, binary problem. Our severity model must reflect that.

### E-D10 — Exposure persists at segment level; severity does not
Split-half test across 125 segments with >=10 incidents in each period, terminal
approaches excluded:

| metric | rho | ties |
|---|---|---|
| incident count | 0.762 | 41% |
| total gap-minutes | 0.681 | 7% |
| median gap | 0.361 | 94% |
| p90 gap | 0.214 | 82% |
| **mean gap** | **0.104** | **3%** |

*Why it matters:* the exposure dimension is strongly persistent and rankable. Severity is
not — and with only 3% ties its near-zero correlation cannot be dismissed as a
tied-ranks artifact. **How often a segment costs you time is predictable; how long you
wait once it does is not.** This is the finding that reshaped the engine contract (D-11).

Reproduce with `npm run audit:stability`.

### E-D11 — Surface coverage reaches 76.6%, and the gap is not what it looked like
Resolving surface delay locations against GTFS (measured 2026-08-28,
`npm run audit:coverage`), by share of surface delay-minutes:

| bucket | share | |
|---|---|---|
| intersection resolved | 57.4% | |
| station resolved | 17.9% | |
| landmark resolved | 1.3% | |
| loop (turnaround) | 3.0% | excluded, D-06 |
| garage / division | 1.8% | excluded, D-06 |
| **unresolved** | **18.7%** | the real gap |

**Raw coverage 76.6%** against the 66.1% baseline in E-D07; **addressable coverage 80.6%**
once non-rider locations are removed.

*Why it matters:* nearly 5% of surface delay is logged at garages and loops — places no
rider is ever waiting. Counting those as geocoding failures understates coverage;
counting them as covered would put phantom risk on the map. They are a third category,
not a gap (D-12).

The residual 18.7% is largely irreducible: `RENFORTH STATION` is a MiWay terminal absent
from TTC GTFS, and pairs such as `YONGE AND YONGE BLVD` cannot be told apart once
street-type suffixes are stripped. Pushing the matcher further trades false matches for
coverage, which P-08 forbids.

### E-D12 — Most of the bus network cannot be scored at stop-to-stop granularity
Built 18,840 surface segments across 233 routes; 6,511 have any attributed incidents.
Against the pre-registered confidence thresholds:

| | segments | share |
|---|---|---|
| high confidence (>=30 incidents) | 576 | **3.1%** |
| low confidence (>=5) | 2,703 | 14.3% |
| unknown (<5) | 16,137 | **85.7%** |

Surface attribution reaches 56.2% of delayed incidents and 53.9% of surface delay-minutes.

*Why it matters:* a stop-to-stop bus map is ~86% unknown. Honouring P-03 makes that
visible, which is correct but produces a mostly-hatched screen with known and unknown
segments alternating. This is the central open question for the interface, not a polish
item.

### E-D13 — Surface waits are roughly three times subway waits
Pooled wait once an incident occurs, terminal approaches excluded:

| | p50 | p90 | p95 |
|---|---|---|---|
| subway | 9 min | 17 min | 23 min |
| surface | 24 min | 59 min | **73 min** |

*Why it matters:* pooling these together — as the engine briefly did — shows a subway
rider percentiles drawn mostly from buses. It also sharpens E-D05 and PR-01: the network
carrying most of the delay is also the one where each incident hurts about three times as
much. Strong support for U-02 as the primary persona rather than U-01.

---

## Added 2026-08-28 (Toronto rider context)

### E-L10 — Two thirds of TTC riders are equity-deserving, and the inner suburbs are underserved
**66.6% of Toronto transit riders are equity-deserving**, and 71.9% of them live outside
the city's designated Neighbourhood Improvement Areas — concentrated in north Scarborough.
Scarborough's average transit access and connectivity score is **20.97 against 102.8** in
affluent neighbourhoods. Riders in these areas are disproportionately newcomers, racialized,
in precarious employment, and without access to a car.

Lower-income riders also **pay more per ride**, because they cannot front the cost of a
monthly pass. Cashless payment and app-based service isolate people who are unbanked or
have low digital literacy — including newcomers and older adults.
[Wellesley Institute](https://www.wellesleyinstitute.com/ttc/transit-access-and-affordability-an-equity-based-approach/) ·
[pointA](https://pointa.ca/2020/11/04/transit-inequity-who-gets-left-behind-when-neighbourhoods-arent-well-connected/) ·
[Scarborough Transit Action](https://www.scarboroughtransitaction.ca/transit-equity)

*Why it matters:* our modal rider is not a downtown professional choosing between transit
and Uber. It reorders the personas — and it puts a constraint on the product itself, which
currently assumes a smartphone, a data plan, and comfort with an analytics interface.

### E-L11 — Waiting is a physical risk for a third of the year
Toronto winters make an unexplained wait dangerous, not merely annoying. The city plans
**100 heated shelter kits over seven years**, targeted at high-ridership stops with *low
frequency*. During storms riders have been **stranded at stops for hours** with no service
and no communication. TTC staff see **30–60 unhoused people a day** sheltering in stations
in cold months, against 8–10 the rest of the year.

Our own data agrees on severity: ice and snow incidents average **68.8 minutes** against a
7.8-minute overall mean (E-D02).
[TTCriders snow plan](https://www.ttcriders.ca/snowplan) ·
[CTV](https://www.ctvnews.ca/toronto/video/2026/01/23/cold-weather-impacting-commute-for-ttc-transit-riders/) ·
[Global](https://globalnews.ca/news/10232210/ttc-rise-shelter-cold-snaps/amp/)

*Why it matters:* "your bus is 26 minutes away" is information in July and a safety
decision in January. The same number carries different stakes by season, and the interface
currently treats them identically.

### E-L12 — Toronto has almost no network redundancy
The TTC's own CEO describes the system as **"binary"**: if Line 1 or Line 2 goes down,
"pretty much you only have one option — shuttle buses." Shuttle buses cannot carry subway
volume, and there is no parallel downtown line. Weekend closures sometimes run with **no
shuttle service at all**.
[CBC](https://www.cbc.ca/news/canada/toronto/downtown-relief-line-would-have-made-difference-wednesday-morning-ttc-ceo-1.3610202) ·
[TorontoToday](https://www.torontotoday.ca/local/transportation-infrastructure/portion-line-1-subway-closed-weekend-no-shuttle-bus-service-11451891)

*Why it matters — this is the finding that most changes the product.* Toronto resembles
New York in density, commute length and transit dependence. It does **not** resemble it in
redundancy: New York has express and local tracks, parallel lines, and 24-hour service, so
a reliability tool there answers *"which of my options is best?"* Toronto usually has no
second option, so the same tool must answer a different question: **"is this trip viable,
when should I leave, and should I give up?"**

A reliability-aware *router* is a New York product. Toronto needs a reliability-aware
*forecast*. See D-13.

### E-L13 — One Fare removed the penalty for using GO as an alternative
Since February 2024 the **One Fare** program eliminated double fares between the TTC, GO
Transit and other GTA agencies, saving $3.30 per transfer and an estimated $1,600 a year
per rider.
[TTC](https://www.ttc.ca/riding-the-ttc/Updates/One-Fare-Program) ·
[Global](https://globalnews.ca/news/10316270/toronto-gta-transit-one-fare-monday)

*Why it matters:* in corridors GO actually serves, riders now have a genuine alternative
that used to cost extra. It is the one place where Toronto has meaningful redundancy — and
the one place where "go another way" is honest advice rather than a downtown assumption.

### E-D14 — Downtown is the one place with real alternatives, and its routes are the worst
Streetcar routes by rider-wait minutes: **504 King 105,302**, 501 Queen 103,678,
505 Dundas 79,223, 506 Carlton 74,073. Mean wait per streetcar incident is **32.1 minutes**
against 38.0 for buses — downtown is not spared, only differently shaped.

But alternative density differs sharply. Counting stops and distinct routes in equivalent
bounding boxes:

| | stops | distinct routes |
|---|---|---|
| Downtown core (King/Queen/Dundas) | 321 | **26** |
| Scarborough (Markham/Lawrence) | 131 | **17** |

Downtown also has walking and bike share as genuine substitutes for a 10–25 minute trip.

*Why it matters:* it qualifies D-13. The forecast framing holds citywide, but the core is
where "which option should I take" is a real question — so comparison is a **downtown
feature, not a citywide one**. It also gives U-05 its defining behaviour: the walk is
usually the decisive alternative, and a transit app willing to say "walk" earns more trust
than one that never does.

### E-D15 — The alerts feed already carries day-of disruptions, including elevator status
The GTFS-Realtime alerts feed (verified 2026-08-28, unauthenticated) carries ~34 live
alerts with full description text and affected route ids. Sampled content:

- **Detours:** "506 Carlton: Detour via Ossington Ave, Dundas St W and Bay St due to a
  blocked track."
- **Stop bypasses:** "16 Mccowan: Bypass near Scarborough Centre Station at Bus Bay 9 while
  we respond to a security incident." — the same incident appeared across **9 routes**,
  so alerts can be clustered into one rider-facing event.
- **Elevator outages:** "Cedarvale: Elevator 06-ELV-B out of service between platform and
  upper concourse while we perform maintenance."

*Why it matters, twice over:*

1. It is the data source for day-of routing — detours and bypasses change which segments a
   trip actually uses, today.
2. **It closes the U-04 data gap.** `D-07` committed to accessibility as a hard routing
   constraint and was recorded as blocked for want of a source. Elevator status is in a
   feed we already fetch. The gap was never data availability; it was that nobody looked.

*Caveats:* every alert reports `UNKNOWN_EFFECT` — the TTC does not populate the effect
enum, so severity must be classified from description text. `active_period` is empty, so
alerts carry no start or end. Header text is truncated around 30 characters; the
description is complete and is the field to use.

Planned subway closures and their shuttle buses are published as **web pages**, not as a
feed ([TTC closures](https://www.ttc.ca/service-advisories/subway-service)), so they need
scraping or manual entry — the one day-of input without a clean machine source.

### E-D16 — Segment geometry can be drawn on real streets for 99.6% of segments
GTFS publishes a `shapes.txt` polyline per trip that follows actual roads, but TTC leaves
`stop_times.shape_dist_traveled` empty, so there is no published link between a stop and
its position along that polyline. Projecting each stop onto the shape and slicing between
consecutive stops yields real street geometry for **18,897 of 18,982 segments (99.6%)**.

A first attempt reached only 50.4%, because it picked one representative shape per route.
A route publishes at least one shape per direction plus short-turn variants, so every
segment travelling the other way projected out of order and could not be sliced — almost
exactly the half that failed. Trying every shape the route uses, and keeping the tightest
successful slice, fixed it.

*Why it matters:* it is the difference between a map and a diagram. Straight lines between
stops cut through buildings and read as unfinished, and `D-14` commits to a map people
recognise.

### E-D17 — Step-free access is knowable from two feeds, and 16 stations are structurally excluded
GTFS `stops.txt` carries `wheelchair_boarding` for every stop (8,091 marked accessible,
1,311 not — no blanks), which gives a **baseline**: is the station built step-free? The
GTFS-RT alerts feed gives the **live** picture, naming outages in its description text
("Cedarvale: Elevator out of service between platform and upper concourse").

Resolved across 293 stations: **275 accessible, 16 structurally not accessible, 2 with a
live outage.** The structural list validates against reality — Museum, King, College,
Greenwood, Old Mill and Islington are genuinely among the TTC's non-accessible stations.

*Why it matters:* the two must not be collapsed. A station can be built accessible and be
unusable today; one is permanent and the other may clear within the hour, and a rider
deciding whether to travel needs to know which they are looking at.

**Known limit:** absence of an alert is not evidence an elevator works. The feed reports
outages it knows about, so `unknown` is treated as *not usable* rather than as fine (P-03).

### E-D18 — Long history predicts worse than recent history, and a third of the network has shifted
Two measurements, prompted by the observation that a transit network is not stationary —
service changes, reassignment, construction and nearby roadworks all move a segment's
behaviour.

**Predictive power peaks and then declines.** Holding out the last two months and testing
each lookback window on an identical segment set (n = 962):

| lookback | rho | | decay half-life | rho |
|---|---|---|---|---|
| 1 month | 0.375 | | 1 month | 0.503 |
| 3 months | 0.512 | | 2 months | 0.538 |
| 6 months | **0.530** | | **3 months** | **0.543** |
| 12 months | 0.519 | | 6 months | 0.535 |
| 17 months | 0.512 | | none (flat) | 0.512 |

Seventeen months of history predicts **worse** than six. Exponential decay beats every flat
window, peaking at a three-month half-life.

**The churn is large.** Comparing the archive's two halves on 3,210 comparable segments:
**35.9% changed by 2x or more, 18.5% by 3x.** The extremes are dramatic — one Sherbourne
segment 51x worse, one Exhibition-area segment 55x better.

*Why it matters:* it invalidated the flat all-history average the scoring engine used, and
the confidence thresholds built on raw counts. Thirty incidents from eighteen months ago is
not thirty incidents of evidence about next Tuesday, and calling that "high confidence" is
exactly the failure `P-08` exists to prevent.

**The honest cost:** taking recency seriously *reduces* what we can claim. Scorable segments
fall from 2,703 to 1,167 even after recalibrating the bar. 52 Lawrence West drops from 25
scored stretches to 7. We do not have as much recent evidence as raw counts implied — that
was always true; it was just hidden.

### E-D19 — Per-trip disruption risk is small, so the tail is the story, not the average
Scoring whole journeys required converting exposure (harm per *month*) into per-trip risk by
dividing by how often each segment is served. The result changes what the product can
honestly say.

For a Jane/Eglinton → Union trip, three routings:

| via | typical | when disrupted | disruption rate | coverage |
|---|---|---|---|---|
| 32 + 5 + 1 | 49 min | 73 min | **1 in 150 trips** | 67% |
| 935 + 2 + 1 | 49 min | 73 min | 1 in 99 | 90% |
| 935 + 2 + 510 | 69 min | 93 min | 1 in 147 | 45% |

**Expected added minutes is a useless number to show a rider.** At a 0.1–0.3% per-trip risk
it rounds to zero, and ranking on it is indistinguishable from ranking on the timetable.

**The same figure as a rate is both legible and discriminating.** "1 in 393 trips" versus
"1 in 1,236" is a threefold difference a rider can act on, and it matches how the risk
actually arrives: almost every trip is fine, and occasionally one costs you 24 extra
minutes.

*Why it matters:* it settles the framing for M9/M10. The product is not "this route is five
minutes slower on average" — that claim is false. It is **"this route goes wrong three times
as often, and when it does it costs you 24 minutes."** Which is also exactly what `P-01`
asks for: a distribution, not a point estimate.

**A correction worth keeping.** The first run of this measurement reported 10–11% coverage
and blamed `D-19` for thinning the evidence. That was wrong, and the diagnosis was lazy: a
funnel over the actual journeys showed **65% of segments were failing a frequency lookup**,
not failing for want of data. Subway segments store station names with null stop ids, while
the frequency map was keyed on GTFS stop ids — the same name-versus-id mismatch already
handled in the segment lookup and forgotten here. Every subway segment silently dropped out
of scoring.

Fixed, coverage is **45–90% per journey**, and the residue is genuine: 17% of segments have
no logged incident at all and 10% sit below the confidence bar.

*The lesson:* "the data is thin" is a comfortable explanation and was, here, a bug wearing
a plausible story. Measure the funnel before believing it.
