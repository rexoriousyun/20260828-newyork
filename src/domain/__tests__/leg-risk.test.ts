import { describe, it, expect } from "vitest";
import { composeRisk, worstLegIndex, dominantStretch, WORST_DOMINANCE } from "../itinerary.js";

const leg = (risk: number) => ({ risk, oneInTrips: risk > 0 ? Math.round(1 / risk) : null });

describe("composeRisk", () => {
  it("is zero when nothing can go wrong", () => {
    expect(composeRisk([])).toBe(0);
    expect(composeRisk([0, 0])).toBe(0);
  });

  it("never exceeds one, however long the trip", () => {
    expect(composeRisk(Array.from({ length: 60 }, () => 0.3))).toBeLessThan(1);
    // Summing would give 18 here, which is the mistake this replaces.
    expect(composeRisk([0.6, 0.6])).toBeCloseTo(0.84, 5);
  });

  it("composes legs into exactly the trip figure", () => {
    // The numbers a rider sees on the steps have to add up to the one on the
    // card, or the two screens are telling different stories.
    const a = 1 / 486;
    const b = 1 / 382;
    const trip = composeRisk([a, b]);
    expect(Math.round(1 / trip)).toBe(214);
    expect(trip).toBeCloseTo(composeRisk([composeRisk([a]), composeRisk([b])]), 12);
  });
});

describe("worstLegIndex", () => {
  it("names the leg when one dominates", () => {
    expect(worstLegIndex([leg(0.001), leg(0.009)])).toBe(1);
  });

  it("names nothing when two legs are evenly risky", () => {
    // The rule this replaced compared each leg against the trip total, where
    // an even two-way split puts both just over half — so it fired here and
    // pointed the rider at an arbitrary half of their journey.
    expect(worstLegIndex([leg(0.005), leg(0.005)])).toBeNull();
  });

  it("names nothing just below the registered dominance", () => {
    expect(worstLegIndex([leg(0.001 * WORST_DOMINANCE), leg(0.001)])).toBe(0);
    expect(worstLegIndex([leg(0.001 * WORST_DOMINANCE * 0.99), leg(0.001)])).toBeNull();
  });

  it("names nothing on a single-leg trip — there is nothing to compare with", () => {
    expect(worstLegIndex([leg(0.02)])).toBeNull();
  });

  it("skips walks and unscored legs", () => {
    expect(worstLegIndex([null, { risk: 0, oneInTrips: null }, leg(0.009), leg(0.001)])).toBe(2);
  });

  it("names nothing when no leg carries any measured risk", () => {
    expect(worstLegIndex([{ risk: 0, oneInTrips: null }, null])).toBeNull();
  });
});

describe("dominantStretch", () => {
  const seg = (id: string, risk: number) =>
    ({ segmentId: id, from: "A", to: "B", risk, gapMinutesPerMonth: 0, confidence: "high" }) as never;

  it("names the stretch that dominates", () => {
    expect(dominantStretch([seg("a", 0.001), seg("b", 0.008)])).toMatchObject({ segmentId: "b" });
  });

  it("names nothing when the risk is spread across stretches", () => {
    expect(dominantStretch([seg("a", 0.004), seg("b", 0.005), seg("c", 0.004)])).toBeNull();
  });

  it("names nothing with only one stretch to go on", () => {
    expect(dominantStretch([seg("a", 0.01)])).toBeNull();
  });
});
