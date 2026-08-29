# Design System

Derived from four product rules set 2026-08-28. Each is recorded in the decision log with a
kill condition — `D-15` to `D-18` — so they carry the same traceability as every other
decision here, even though they were set rather than derived:

1. **Mobile first.**
2. **Monotone for most; colour reserved for key information.**
3. **Data visualisation gets complex — start simple.**
4. **Look trustworthy. Nothing casual or decorative.**

These are not stylistic preferences layered on top of the research. They resolve open
questions the research had already raised, and they fixed a defect in what shipped.

---

## What rule 2 changed

The map shipped with a **five-band green-to-red ramp** applied to every segment. Under
"colour reserved for key information" that is backwards: colour was spent on *everything*,
so it marked nothing.

Reframing reliability as **status** rather than as a continuous series follows rule 2 — and
it happens to fix the accessibility defect. With one reserved hue against a neutral base
there is no rainbow to collide.

| | before | after |
|---|---|---|
| bands | 5 colours | 1 colour + neutral |
| worst adjacent pair (normal vision) | ΔE 15.7 | **ΔE 20.0** |
| "no data" vs "good", deuteranopia | **ΔE 14.1 — collision** | not comparable; different channel |

Rule 3 pushed the same direction. Four states could not clear all-pairs separation on
colour alone — the ramp needs colour to do work it cannot do. Three states can.

---

## The encoding

Three states. Each carries **two channels**, never colour alone, per the design concept.

**Greyscale is the map's structure and nothing else.** It is never borrowed to encode data,
so route states cannot use it — which is why unknown shares the route hue rather than
fading to grey.

**Transit stops keep their colour.** On a transit map a stop is key information, not
decoration, so the basemap's stop icons stay. Generic POIs — shops, restaurants,
attractions — are dropped: they are clutter here, and their sprites are coloured in ways
desaturation cannot reach.

One continuous **green → orange → red** scale across exposure, plus a separate state for
what we cannot measure.

| state | colour | second channel | meaning |
|---|---|---|---|
| **scored** | green → orange → red by exposure | heavier above the threshold | green is low waiting, red is high |
| **unknown** | scale's green, faded | **dashed, thinner, 45% opacity** | we cannot say |

Green at zero, orange at the threshold, red at the top — the reading everyone already knows
from traffic signals, so the encoding needs no teaching. Values are deliberately moderate:
an earlier version drove the severe end almost to black chasing colour-vision separation.
It validated, and it looked wrong. **A scale nobody wants to look at is not a safer scale.**

### Tokens

| role | light | dark |
|---|---|---|
| surface | `#f2f1ee` | `#16161a` |
| scale — low (0 min) | `#1a7f4c` | `#57c78a` |
| scale — threshold (45 min) | `#d9882c` | `#eda545` |
| scale — high (170 min+) | `#c33f2b` | `#e35f4e` |
| unknown | scale green at 45% | scale green at 45% |

The ramp spans 45 to 170 rider-wait minutes per month — the 95th percentile of segments
above the threshold — and clamps beyond, so one 415-minute outlier cannot flatten the ramp
for everything else.
| selection | `#1f6feb` | `#6ea8ff` |

**Validated, not eyeballed** (`dataviz` validator, all-pairs, both modes):

| check | light | dark |
|---|---|---|
| Green vs ramp start | PASS — ΔE 26.8 (protan) | PASS — ΔE 10.6 (deutan) |
| Green vs ramp end | PASS — ΔE 15.1 (protan) | PASS — ΔE 22.3 (deutan) |
| Ramp lightness monotonic | PASS — 1.72× span | PASS — 2.37× span |
| Contrast vs surface | PASS — all ≥ 3:1 | PASS — all ≥ 3:1 |

### Green and red is the worst pair in accessibility, and this scale accepts it knowingly

No moderate green-orange-red palette escapes the collision. The best separation available
here is **ΔE 7.2 green↔red** (green↔orange is a comfortable 11.0), which sits in the band
that is legal *only* alongside a second channel.

Two channels carry it: segments above the threshold render **45% heavier**, and the legend
names the scale in words rather than relying on the swatch.

The alternative was tested and rejected. Pushing the ends apart in lightness reaches
ΔE 15+, but produces a near-black "green" and a near-black severe end — trading an 8%
problem for a 100% one. Extreme values are not a fix; they move the failure.

| | green↔orange | green↔red | contrast |
|---|---|---|---|
| light | 11.0 | 7.2 | green 4.54, red 4.67, orange 2.53 |
| dark | 8.0 | 10.0 | all ≥ 4.9 |

Orange sits below 3:1 on the light surface. That obligates the visible-label relief, which
the legend and the sheet both provide — it is not dismissed.

**Lesson recorded:** the validator can pass a palette that fails on sight. It checks
separation, not whether a colour still reads as the colour it is meant to be.

### The basemap is desaturated

A colourful basemap makes rule 2 impossible: orange roads and green parks compete with the
one colour that carries meaning. The tile proxy converts the vendor style to greyscale on
the way through, so the only colour on screen is data.

---

## Type

Numbers are the product, so the type system serves numbers first.

- **Tabular figures** wherever a value can change or be compared, so digits do not jitter.
- **One weight step** between the answer and everything else. The answer is not bigger *and*
  bolder *and* darker — that reads as marketing.
- **No decorative faces.** System UI stack: it is what the phone's own apps use, and rule 4
  is served by looking like infrastructure rather than like a brand.

## Surfaces and depth

- One elevation: the map is the ground, the sheet sits on it. No nested cards.
- Shadows position, they do not decorate — a single soft shadow on the sheet, nothing else.
- Radii are modest and consistent. Rounded-everything reads casual (rule 4).

## Mobile first

- The sheet occupies the bottom, in the thumb zone; the map keeps the full viewport behind it.
- Tap targets are the invisible 22px hit line under each 3–7px route line, never the line itself.
- Controls float over the map rather than consuming a header, because vertical space is the
  scarce resource on a phone.
- Everything is legible one-handed at arm's length in daylight — which is another reason
  contrast is a gate, not a preference.

## What this rules out

- Gradients, glows, and decorative illustration
- A second accent colour introduced for variety
- Colour used for route identity (that is what the basemap and labels are for)
- Any state that exists only as a colour
