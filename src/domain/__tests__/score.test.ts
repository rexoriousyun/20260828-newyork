import { describe, it, expect } from "vitest";
import { percentile, confidenceFor, CONFIDENCE } from "../score.js";

describe("percentile", () => {
  const sample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("uses nearest-rank", () => {
    expect(percentile(sample, 50)).toBe(5);
    expect(percentile(sample, 90)).toBe(9);
    expect(percentile(sample, 100)).toBe(10);
  });

  it("never indexes outside the sample", () => {
    expect(percentile([7], 95)).toBe(7);
    expect(percentile(sample, 1)).toBe(1);
  });

  it("throws on an empty sample rather than returning a number", () => {
    // Returning 0 here would render as "no wait", the exact failure P-03 forbids.
    expect(() => percentile([], 50)).toThrow();
  });
});

describe("confidenceFor", () => {
  it("treats a thin sample as unknown, not as good news", () => {
    expect(confidenceFor(0)).toBe("unknown");
    expect(confidenceFor(CONFIDENCE.low - 1)).toBe("unknown");
  });

  it("grades at the pre-registered thresholds", () => {
    expect(confidenceFor(CONFIDENCE.low)).toBe("low");
    expect(confidenceFor(CONFIDENCE.high - 1)).toBe("low");
    expect(confidenceFor(CONFIDENCE.high)).toBe("high");
  });
});
