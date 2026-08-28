import { describe, it, expect } from "vitest";
import {
  stationFromAlert,
  isElevatorAlert,
  resolveState,
  isUsable,
} from "../accessibility.js";

describe("stationFromAlert", () => {
  it("reads the station from the description prefix", () => {
    expect(
      stationFromAlert("Cedarvale: Elevator out of service between platform and upper concourse."),
    ).toBe("CEDARVALE");
  });

  it("refuses a route alert, which uses the same prefix shape", () => {
    // "506 Carlton: Detour via..." would otherwise be read as a station.
    expect(stationFromAlert("506 Carlton: Detour via Ossington Ave due to a blocked track.")).toBeNull();
    expect(stationFromAlert("16 Mccowan: Bypass near Scarborough Centre Station.")).toBeNull();
  });

  it("returns null when there is no prefix to read", () => {
    expect(stationFromAlert("Have proof of payment ready for inspection.")).toBeNull();
    expect(stationFromAlert("")).toBeNull();
  });
});

describe("isElevatorAlert", () => {
  it("matches elevator and escalator outages", () => {
    expect(isElevatorAlert("Cedarvale: Elevator out of service")).toBe(true);
    expect(isElevatorAlert("Kipling: Escalator out of service")).toBe(true);
  });

  it("does not match ordinary service alerts", () => {
    expect(isElevatorAlert("506 Carlton: Detour via Ossington Ave")).toBe(false);
  });
});

describe("resolveState", () => {
  it("lets a live outage outrank the baseline", () => {
    // Built step-free, elevator out today: not usable, which is the whole
    // reason for checking live data.
    expect(resolveState(1, "Elevator out of service")).toBe("outage");
  });

  it("reads the GTFS baseline when nothing is reported", () => {
    expect(resolveState(1, undefined)).toBe("accessible");
    expect(resolveState(2, undefined)).toBe("not-accessible");
  });

  it("is unknown when there is no baseline at all", () => {
    expect(resolveState(undefined, undefined)).toBe("unknown");
    expect(resolveState(0, undefined)).toBe("unknown");
  });
});

describe("isUsable", () => {
  it("treats only a verified accessible station as usable", () => {
    expect(isUsable("accessible")).toBe(true);
  });

  // The load-bearing case: absence of an alert is not evidence an elevator
  // works, so "unknown" must never be routed through (P-03, U-04).
  it("refuses unknown rather than assuming it is fine", () => {
    expect(isUsable("unknown")).toBe(false);
  });

  it("refuses an outage and a structural gap alike", () => {
    expect(isUsable("outage")).toBe(false);
    expect(isUsable("not-accessible")).toBe(false);
  });
});
