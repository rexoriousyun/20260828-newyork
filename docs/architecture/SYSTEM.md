# System Architecture

What actually runs, as of M6. Planned components are marked; nothing here is aspirational
unless labelled.

---

## Data flow

```mermaid
flowchart TB
    subgraph src[Public sources - no API keys]
        CKAN[(Toronto Open Data / CKAN<br/>delay data, monthly)]
        GTFS[(TTC GTFS static<br/>236 routes, 9,402 stops)]
        RT[(GTFS-Realtime<br/>vehicles, trips, alerts)]
    end

    subgraph ing[Ingest]
        R[ckan.ts<br/>resolve resources by dataset id]
        D[delays.ts<br/>parse, repair mojibake]
        G[gtfs.ts<br/>stops, routes, cache archive]
        S1[segments.ts<br/>subway topology]
        S2[surface-segments.ts<br/>bus + streetcar topology]
    end

    subgraph dom[Domain]
        N[streets / stations / surface<br/>name normalisation]
        RES[surface-resolver<br/>location to stop group]
        B[bearing<br/>compass from geometry]
        A[attribute<br/>incident to segment]
        SC[score<br/>exposure + pooled severity]
    end

    DB[(SQLite via Prisma<br/>DelayIncident, Segment,<br/>Stop, Route, IngestRun)]

    API[Fastify API<br/>/routes /segments]
    WEB[React + Vite<br/>mobile-first segment map]

    CKAN --> R --> D --> DB
    GTFS --> G --> DB
    G --> S1 --> DB
    G --> S2 --> DB
    N --> RES --> A
    B --> A
    DB --> A --> DB
    DB --> SC --> API --> WEB
    RT -.->|not yet consumed| ing

    style RT stroke-dasharray: 5 4,color:#888
    style DB fill:#eef3f8,stroke:#5a7fa8
```

**GTFS-Realtime is verified live and deliberately unused.** J-02 and J-03 need it; both are
unbuilt. The dashed edge is a promise, not a component.

## The filtering funnel

Every exclusion below is a recorded decision, not a convenience. This is the diagram that
explains why 163,725 records become 576 confidently-scored segments.

```mermaid
flowchart TD
    A[163,725 raw incidents] -->|drop zero-minute<br/>E-D04| B[118,217 delayed<br/>72.2%]
    B -->|resolve location + direction<br/>D-10| C[70,186 attributed<br/>59.4% of delayed]
    B -.->|48,031 unattributed| X[Unresolved names,<br/>no direction recorded,<br/>terminal departures]
    C -->|exclude terminals, yards,<br/>garages, loops - D-06, D-12| D[69,221 through-rider]
    D --> E[18,982 segments]
    E --> F[6,511 with any data]
    F --> G[2,703 low confidence<br/>at least 5]
    G --> H[576 high confidence<br/>at least 30 - 3.1%]

    style X fill:#e8e8e2,stroke:#999,stroke-dasharray: 4 3
    style H fill:#d7ece0,stroke:#4a7a5f
```

The funnel is the product's honesty problem in one picture. **Only 3.1% of segments reach
high confidence**, which is why `P-03` governs the interface and why Q-A is the highest
open question.

## Scoring model

```mermaid
flowchart LR
    I[Incidents on a segment] --> EX[Exposure<br/>gap-minutes per month<br/>incidents per month]
    I --> CF{Sample size}
    CF -->|"< 5"| U[confidence: unknown<br/>no numbers published]
    CF -->|"5 to 29"| L[confidence: low]
    CF -->|">= 30"| HI[confidence: high]
    P[(All non-terminal incidents<br/>for this MODE)] --> SEV[Severity p50/p90/p95<br/>pooled per mode]
    EX --> OUT[Segment reliability]
    SEV --> OUT
    U --> OUT

    style U fill:#e8e8e2,stroke:#999,stroke-dasharray: 4 3
    style SEV fill:#f4f4f0,stroke:#bbb
```

**Exposure is segment-specific; severity is not.** Exposure persists across time periods
(rho 0.68), severity does not (rho 0.10 with only 3% ties). Publishing a per-segment p95
would be noise formatted as precision — `D-11`, the decision the measurements forced.

Severity pools **per mode**, never across: subway 9/17/23 minutes, surface 24/59/73.

## Audits as gates

Four reproducible checks. Two can fail a build; all four are how claims stay falsifiable
(`P-08`).

| Command | Asks | Threshold | Result |
|---|---|---|---|
| `audit:gap` | Is `Min Gap` trustworthy? | 95% coherence + completeness | **pass** — 95.2–99.6% |
| `audit:stability` | Does segment reliability persist? | rho > 0.5 | **pass on exposure** 0.68; severity 0.10 |
| `audit:coverage` | Can we place surface delay on a map? | beat 66.1% | **pass** — 76.6% |
| `npm test` | 50 unit tests | all pass | **pass** |

Thresholds are pre-registered **in the source**, so a verdict cannot be renegotiated after
seeing the numbers.

## What is not built

| | Needed for | Status |
|---|---|---|
| GTFS-Realtime consumption | J-02, J-03 | verified live, unused |
| Departure advice (M7) | J-01, U-02 | not started |
| Walk comparison | J-05, U-05 | needs routing data |
| Elevator / accessibility data | U-04, `D-07` | **nothing ingested** |
| Weather signal | `PR-13` | not started |

`D-07` commits to accessibility as a hard routing constraint and no data source is wired.
A decision that outran the build.

## Deployment note

Everything runs from public data with no keys. SQLite is a development choice; Prisma makes
the move to Postgres mechanical when segment aggregation outgrows it (`D-09`).
