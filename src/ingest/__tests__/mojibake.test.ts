import { describe, it, expect } from "vitest";
import { repairMojibake } from "../delays.js";

const DOUBLE_ENCODED_DASH = "\u00e2\u0080\u0093";

describe("repairMojibake", () => {
  it("repairs the double-encoded en-dash the portal publishes", () => {
    expect(repairMojibake(`INJURED CUSTOMER ${DOUBLE_ENCODED_DASH} MEDICAL AID REFUSED`)).toBe(
      "INJURED CUSTOMER \u2013 MEDICAL AID REFUSED",
    );
  });

  it("leaves clean ASCII untouched", () => {
    expect(repairMojibake("DISORDERLY PATRON")).toBe("DISORDERLY PATRON");
  });

  it("leaves already-correct punctuation untouched", () => {
    expect(repairMojibake("PASSENGER \u2013 ALREADY CLEAN")).toBe("PASSENGER \u2013 ALREADY CLEAN");
  });

  it("returns the original when the repair would not decode", () => {
    // A failed repair must never throw or mangle - worse than no repair at all.
    expect(repairMojibake("CAF\u00c9")).toBe("CAF\u00c9");
  });
});
