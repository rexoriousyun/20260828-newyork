import { describe, it, expect } from "vitest";
import { hhmm, hhmmDay, isNextDay } from "../clock.js";

const h = (hh: number, mm = 0): number => hh * 3600 + mm * 60;

describe("hhmm", () => {
  it("wraps a service-day time to the clock a rider reads", () => {
    expect(hhmm(h(25, 14))).toBe("01:14");
    expect(hhmm(h(30, 35))).toBe("06:35");
    expect(hhmm(h(8, 5))).toBe("08:05");
  });
});

describe("hhmmDay", () => {
  it("marks an arrival that lands after midnight", () => {
    // "23:33 → 00:22" was printed with nothing saying the arrival is tomorrow.
    expect(hhmmDay(h(24, 22), h(23, 33))).toBe("00:22 +1");
    expect(hhmmDay(h(27, 0), h(23, 0))).toBe("03:00 +1");
  });

  it("leaves a time on the same day unmarked", () => {
    expect(hhmmDay(h(9, 18), h(8, 30))).toBe("09:18");
    // Both already past midnight: same service day, so no marker.
    expect(hhmmDay(h(25, 30), h(25, 0))).toBe("01:30");
  });

  it("marks relative to the day, not the clock", () => {
    expect(isNextDay(h(23, 59), h(0, 1))).toBe(false);
    expect(isNextDay(h(24, 1), h(23, 59))).toBe(true);
  });
});
