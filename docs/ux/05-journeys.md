# Journeys

Four moments where a rider needs us. They demand **different products**, and conflating
them is the most likely way to build something that serves nobody.

The recurring failure across all four: **the rider's information is worst exactly when
their decision matters most.**

---

## J-01 — Pre-trip: "when do I need to leave?"
**Who:** U-01, U-03 · **Problems:** PR-03, PR-01, PR-07 · *Highest-value journey*

| Stage | Rider state | Today | Our intervention |
|---|---|---|---|
| Has an obligation | Knows arrival time, not departure | Works backwards from a schedule that lies | Work backwards from the *distribution* |
| Checks options | Wants to know if today is unusual | No signal until at the stop | Today vs this segment's normal |
| Decides buffer | Guesses | Blanket 15–20 min every day | Explicit: "leave 8:12 for 90% confidence" |
| Commits | Wants to stop thinking | Anxiety persists, keeps re-checking | State the confidence and let them go |

**Success:** they leave once, on time, and do not re-check.
**Failure:** we give a point ETA and they trust it (violates U-01's anti-goal).

## J-02 — At the stop: "is it coming, or should I give up?"
**Who:** U-02, U-01 · **Problems:** PR-01, PR-04 · *Most acute pain*

The rider is already committed, standing outside, possibly in winter, with rapidly
decaying patience. Median bus headway gap during an incident is **26 minutes** (E-D09) —
and 83.8% of bus incidents carry the bunching signature, so "the next one is 4 minutes
away" is frequently false.

| Stage | Rider state | Today | Our intervention |
|---|---|---|---|
| Arrives at stop | Expects a short wait | App shows optimistic prediction | Show the *gap*, not the vehicle ETA |
| 5 min pass | Doubt | Countdown resets upward — the "ghost bus" | Name it: bunching, gap is now ~N min |
| 10+ min | Considering abandoning | No basis to decide | Give an explicit abandon threshold |
| Abandons or waits | Wants to stop refreshing | Refreshes compulsively | Permission: "go inside, ~18 min" |

**Success:** the rider stops checking their phone — either because they left, or because
they trust our number enough to wait calmly.
**Failure:** we mirror the optimistic countdown everyone else shows. Then we are the
ghost bus.

> Note: this journey needs realtime, which the subway does not have (E-D06). J-02 is a
> **surface-transit journey** for the foreseeable future. That is fine — the pain is
> there anyway (E-D05).

## J-03 — Mid-trip disruption: "I'm stuck, now what?"
**Who:** U-02, U-04 · **Problems:** PR-04, PR-06

The worst state: already committed, in a place they did not choose, alternatives
narrowed. Short-turning strands riders 330,000+ times (E-L07); for U-04 an elevator
outage here is not a delay but a trap (E-L09).

| Stage | Rider state | Today | Our intervention |
|---|---|---|---|
| Disruption hits | Confusion — is this normal? | Vague or absent announcement | Severity immediately: minor vs 40-min |
| Assesses | Needs alternatives fast | Must re-plan from scratch under stress | Pre-computed alternatives from *here* |
| Re-plans | Low patience, poor input conditions | Typing a new trip while standing | One tap, no re-entry of the destination |
| Recovers | Wants ETA confidence | None | Honest revised arrival + confidence |

**Success:** decision made in under 30 seconds without typing.
**Failure:** we alert without severity or alternatives — a notification that says
"there is a delay" makes things worse, not better.

## J-04 — Exploratory: "is this route always like this?"
**Who:** U-01, U-03, and future planner/advocate users · **Problems:** PR-02, PR-08

Low frequency, high trust-building value. Someone choosing an apartment, changing shifts,
or arguing with the TTC. **This is the journey our segment layer uniquely serves**
(E-M01, E-M02) — and where we earn the credibility that makes J-01 and J-02 believable.

| Stage | Rider state | Today | Our intervention |
|---|---|---|---|
| Suspicion | "This route feels bad" | Only anecdote | Confirm or deny with history |
| Investigation | Wants where and when | Route-level dashboards only | Segment-level, by hour and day |
| Understanding | Wants why | Nothing | Cause breakdown (E-D02) |
| Action | Change route, time, or complain | — | Shareable evidence |

**Success:** the rider learns something true they could not have learned elsewhere.
**Failure:** we show terminal/yard artifacts as rider risk (PR-09) — confidently wrong,
and the fastest way to lose trust permanently (PR-08).

---

## What this implies

| Journey | Product shape | Needs realtime? | v1? |
|---|---|---|---|
| J-01 pre-trip | Distribution + departure advice | No — history suffices | **Yes** |
| J-02 at stop | Live gap, abandon threshold | **Yes**, surface only | Later |
| J-03 mid-trip | Severity + one-tap alternatives | Yes | Later |
| J-04 exploratory | Segment map + history | No | **Yes** |

**J-01 and J-04 need no realtime feed at all.** They are buildable today from historical
data, they are where our differentiation lives, and J-04 is the trust foundation for
everything else. That is the v1.
