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
