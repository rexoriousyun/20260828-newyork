import { describe, it, expect } from "vitest";
import { neverCame, neverCameShare, NEVER_CAME_NOTABLE } from "../vanishing.js";

describe("neverCame", () => {
  it("counts the ways a vehicle fails to turn up", () => {
    expect(neverCame("EFCAN")).toBe(true);   // cancellation
    expect(neverCame("MFDV")).toBe(true);    // on diversion
    expect(neverCame("MFSH")).toBe(true);    // taken away to run a shuttle
    expect(neverCame("TFCNO")).toBe(true);   // no operator available
  });

  it("does not count a vehicle that arrives late", () => {
    // These all end with something pulling up at the stop, however late, and a
    // rider who waits is rewarded. That is the whole distinction.
    expect(neverCame("TFPD")).toBe(false);   // collision, property damage
    expect(neverCame("EFD")).toBe(false);    // doors
    expect(neverCame("SFPOL")).toBe(false);  // held for a police investigation
    expect(neverCame("MUSAN")).toBe(false);  // unsanitary vehicle
  });
});

describe("neverCameShare", () => {
  const i = (code: string, weightedMinutes: number) => ({ code, weightedMinutes });

  it("weights by minutes lost, not by number of incidents", () => {
    // One cancellation on a half-hourly route costs more than three small
    // delays; counting events would flatter the routes this exists to expose.
    expect(neverCameShare([i("EFCAN", 30), i("EFD", 3), i("EFD", 3), i("EFD", 4)])).toBe(0.75);
  });

  it("is zero where nothing vanished, and one where everything did", () => {
    expect(neverCameShare([i("EFD", 10), i("TFPD", 10)])).toBe(0);
    expect(neverCameShare([i("MFDV", 10), i("TUNOA", 10)])).toBe(1);
  });

  it("says nothing rather than zero when there is no waiting recorded", () => {
    // Absence of measurement is not evidence that buses turn up (P-03).
    expect(neverCameShare([])).toBeNull();
    expect(neverCameShare([i("EFD", 0)])).toBeNull();
  });

  it("sets the notable bar where waiting stops being the right response", () => {
    // The network average is 36%; a bar below that would fire everywhere and
    // mean nothing.
    expect(NEVER_CAME_NOTABLE).toBeGreaterThan(0.36);
  });
});
