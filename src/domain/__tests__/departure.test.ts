import { describe, it, expect } from "vitest";
import { departureAdvice, latestDeparture } from "../departure.js";

const h = (hh: number, mm = 0): number => hh * 3600 + mm * 60;

describe("departureAdvice", () => {
  const base = {
    departAt: h(8, 11),
    arriveAt: h(8, 57),
    arriveBy: h(9, 0),
    disruptionRisk: 1 / 150,
    oneInTrips: 150,
    severityCoveredMinutes: 41,
    severityTypicalMinutes: 24,
  };

  it("reports the slack a normal day leaves", () => {
    expect(departureAdvice(base).slackMinutes).toBe(3);
  });

  it("states the disrupted arrival, not just the rate", () => {
    const a = departureAdvice(base);
    expect(a.disrupted).not.toBeNull();
    expect(a.disrupted!.arriveAt).toBe(h(9, 21));
    expect(a.disrupted!.oneInTrips).toBe(150);
  });

  it("prices the buffer that would cover a bad morning", () => {
    const a = departureAdvice(base);
    // 41 minutes of severity against 3 minutes of slack: 38 minutes earlier.
    expect(a.covered).not.toBeNull();
    expect(a.covered!.extraMinutes).toBe(38);
    expect(a.covered!.leaveAt).toBe(h(7, 33));
  });

  it("offers no buffer when the slack already absorbs a bad morning", () => {
    const a = departureAdvice({ ...base, arriveBy: h(10, 0) });
    expect(a.covered).toBeNull();
    expect(a.slackMinutes).toBe(63);
  });

  it("still names the bad case when no buffer is needed", () => {
    const a = departureAdvice({ ...base, arriveBy: h(10, 0) });
    expect(a.disrupted!.arriveAt).toBe(h(9, 21));
  });

  it("prices the buffer without recommending it, at any rate", () => {
    // What a buffer is worth depends on the rider's penalty for being late,
    // which we do not know. Both a common and a rare disruption get the same
    // treatment: the cost is stated, the choice is theirs.
    for (const disruptionRisk of [1 / 400, 1 / 50]) {
      const a = departureAdvice({ ...base, disruptionRisk });
      expect(a.covered!.extraMinutes).toBe(38);
      expect(a).not.toHaveProperty("bufferWorthIt");
    }
  });

  it("reports negative slack rather than hiding an option that cannot make it", () => {
    expect(departureAdvice({ ...base, arriveAt: h(9, 12) }).slackMinutes).toBe(-12);
  });

  it("says nothing about disruption when the journey has no measured risk", () => {
    const a = departureAdvice({ ...base, disruptionRisk: 0, oneInTrips: null });
    expect(a.disrupted).toBeNull();
    expect(a.covered).toBeNull();
  });
});

describe("latestDeparture", () => {
  // A bus every 20 minutes taking 30 minutes: leaving at t catches the next
  // departure at the following multiple of 20 minutes.
  const arrivalFor = (departAt: number): number => {
    const board = Math.ceil(departAt / (20 * 60)) * 20 * 60;
    return board + 30 * 60;
  };

  it("finds the latest departure that still makes the deadline", () => {
    const r = latestDeparture(h(9, 0), 3 * 3600, arrivalFor);
    expect(r).not.toBeNull();
    // Last usable bus leaves 08:20 and arrives 08:50; boarding any later
    // catches the 08:40 and arrives 09:10.
    expect(r!.arriveAt).toBe(h(8, 50));
    expect(r!.departAt).toBeGreaterThan(h(8, 0));
    expect(r!.departAt).toBeLessThanOrEqual(h(8, 20));
  });

  it("returns null when even the earliest departure misses the deadline", () => {
    expect(latestDeparture(h(9, 0), 3 * 3600, () => h(9, 30))).toBeNull();
  });

  it("returns null when no journey exists at all", () => {
    expect(latestDeparture(h(9, 0), 3 * 3600, () => null)).toBeNull();
  });
});
