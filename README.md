# Reliable Transit — Toronto

A reliability-aware view of the TTC: not "how fast is this route" but **"how likely is it
to actually work, and where does it break."**

## The premise

Transit unreliability is not random. Ranking TTC stations by delay independently across
2025 and 2026 gives a Spearman correlation of **0.78** — bad places stay bad. That makes
unreliability predictable, and therefore routable.

Two findings shape the product:

- **The rider's wait is not the vehicle's delay.** Median bus headway gap during an
  incident is 26 minutes against 13 minutes of vehicle lateness; **83.8% of bus incidents
  carry the bunching signature.** Every public tool reports the smaller number.
- **Nobody publishes reliability below the route level.** Reliability-aware TTC routing
  already exists; segment-level reliability does not. That gap is the product.

## Where the reasoning lives

Product decisions are not re-argued from opinion. `docs/ux/` holds the chain:

```
Evidence -> Problem -> Principle -> Decision -> Implementation
```

Start at [`docs/ux/README.md`](docs/ux/README.md). Every decision cites a principle,
every principle cites evidence, and every decision records what would reverse it.

## Data sources

All public, all verified live 2026-08-28, no API keys required.

| Source | Use | Notes |
|---|---|---|
| TTC delay data (subway/bus/streetcar) | Historical reliability | Monthly refresh, current to 2026-07-31 |
| GTFS static | Network topology, geometry | 236 routes, 9,402 stops |
| GTFS-RT | Live positions, trip updates | Surface only — **no subway realtime** |

Known limits, treated as design constraints rather than footnotes: the subway has no
realtime feed, 34% of surface delay records cannot be geocoded, and 65% of delay records
are zero-minute non-events. See `docs/ux/01-evidence.md`.

## Status

Research and UX foundation complete. Implementation not started.
