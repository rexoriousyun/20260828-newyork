import { describe, it, expect } from "vitest";
import { bucketFor, percentileOf, verdictFor, DURATION_BUCKETS, MATERIAL_RATIO } from "../table.js";

describe("bucketFor", () => {
  it("covers every plausible trip length exactly once", () => {
    for (const minutes of [0, 1, 19, 20, 34, 35, 49, 50, 69, 70, 120, 400]) {
      const hits = DURATION_BUCKETS.filter((b) => minutes >= b.from && minutes < b.to);
      expect(hits, `${minutes} min`).toHaveLength(1);
    }
    expect(bucketFor(17)).toBe(0);
    expect(bucketFor(24)).toBe(1);
    expect(bucketFor(90)).toBe(4);
  });

  it("refuses a length outside the table rather than clamping", () => {
    expect(bucketFor(5000)).toBeNull();
  });
});

describe("percentileOf", () => {
  const reference = [0.001, 0.002, 0.003, 0.004, 0.005];

  it("reports the share of trips this one is safer than", () => {
    expect(percentileOf(0.001, reference)).toBe(0.8);
    expect(percentileOf(0.003, reference)).toBe(0.4);
    expect(percentileOf(0.005, reference)).toBe(0);
  });

  it("puts a trip safer than the whole reference at the top", () => {
    expect(percentileOf(0.0001, reference)).toBe(1);
  });

  it("gives no comparison rather than a guessed one", () => {
    // A missing reference is stated as missing; filling it in with 0.5 would
    // tell every rider their trip is typical (P-03).
    expect(percentileOf(0.002, null)).toBeNull();
    expect(percentileOf(0.002, [])).toBeNull();
    expect(percentileOf(0.002, undefined)).toBeNull();
  });
});

describe("verdictFor", () => {
  it("takes a side only when rank and magnitude agree", () => {
    // Worse than 86% of comparable trips, but only 15% worse than typical.
    // Calling that "riskier than most" beside "1 in 218, typically 1 in 250"
    // reads as overselling a rounding difference (PR-08).
    expect(verdictFor(0.14, 1.15)).toBe("typical");
    expect(verdictFor(0.14, 1.4)).toBe("riskier-4in5");
    expect(verdictFor(0.35, 1.4)).toBe("riskier-most");
  });

  it("is symmetric about safer", () => {
    expect(verdictFor(0.9, 0.6)).toBe("safer-4in5");
    expect(verdictFor(0.7, 0.6)).toBe("safer-most");
    expect(verdictFor(0.9, 0.95)).toBe("typical");
  });

  it("holds the registered bar", () => {
    expect(verdictFor(0.1, MATERIAL_RATIO)).toBe("riskier-4in5");
    expect(verdictFor(0.1, MATERIAL_RATIO * 0.99)).toBe("typical");
    expect(verdictFor(0.9, 1 / MATERIAL_RATIO)).toBe("safer-4in5");
  });

  it("says nothing without a reference value to compare magnitudes against", () => {
    expect(verdictFor(0.02, null)).toBe("typical");
  });
});
