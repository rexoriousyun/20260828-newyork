import { describe, it, expect } from "vitest";
import {
  parseSubwayLocation,
  stationFromPlatform,
  directionFromPlatform,
  resolveStation,
} from "../stations.js";

describe("parseSubwayLocation", () => {
  it("reads a plain station", () => {
    expect(parseSubwayLocation("BATHURST STATION")).toEqual({
      kind: "station",
      station: "BATHURST",
      truncated: false,
    });
  });

  it("strips the line suffix used at interchanges", () => {
    expect(parseSubwayLocation("KENNEDY BD STATION")).toMatchObject({
      kind: "station",
      station: "KENNEDY",
    });
    expect(parseSubwayLocation("ST GEORGE YUS STATION")).toMatchObject({
      station: "ST GEORGE",
    });
  });

  it("recovers stations whose name was truncated at 22 characters", () => {
    expect(parseSubwayLocation("PIONEER VILLAGE STATIO")).toMatchObject({
      kind: "station",
      station: "PIONEER VILLAGE",
      truncated: true,
    });
  });

  it("reads inter-station records as segments", () => {
    expect(parseSubwayLocation("UNION TO ST ANDREW")).toMatchObject({
      kind: "segment",
      from: "UNION",
      to: "ST ANDREW",
    });
  });

  // These are the records that would otherwise inflate terminal and yard
  // stations into false rider risk (E-D03, D-06).
  it.each([
    "GREENWOOD YARD",
    "WILSON YARD",
    "SOUTH HOSTLER",
    "GREENWOOD WYE",
    "DAVISVILLE BUILD UP",
    "DAVISVILLE BUILD-UP",
  ])("classifies %s as non-revenue", (raw) => {
    expect(parseSubwayLocation(raw).kind).toBe("non-revenue");
  });

  it("does not mistake a station for non-revenue trackage", () => {
    expect(parseSubwayLocation("DAVISVILLE STATION").kind).toBe("station");
  });
});

describe("GTFS platform parsing", () => {
  it("extracts station and direction", () => {
    expect(stationFromPlatform("Bathurst Station - Eastbound Platform")).toBe("BATHURST");
    expect(directionFromPlatform("Bathurst Station - Eastbound Platform")).toBe("E");
    expect(directionFromPlatform("Bloor Station - Northbound Platform")).toBe("N");
  });

  it("returns null when a stop carries no direction", () => {
    expect(directionFromPlatform("Kipling Station")).toBeNull();
  });
});

describe("resolveStation", () => {
  const known = new Set(["PIONEER VILLAGE", "YORK UNIVERSITY", "UNION", "ST ANDREW", "ST CLAIR", "ST CLAIR WEST"]);

  it("prefers an exact match over a longer prefix match", () => {
    // Without this, "ST CLAIR" would be ambiguous against "ST CLAIR WEST"
    // and get dropped, silently losing a real station's incidents.
    expect(resolveStation("ST CLAIR", known)).toBe("ST CLAIR");
  });

  it("resolves an unambiguous truncated prefix", () => {
    expect(resolveStation("PIONEER VILLAGE", known)).toBe("PIONEER VILLAGE");
  });

  it("refuses to guess when a prefix is ambiguous", () => {
    expect(resolveStation("ST", known)).toBeNull();
  });

  it("returns null for an unknown station", () => {
    expect(resolveStation("NOWHERE", known)).toBeNull();
  });
});
