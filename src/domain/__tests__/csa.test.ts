import { describe, it, expect } from "vitest";
import { parseGtfsTime, type ConnectionSet } from "../connections.js";
import { buildFootpaths } from "../footpaths.js";
import { plan } from "../csa.js";

describe("parseGtfsTime", () => {
  it("reads a normal time", () => {
    expect(parseGtfsTime("08:30:00")).toBe(8 * 3600 + 30 * 60);
  });

  // GTFS legitimately uses hours past 24 for trips running after midnight.
  // Wrapping these would put a 1am departure before the previous evening.
  it("does not wrap past midnight", () => {
    expect(parseGtfsTime("25:15:00")).toBe(25 * 3600 + 15 * 60);
    expect(parseGtfsTime("30:35:00")).toBe(30 * 3600 + 35 * 60);
  });

  it("returns -1 on unparseable input", () => {
    expect(parseGtfsTime("")).toBe(-1);
    expect(parseGtfsTime("nope")).toBe(-1);
  });
});

/**
 * A hand-built four-stop network:
 *   A --routeR--> B --routeR--> C     (one vehicle, no transfer)
 *   A --routeS--> D                   (a dead end)
 * plus a walkable pair C/D.
 */
function fixture(): { c: ConnectionSet; paths: ReturnType<typeof buildFootpaths> } {
  const stopIds = ["A", "B", "C", "D"];
  const stopIndex = new Map(stopIds.map((s, i) => [s, i]));
  const t = (h: number, m: number): number => h * 3600 + m * 60;

  const rows = [
    { dep: t(9, 0), arr: t(9, 10), from: 0, to: 1, trip: 0 },
    { dep: t(9, 12), arr: t(9, 20), from: 1, to: 2, trip: 0 },
    { dep: t(9, 5), arr: t(9, 40), from: 0, to: 3, trip: 1 },
  ].sort((a, b) => a.dep - b.dep);

  const c: ConnectionSet = {
    depTime: Int32Array.from(rows.map((r) => r.dep)),
    arrTime: Int32Array.from(rows.map((r) => r.arr)),
    fromStop: Int32Array.from(rows.map((r) => r.from)),
    toStop: Int32Array.from(rows.map((r) => r.to)),
    trip: Int32Array.from(rows.map((r) => r.trip)),
    count: rows.length,
    stopIds,
    stopIndex,
    tripIds: ["tripR", "tripS"],
    tripRoute: ["R", "S"],
  };

  // Far enough apart that nothing is walkable, so ride logic is tested alone.
  const lat = Float64Array.from([43.6, 43.7, 43.8, 43.9]);
  const lon = Float64Array.from([-79.4, -79.4, -79.4, -79.4]);
  return { c, paths: buildFootpaths(lat, lon) };
}

describe("plan", () => {
  it("finds a journey and reports its arrival", () => {
    const { c, paths } = fixture();
    const j = plan(c, paths, "A", "C", 8 * 3600);
    expect(j).not.toBeNull();
    expect(j!.arriveAt).toBe(9 * 3600 + 20 * 60);
  });

  // Staying on one vehicle through an intermediate stop is one leg, not two,
  // and must not be charged a transfer.
  it("collapses consecutive connections on the same trip into one leg", () => {
    const { c, paths } = fixture();
    const j = plan(c, paths, "A", "C", 8 * 3600)!;
    expect(j.legs.filter((l) => l.kind === "ride")).toHaveLength(1);
    expect(j.transfers).toBe(0);
    expect(j.legs[0]!.fromStop).toBe("A");
    expect(j.legs[0]!.toStop).toBe("C");
  });

  it("returns null when the target is unreachable", () => {
    const { c, paths } = fixture();
    expect(plan(c, paths, "C", "A", 8 * 3600)).toBeNull();
  });

  it("returns null when departure is after every connection", () => {
    const { c, paths } = fixture();
    expect(plan(c, paths, "A", "C", 23 * 3600)).toBeNull();
  });

  it("returns null for an unknown stop", () => {
    const { c, paths } = fixture();
    expect(plan(c, paths, "A", "ZZZ", 8 * 3600)).toBeNull();
  });
});

describe("buildFootpaths", () => {
  it("links stops within walking distance and nothing further", () => {
    // Two stops ~80m apart, a third ~2km away.
    const lat = Float64Array.from([43.6532, 43.6539, 43.6712]);
    const lon = Float64Array.from([-79.3832, -79.3832, -79.3832]);
    const p = buildFootpaths(lat, lon);
    const neighbours = (i: number): number[] =>
      Array.from(p.target.slice(p.offset[i]!, p.offset[i + 1]!));
    expect(neighbours(0)).toEqual([1]);
    expect(neighbours(2)).toEqual([]);
  });
});
