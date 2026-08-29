import { describe, it, expect } from "vitest";
import {
  headwayMinutes,
  MIN_TRIPS_IN_BAND,
  NOTABLE_HEADWAY_MINUTES,
  notableWait,
  outsideMinutes,
  waitsOn,
  type WaitAtStop,
} from "../wait.js";
import { WEEKDAYS_PER_MONTH } from "../frequency.js";
import { BANDS, bandOf } from "../time-bands.js";
import type { Leg } from "../csa.js";

const band = (id: string) => BANDS.find((b) => b.id === id)!;

/** Builds a frequency table holding `perWeekday` trips on one segment in one band. */
function freq(bandId: string, perWeekday: number) {
  return {
    tripsPerMonth: new Map<string, number>(),
    tripsPerMonthInBand: new Map([[`52|A|B|${bandId}`, perWeekday * WEEKDAYS_PER_MONTH]]),
  };
}

describe("headwayMinutes", () => {
  it("divides the band by the trips inside it", () => {
    // 18 trips across the three-hour am peak is one every ten minutes.
    const h = headwayMinutes(freq("am-peak", 18), "52", "A", "B", band("am-peak"));
    expect(h).toBeCloseTo(10, 5);
  });

  it("is null when the band is too thin for a mean gap to mean anything", () => {
    // Two trips in the six-hour night band would compute "every 180 minutes",
    // which describes the band rather than the service.
    expect(headwayMinutes(freq("night", 2), "52", "A", "B", band("night"))).toBeNull();
    expect(
      headwayMinutes(freq("night", MIN_TRIPS_IN_BAND), "52", "A", "B", band("night")),
    ).not.toBeNull();
  });

  it("is null for a segment with no service in that band", () => {
    expect(headwayMinutes(freq("am-peak", 18), "52", "A", "B", band("night"))).toBeNull();
    expect(headwayMinutes(freq("am-peak", 18), "52", "X", "Y", band("am-peak"))).toBeNull();
  });

  it("keys on the segment, so the two directions are different service", () => {
    // A rider at a stop is not waiting for "a 52", they are waiting for one
    // going their way. Northbound frequency must not answer for southbound.
    expect(headwayMinutes(freq("midday", 12), "52", "B", "A", band("midday"))).toBeNull();
  });
});

const ride = (from: string, to: string, departAt: number, arriveAt: number, routeId: string): Leg => ({
  kind: "ride", fromStop: from, toStop: to, departAt, arriveAt, routeId,
  tripId: "t", stopIds: [from, to],
});
const walk = (from: string, to: string, departAt: number, arriveAt: number): Leg => ({
  kind: "walk", fromStop: from, toStop: to, departAt, arriveAt,
});

describe("waitsOn", () => {
  const h = 10 * 3600; // 10am, midday

  it("does not count the origin as a wait", () => {
    // A rider does not stand at their own front door. When they leave is D-24's
    // subject, not this one's.
    const legs = [ride("A", "B", h, h + 600, "52")];
    expect(waitsOn(legs, freq("midday", 12))).toHaveLength(0);
  });

  it("measures the gap between arriving and the next departure", () => {
    const legs = [ride("A", "B", h, h + 600, "52"), ride("B", "C", h + 900, h + 1500, "52")];
    const w = waitsOn(legs, freq("midday", 12))[0]!;
    expect(w.scheduledMinutes).toBe(5);
    expect(w.legIndex).toBe(1);
  });

  it("carries the headway of the segment being boarded", () => {
    // 12 trips across the six-hour midday band is one every 30 minutes.
    const legs = [ride("X", "A", h, h + 600, "52"), ride("A", "B", h + 900, h + 1500, "52")];
    expect(waitsOn(legs, freq("midday", 12))[0]!.headwayMinutes).toBeCloseTo(30, 5);
  });

  it("calls a wait for a bus outside and a wait for a train not", () => {
    const surface = [ride("X", "A", h, h + 600, "52"), ride("A", "B", h + 900, h + 1500, "52")];
    const subway = [ride("X", "A", h, h + 600, "52"), ride("A", "B", h + 900, h + 1500, "1")];
    expect(waitsOn(surface, freq("midday", 12))[0]!.outdoors).toBe(true);
    expect(waitsOn(subway, freq("midday", 12))[0]!.outdoors).toBe(false);
  });

  it("bands by the departure, so a trip past midnight is read as night", () => {
    // GTFS service days run past 24:00 — a 25:10 departure is one a rider would
    // call 01:10, and the headway must come from the band they are standing in.
    const legs = [ride("X", "A", 25 * 3600, 25 * 3600 + 600, "52"),
                  ride("A", "B", 25 * 3600 + 900, 25 * 3600 + 1500, "52")];
    expect(waitsOn(legs, freq("night", 12))[0]!.bandLabel).toBe(bandOf(1).label);
  });
});

describe("outsideMinutes", () => {
  const h = 10 * 3600;
  const names: Record<string, string> = {
    P1: "ST GEORGE STATION - NORTHBOUND PLATFORM",
    P2: "ST GEORGE STATION - EASTBOUND PLATFORM",
  };
  const nameOf = (id: string): string => names[id] ?? id;
  const w = (scheduledMinutes: number, outdoors: boolean): WaitAtStop => ({
    legIndex: 1, scheduledMinutes, headwayMinutes: null, bandLabel: "", outdoors,
  });

  it("adds walking to waiting on the street", () => {
    const legs = [walk("A", "B", h, h + 360), ride("B", "C", h + 600, h + 1800, "52")];
    expect(outsideMinutes(legs, [w(4, true)], nameOf)).toBe(10);
  });

  it("does not count a wait on a subway platform", () => {
    const legs = [ride("A", "B", h, h + 600, "52"), ride("B", "C", h + 900, h + 1500, "1")];
    expect(outsideMinutes(legs, [w(5, false)], nameOf)).toBe(0);
  });

  it("does not count a transfer walk between two platforms of one station", () => {
    // Line 1 to Line 2 at St George is a footpath in the graph and a corridor
    // in life. Counting it put five minutes of January on a trip that never
    // left the building.
    const legs = [ride("A", "P1", h, h + 600, "1"), walk("P1", "P2", h + 600, h + 900),
                  ride("P2", "B", h + 900, h + 1500, "2")];
    expect(outsideMinutes(legs, [w(0, false)], nameOf)).toBe(0);
  });

  it("counts a walk that leaves one station for another", () => {
    const legs = [walk("P1", "Z", h, h + 300)];
    expect(outsideMinutes(legs, [], nameOf)).toBe(5);
  });

  it("does not count riding, however long the ride is", () => {
    // Time on a vehicle is time out of the weather. A 70-minute trip that is
    // 68 minutes aboard is a different January proposition from one that is not.
    const legs = [ride("A", "B", h, h + 4200, "52")];
    expect(outsideMinutes(legs, [], nameOf)).toBe(0);
  });
});

describe("notableWait", () => {
  const w = (headwayMinutes: number | null): WaitAtStop => ({
    legIndex: 1, scheduledMinutes: 4, headwayMinutes, bandLabel: "", outdoors: true,
  });

  it("ignores service frequent enough that the next one absorbs a no-show", () => {
    expect(notableWait([w(8), w(NOTABLE_HEADWAY_MINUTES - 1)])).toBeNull();
  });

  it("returns the worst of several, not the first", () => {
    expect(notableWait([w(22), w(41), w(26)])!.headwayMinutes).toBe(41);
  });

  it("ignores a wait whose headway could not be measured", () => {
    // Unmeasured must not become a verdict in either direction (P-03).
    expect(notableWait([w(null)])).toBeNull();
  });
});
