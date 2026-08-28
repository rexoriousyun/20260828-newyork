# Design System

Derived from four rules given by the product owner, 2026-08-28:

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

| state | colour | second channel | meaning |
|---|---|---|---|
| **typical** | route green, flat | solid, base weight | we know, and it is unremarkable |
| **unreliable** | reserved hue, **graded light→dark** | solid, heavier weight | we know, and it costs you — the darker, the worse |
| **unknown** | route green, faded | **dashed, thinner, 45% opacity** | we cannot say |

**Green is identity, not a verdict.** It means "this is your route", the way a line colour
does on any transit map — not "this is good". That distinction is what lets unknown share
the hue without reading as reassurance: three non-colour channels (dash, weight, opacity)
carry the difference, and the legend names it.

### Why only one state gradates

A flat colour above the threshold hid real magnitude: 50 minutes a month and 200 minutes a
month are not the same problem, and rendering them identically threw away information the
data actually supports.

So the gradient goes **inside** the reserved colour, and nowhere else. Typical stays flat
because its whole message is "unremarkable" — grading it would spend attention on
differences that do not matter. Unknown stays flat because it is not a magnitude at all.

Colour still marks exactly one thing. Within that one thing, it now says *how much*.

Unknown is deliberately *outside* the ramp, not at one end of it. It is a different kind of
statement, not a low value.

### Tokens

| role | light | dark |
|---|---|---|
| surface | `#f2f1ee` | `#16161a` |
| route (typical) | `#1e8f59` | `#7fd3a1` |
| unreliable (45 min) | `#a32a14` | `#b8402e` |
| unreliable (mid) | `#82170e` | `#d64c33` |
| unreliable (170 min+) | `#5e0f08` | `#f25c3c` |
| unknown | route hue at 45% | route hue at 45% |

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

### Green and red is the worst pair in accessibility. The fix is lightness, in the right direction.

Every green tested against a red ramp collided on hue — ΔE 3.0–7.0 under protanopia, the
textbook failure. **Colour-vision deficiency destroys hue but preserves lightness**, so the
two must separate by value.

The first attempt pushed the *green* below the ramp. It validated cleanly and was wrong:
at relative luminance 0.019 the green read as **black**, and a near-black line beside a
dark red is confusing for everyone — trading an 8% problem for a 100% one.

The correct move was the opposite. **Green sits above the ramp; severity moves away from
it.** On a light ground that means severity darkens; on a dark ground it brightens. Same
principle, opposite direction, because distance from the route colour is what encodes
severity — not "red is dark".

| | route green | ramp | direction |
|---|---|---|---|
| light | 0.206 | 0.095 → 0.027 | darkens |
| dark | 0.537 | 0.141 → 0.269 | brightens |

Boundaries: light ΔE 10.4 (start) / 25.3 (end); dark 25.5 / 14.4. Every step clears 3:1.

**Lesson recorded:** the validator can pass a palette that fails on sight. It checks
separation, not whether a colour still reads as the colour it is meant to be.

Adjacent ramp steps measure ΔE 5.0, which the categorical validator flags. That check does
not apply — a gradient's neighbours are *supposed* to be close, and a sequential ramp is
judged by monotonic lightness. Only the boundaries above are categorical.

The validator also reports two FAILs, both expected and both accepted: *lightness band* and
*chroma floor* flag colours that "read gray". Ours are deliberately grey — that is rule 2.
Those checks scope to categorical palettes, where every slot is an identity competing for
attention. Here the neutrals are the ground, and one hue is the figure.

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
