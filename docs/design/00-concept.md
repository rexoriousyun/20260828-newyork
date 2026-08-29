# Design Concept

**Status:** proposed, 2026-08-28. No design concept existed before this — the project had
research, decisions and code, and the interface was assembled from principles without a
governing idea. This names one.

---

## The concept

> ## Two channels, always: what we think, and how sure we are.

Every transit app shows a number. None of them show whether to believe it. A countdown
that resets upward, an ETA that was never a promise, an on-time metric that "hides more
than it reveals" — riders have learned that transit numbers are confident and wrong, and
have adjusted by trusting none of them (PR-08).

This product's distinguishing move is not that its numbers are better. It is that
**confidence is a first-class visual dimension, carried alongside every value.** Not a
disclaimer, not a footnote in a details pane — a channel the eye reads at the same moment
it reads the number.

That is not a stylistic preference. It falls out of the data: **86% of bus segments cannot
be scored** (E-D12). A product that mostly does not know, that hides not-knowing, is a
liar. A product that mostly does not know, and *says so legibly*, is the only honest
transit tool in the city.

### What the concept commits us to

| | |
|---|---|
| **Every value carries its confidence** | in the same glance, not one tap away |
| **Unknown is a designed state** | not an empty state, not an error, not a pale success |
| **The method hides; the doubt does not** | P-09's line, expressed visually |
| **Voice is part of the interface** | "25 minutes — go back inside" is design work |

### What it rules out

- Any single-channel encoding of reliability (colour alone, number alone)
- Filling gaps with plausible estimates to make the map look complete
- Confidence expressed only as a word in a detail panel
- A "clean" default view achieved by hiding the segments we cannot speak to

---

## Why the current interface does not yet express it

The map shipped in M6 was assembled from principles one screen at a time. It gets the
*intent* right in three places and expresses it three different ways:

| surface | how "unknown" appears |
|---|---|
| map line | dashed grey |
| list bar (earlier build) | diagonal hatch |
| detail sheet | a sentence |

Three treatments, one meaning. That is not a system — it is three good instincts. The
concept's job is to collapse them into one recognisable language a rider learns once.

---

## A defect the concept immediately exposes

The reliability scale currently in the product is a green-to-red ramp. Simulating
colour-vision deficiency on the six shipped colours (CIE76 ΔE; under ~20 is hard to
separate at a glance):

| pair | normal | deuteranopia | protanopia |
|---|---|---|---|
| 80-140 vs 140+ | **15.7** | 15.8 | 16.0 |
| 15-40 vs 40-80 | 25.9 | **7.0** | 13.3 |
| 40-80 vs 80-140 | 27.8 | **15.6** | — |
| **under 15 vs no data** | 44.2 | **14.1** | **19.6** |

Two findings, one of them serious:

1. **The scale collides with itself even for normal vision** — the top two bands are 15.7
   apart, so "bad" and "worst" are not reliably separable.
2. **"Under 15" and "no data" collide under deuteranopia.** That is the single most
   important distinction in the product — the one `P-03` exists to protect — failing for
   roughly 8% of men. On the map a dashed line rescues it. In a legend, a list row, or a
   filled bar, nothing does.

The dashed line was a lucky instinct, not a system. Under the concept it becomes a rule:
**confidence is never carried by colour alone.**

---

## The design work this project needs

Ordered by what unblocks the most, not by visibility.

> **Status pass, 2026-08-29.** Seven of the ten are built. What remains is either a genuine
> open question (8) or the polish that a rider session should inform rather than precede
> (9). Each item below carries its outcome.
>
> | | item | state |
> |---|---|---|
> | 1 | the confidence system | **done** — `D-26`: unknown is a separate dashed layer, never a stop on the ramp |
> | 2 | the reliability scale, rebuilt | **done** — `D-23`, validated numerically; a near-black "green" got through by eye first |
> | 3 | the answer-first component | **done** — `D-05`, `D-20`, `D-33` |
> | 4 | information architecture | **done** — M9; explore is a mode, not the home screen |
> | 5 | content design and voice | **mostly** — rider phrasing throughout (`D-21`, `D-24`, `D-34`), but `min/mo` survives in the ranking on purpose: it is what **Q-C** tests |
> | 6 | disruption and day-of design | **done** — `D-29`, clustering 18 alerts into one event |
> | 7 | accessibility as a designed path | **done** — `D-30` routes around, rather than warning |
> | 8 | seasonal framing | **open** — `D-34` put minutes-outside on the card, which is the measurement a seasonal treatment would need. Whether the interface should change with the season is still undecided |
> | 9 | motion and state | not started — low, and better informed by a session than before one |
> | 10 | identity | **done** — `D-35` |

### 1. The confidence system `critical`
One visual language for certainty, applied to map lines, list rows, numbers, itineraries
and forecasts. Needs a redundant non-colour channel (pattern, weight, or an explicit mark)
so it survives CVD and greyscale. Everything else depends on this existing.

### 2. The reliability scale, rebuilt `critical`
A sequential ramp that separates cleanly for normal, deuteranopic and protanopic vision,
holds up in light and dark, and keeps "unknown" categorically outside the ramp rather than
at one end of it. Must be validated numerically, not by eye — the current one passed by eye.

### 3. The answer-first component `high`
`P-09` is currently a bespoke layout in one sheet. It needs to be one component: answer,
optional caveat that never hides, and a quiet affordance to the evidence. Used by every
surface that states a number.

### 4. Information architecture for the trip planner `high`
`D-14` commits to a Google-Maps-shaped app. That needs a shell nobody has designed: search
and origin/destination entry, itinerary results ranked by reliability, trip detail with the
forecast, and the explore map demoted to a mode rather than the home screen.

### 5. Content design and voice `high`
The honesty is carried in words as much as pixels. "Costs riders 25 minutes of waiting a
month" is an analyst's sentence; "you'll usually wait 6 minutes here, sometimes 20" is a
rider's. Needs rules for number formatting, rounding, hedging, and how to say *we don't
know* without sounding broken — the difference Q-A turns on.

### 6. Disruption and day-of design `medium`
Alerts cluster: one incident produced nine route alerts (E-D15). Riders need the event, not
the nine. Needs a model for severity, freshness, and how a live disruption overrides a
historical forecast on screen.

### 7. Accessibility as a designed path `medium`
U-04 has no interface at all, and elevator data exists (E-D15). Needs the accessible-route
filter, how an unusable station reads on the map, and what happens when status is unknown —
plus contrast, target sizes, and colour-independence throughout.

### 8. Seasonal framing `medium`
`PR-13`: a 26-minute wait is information in July and a safety decision in January. Whether
the interface changes with the season is an open design question, not a decided one.

### 9. Motion and state `low`
What changes when data refreshes, how staleness reads, and transitions between map, results
and detail. Low priority but it is where "feels like a real app" is won.

### 10. Identity `low` — **closed by D-35**
The project has no name. For portfolio purposes it needs one, plus a mark and a typographic
voice. Cheap, and it makes the case study read as a product rather than an exercise.

*Resolved 2026-08-29:* **Reliable Transit**, taken from the repository rather than invented,
with a monotone mark. See `D-35` — including why the name is the product owner's to change.

---

## The one-screen test

If a rider looks at any screen for two seconds and cannot tell **how much to trust what
they are seeing**, the concept has not been applied to that screen.
