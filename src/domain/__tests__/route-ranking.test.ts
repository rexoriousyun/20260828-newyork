import { describe, it, expect } from "vitest";
import { rankRoutes, PARTIAL_COVERAGE, type RouteHarmInput } from "../route-ranking.js";

const route = (o: Partial<RouteHarmInput> & { routeId: string }): RouteHarmInput => ({
  mode: "bus", segmentCount: 100, gapMinutesPerMonth: 0, measuredSegments: 100,
  leadingCause: null, neverCameShare: null, name: o.routeId, ...o,
});

describe("rankRoutes", () => {
  it("ranks by the minutes a route costs riders, highest first", () => {
    const out = rankRoutes([
      route({ routeId: "a", gapMinutesPerMonth: 500 }),
      route({ routeId: "b", gapMinutesPerMonth: 2500 }),
      route({ routeId: "c", gapMinutesPerMonth: 1500 }),
    ]);
    expect(out.get("surface")!.map((r) => r.routeId)).toEqual(["b", "c", "a"]);
    expect(out.get("surface")!.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("keeps subway and surface in separate lists", () => {
    // Across the top of the real ranking subway sits at 100% coverage and buses
    // near 51%, so one list would rank the subway worst for being best recorded.
    const out = rankRoutes([
      route({ routeId: "1", mode: "subway", gapMinutesPerMonth: 3650 }),
      route({ routeId: "504", mode: "bus", gapMinutesPerMonth: 2795, measuredSegments: 49 }),
      route({ routeId: "501", mode: "streetcar", gapMinutesPerMonth: 2410, measuredSegments: 60 }),
    ]);
    expect([...out.keys()].sort()).toEqual(["subway", "surface"]);
    expect(out.get("subway")!.map((r) => r.routeId)).toEqual(["1"]);
    expect(out.get("surface")!.map((r) => r.routeId)).toEqual(["504", "501"]);
  });

  it("marks a thinly measured route as a floor rather than correcting it", () => {
    // Dividing by coverage would invent the minutes we failed to attribute.
    const out = rankRoutes([route({ routeId: "x", gapMinutesPerMonth: 1000, measuredSegments: 40 })]);
    const r = out.get("surface")![0]!;
    expect(r.coverage).toBe(0.4);
    expect(r.partial).toBe(true);
    expect(r.gapMinutesPerMonth).toBe(1000);
  });

  it("holds the registered bar for calling a figure partial", () => {
    const at = rankRoutes([route({ routeId: "x", measuredSegments: PARTIAL_COVERAGE * 100 })]);
    const below = rankRoutes([route({ routeId: "x", measuredSegments: PARTIAL_COVERAGE * 100 - 1 })]);
    expect(at.get("surface")![0]!.partial).toBe(false);
    expect(below.get("surface")![0]!.partial).toBe(true);
  });

  it("treats a route with no segments as uncovered rather than dividing by zero", () => {
    const out = rankRoutes([route({ routeId: "x", segmentCount: 0, measuredSegments: 0 })]);
    expect(out.get("surface")![0]!.coverage).toBe(0);
  });
});
