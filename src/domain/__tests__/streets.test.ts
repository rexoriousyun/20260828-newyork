import { describe, it, expect } from "vitest";
import {
  streetToken,
  intersectionKey,
  keyFromStopName,
  keyFromDelayLocation,
  isStationLocation,
} from "../streets.js";

describe("streetToken", () => {
  it("strips type and directional suffixes", () => {
    expect(streetToken("King St West")).toBe("KING");
    expect(streetToken("Lawrence Ave E")).toBe("LAWRENCE");
    expect(streetToken("Danforth Rd")).toBe("DANFORTH");
  });

  it("keeps numeric and multi-word names identifiable", () => {
    expect(streetToken("Royal York Rd")).toBe("ROYAL");
  });

  it("returns null when nothing identifying survives", () => {
    expect(streetToken("St")).toBeNull();
    expect(streetToken("")).toBeNull();
  });
});

describe("intersectionKey", () => {
  it("is order independent", () => {
    expect(intersectionKey("King", "Parliament")).toBe(
      intersectionKey("Parliament", "King"),
    );
  });

  it("rejects a street paired with itself", () => {
    expect(intersectionKey("King St West", "King St East")).toBeNull();
  });
});

describe("cross-source matching", () => {
  // The whole point of this module: a delay record and a GTFS stop describing
  // the same corner must produce the same key (E-D07).
  it("matches a delay location to a GTFS stop name", () => {
    expect(keyFromDelayLocation("KING AND PARLIAMENT")).toBe(
      keyFromStopName("King St East at Parliament St"),
    );
    expect(keyFromDelayLocation("COLLEGE AND HURON")).toBe(
      keyFromStopName("College St at Huron St"),
    );
  });

  it("returns null for names that are not intersections", () => {
    expect(keyFromStopName("Kipling Station")).toBeNull();
    expect(keyFromDelayLocation("WARDEN STATION")).toBeNull();
  });
});

describe("isStationLocation", () => {
  it("identifies station records, which resolve by name not by corner", () => {
    expect(isStationLocation("WARDEN STATION")).toBe(true);
    expect(isStationLocation("BATHURST STN")).toBe(true);
    expect(isStationLocation("KING AND PARLIAMENT")).toBe(false);
  });
});
