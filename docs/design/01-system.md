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

| state | colour | second channel | meaning |
|---|---|---|---|
| **typical** | neutral ink | solid, base weight | we know, and it is unremarkable |
| **unreliable** | reserved red | solid, heavier weight | we know, and it costs you |
| **unknown** | neutral grey | **dashed** | we cannot say |

Unknown is deliberately *outside* the ramp, not at one end of it. It is a different kind of
statement, not a low value.

### Tokens

| role | light | dark |
|---|---|---|
| surface | `#f2f1ee` | `#16161a` |
| typical | `#33332f` | `#e5e5df` |
| unreliable | `#b03217` | `#e35f3f` |
| unknown | `#87877f` | `#8a8a83` |
| selection | `#1f6feb` | `#6ea8ff` |

**Validated, not eyeballed** (`dataviz` validator, all-pairs, both modes):

| check | light | dark |
|---|---|---|
| CVD separation | PASS — ΔE 12.4 (protan) | PASS — ΔE 9.6 (protan) |
| Normal-vision floor | PASS — ΔE 20.0 | PASS — ΔE 16.9 |
| Contrast vs surface | PASS — all ≥ 3:1 | PASS — all ≥ 3:1 |

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
