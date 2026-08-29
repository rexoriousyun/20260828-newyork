import { describe, it, expect } from "vitest";
import { BANDS, bandOf, bandOfSeconds, inServiceDay } from "../time-bands.js";

describe("bands", () => {
  it("covers every hour exactly once", () => {
    const seen = new Map<number, string[]>();
    for (let h = 0; h < 24; h++) {
      seen.set(h, BANDS.filter((b) => h >= b.from && h < b.to).map((b) => b.id));
    }
    for (const [hour, ids] of seen) expect(ids, `hour ${hour}`).toHaveLength(1);
  });

  it("puts the peaks where the TTC does", () => {
    expect(bandOf(6).id).toBe("am-peak");
    expect(bandOf(8).id).toBe("am-peak");
    expect(bandOf(9).id).toBe("midday");
    expect(bandOf(15).id).toBe("pm-peak");
    expect(bandOf(19).id).toBe("evening");
    expect(bandOf(0).id).toBe("night");
  });

  it("reads a GTFS time past midnight as the hour a rider would call it", () => {
    // 25:10 is 01:10, which is night — not evening, and not out of range.
    expect(bandOfSeconds(25 * 3600 + 10 * 60).id).toBe("night");
    expect(bandOfSeconds(8 * 3600 + 30 * 60).id).toBe("am-peak");
    // 30:00 is 06:00 the next morning, where am peak starts.
    expect(bandOfSeconds(30 * 3600).id).toBe("am-peak");
  });
});

describe("inServiceDay", () => {
  // This feed's weekday service: 03:28 through 30:35 (06:35 next morning).
  const window = { from: 3 * 3600 + 28 * 60, to: 30 * 3600 + 35 * 60 };

  it("leaves a time inside the window alone", () => {
    expect(inServiceDay(9 * 3600, window)).toBe(9 * 3600);
    expect(inServiceDay(window.from, window)).toBe(window.from);
  });

  it("shifts an early-hours time onto the previous service day", () => {
    // 01:45 is served by the 25:45 running the planner already holds.
    expect(inServiceDay(1 * 3600 + 45 * 60, window)).toBe(25 * 3600 + 45 * 60);
    expect(inServiceDay(0, window)).toBe(24 * 3600);
  });

  it("shifts right up to the last minute of service", () => {
    const narrow = { from: 5 * 3600, to: 26 * 3600 };
    expect(inServiceDay(2 * 3600, narrow)).toBe(26 * 3600);
  });

  it("keeps a time the previous service day cannot reach", () => {
    // Shifted, 02:00 would be 26:00 — past the end. It stays put, and the
    // caller reports it as outside the loaded data rather than inventing a trip.
    const narrow = { from: 5 * 3600, to: 25 * 3600 };
    expect(inServiceDay(2 * 3600, narrow)).toBe(2 * 3600);
  });
});
