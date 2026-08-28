# User Flows

Screen-level flows for each journey. **Built** flows describe what runs today; **proposed**
flows are design intent and will change once D-08 closes.

Every flow marks its `P-09` boundary — where the machinery hides — and the points where
uncertainty must surface regardless.

---

## F-01 — Exploratory *(J-04 · U-02, U-04, U-05)* — **BUILT**

The only flow shipped. Entry is a route, not a trip, because this journey answers "is this
route always like this?" rather than "how do I get there?"

```mermaid
flowchart TD
    A[Open app] --> B[Route picker<br/>ranked by data coverage]
    B --> C{Route has<br/>scored segments?}
    C -->|no| D[Route not listed<br/>404 routes qualify]
    C -->|yes| E[Coverage banner<br/>'15 of 50 have enough data']
    E --> F[Segment list<br/>colour = wait caused per month]
    F --> G{Filter by<br/>day or hour?}
    G -->|yes| F
    G -->|no| H[Tap a segment]
    H --> I{Confidence}
    I -->|unknown| J["We don't have enough data<br/>on this stretch to say"]
    I -->|low| K[Answer + 'based on limited data']
    I -->|high| L[Answer, one sentence]
    K --> M[Why this number?]
    L --> M
    M --> N[Sample, window, filters,<br/>pooled-severity rationale, causes]

    style J fill:#e8e8e2,stroke:#999,stroke-dasharray: 4 3
    style L fill:#d7ece0,stroke:#4a7a5f
    style N fill:#f4f4f0,stroke:#bbb
```

**P-09 boundary:** everything from `M` onward is deferred. Nodes `J` and `K` are *not*
deferrable — they are the claim, not the method.

**Known weakness:** for a bus route, most segments land on `J`. That is Q-A.

---

## F-02 — Pre-trip forecast *(J-01 · U-02)* — **PROPOSED (M7)**

The forecast flow `D-13` puts at the centre of the product. Note there is **no route
choice** — a captive rider has one route; asking them to pick is asking a question they
cannot answer differently.

```mermaid
flowchart TD
    A[Open app] --> B{Saved trip?}
    B -->|yes| C[Load usual trip]
    B -->|no| D[Pick origin stop + destination]
    D --> C
    C --> E[Enter arrival deadline]
    E --> F[Compute departure from<br/>exposure + pooled severity]
    F --> G{Enough data<br/>on this trip?}
    G -->|no| H["We can't forecast this trip yet"<br/>show what is known]
    G -->|yes| I["Leave by 8:12<br/>to arrive 9:00, 90% of the time"]
    I --> J{Rider wants<br/>more certainty?}
    J -->|yes| K[Show 95% departure<br/>and the extra cost in minutes]
    J -->|no| L[Done — no re-checking]
    I --> M[Why this number?]
    M --> N[Percentile basis, sample,<br/>segments included]

    style H fill:#e8e8e2,stroke:#999,stroke-dasharray: 4 3
    style I fill:#d7ece0,stroke:#4a7a5f
    style N fill:#f4f4f0,stroke:#bbb
```

**Design commitments:** a departure *time*, never a duration. Confidence is stated on the
face (`P-01`). The buffer's cost is shown, because U-02's current strategy is an hour a
week of unpaid insurance and they deserve to see what they are buying.

**Open:** Q-C — whether "90% of the time" reads as reassurance or as hedging.

---

## F-03 — Downtown comparison *(J-05 · U-05)* — **PROPOSED**

The only flow where "which option" is a real question (E-D14). It must resolve faster than
looking up the street, or it has failed.

```mermaid
flowchart TD
    A[Open at a stop] --> B[Detect stop + destination]
    B --> C[Typical wait here, now]
    B --> D[Walk time to destination]
    C --> E{Wait + ride<br/>vs walk}
    D --> E
    E -->|walk wins| F["Walk. 22 min,<br/>vs ~18 min waiting"]
    E -->|transit wins| G["Wait. Typically 6 min,<br/>walk is 24"]
    E -->|too close| H["About the same —<br/>walk if you'd rather move"]
    F --> I[Why this number?]
    G --> I
    H --> I

    style F fill:#f2e2a8,stroke:#a08a3a
    style G fill:#d7ece0,stroke:#4a7a5f
    style H fill:#f4f4f0,stroke:#bbb
```

**Design commitment:** the app must be willing to say **walk**. A transit app that never
recommends against transit is not trusted on the occasions it matters.

**Scope:** downtown only. Citywide comparison would import the New York redundancy
assumption (`D-13`).

---

## F-04 — At the stop *(J-02 · U-02)* — **PROPOSED, blocked on realtime**

The most acute journey and the least built. In January this is a safety decision, not a
convenience one (`PR-13`).

```mermaid
flowchart TD
    A[Open at a stop] --> B{Realtime<br/>available?}
    B -->|subway| C["No live data for the subway —<br/>here is the typical wait"]
    B -->|surface| D[Live gap, not vehicle ETA]
    D --> E{Gap growing?}
    E -->|yes| F["Bunching. Gap now ~18 min"]
    E -->|no| G["~6 min"]
    F --> H{Past abandon<br/>threshold?}
    H -->|yes| I["~18 min. Go back inside —<br/>we'll still be here"]
    H -->|no| G
    C --> J[Why this number?]
    G --> J
    I --> J

    style C fill:#e8e8e2,stroke:#999,stroke-dasharray: 4 3
    style I fill:#f2e2a8,stroke:#a08a3a
```

**Design commitment:** show the **gap**, never a vehicle countdown. The countdown that
resets upward is the ghost bus, and mirroring it makes us the thing riders already
distrust.

**Never deferred:** that we cannot see subway vehicles at all (E-D06).

---

## What every flow shares

1. **One answer per screen.** Everything that produced it waits behind *why this number*.
2. **Unknown is a destination, not an error.** Four of these flows have an explicit
   not-enough-data branch, styled differently from every success state.
3. **No flow asks the rider to choose a route** except F-03, which is downtown-only. That
   is `D-13` expressed as interaction rather than as prose.
