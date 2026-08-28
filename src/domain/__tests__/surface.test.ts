import { describe, it, expect } from "vitest";
import {
  classifySurfaceLocation,
  resolveIntersection,
  buildPrefixIndex,
  applySurfaceAlias,
} from "../surface.js";

describe("classifySurfaceLocation", () => {
  // Garages are the surface equivalent of subway yards: real logged delay, but
  // no rider is ever aboard, so they must not reach the map (D-06).
  it.each(["WILSON GARAGE", "MALVERN GARAGE", "BIRCHMOUNT DIVISION"])(
    "classifies %s as non-revenue",
    (raw) => {
      expect(classifySurfaceLocation(raw).kind).toBe("non-revenue");
    },
  );

  it.each(["HUMBER LOOP", "EXHIBITION LOOP"])("classifies %s as a loop", (raw) => {
    expect(classifySurfaceLocation(raw).kind).toBe("loop");
  });

  it("reads intersections across every separator the TTC uses", () => {
    const key = classifySurfaceLocation("KING AND PARLIAMENT");
    for (const variant of ["KING AT PARLIAMENT", "KING & PARLIAMENT", "KING / PARLIAMENT"]) {
      expect(classifySurfaceLocation(variant)).toEqual(key);
    }
  });

  it("recognises stations through truncation", () => {
    expect(classifySurfaceLocation("WARDEN STATION").kind).toBe("station");
    expect(classifySurfaceLocation("PIONEER VILLAGE STATIO").kind).toBe("station");
    expect(classifySurfaceLocation("SCARBOROUGH CENTRE STA").kind).toBe("station");
  });

  it("keeps streets that share a first token distinct", () => {
    // "WILSON" alone would pair the street with itself and be discarded.
    const c = classifySurfaceLocation("WILSON AND WILSON HEIGHTS");
    expect(c.kind).toBe("intersection");
    if (c.kind === "intersection") expect(c.key).toBe("WILSON|WILSON HEIGHTS");
  });
});

describe("resolveIntersection", () => {
  // A corner carries several stops - one per direction and side of the street -
  // so the resolver returns the whole group and lets the route pick.
  const known = new Map([
    ["BIRCHMOUNT|ST CLAIR", ["stop-1a", "stop-1b"]],
    ["MEADOWVALE|SHEPPARD", ["stop-2"]],
    ["SHEPPARD|SHERBOURNE", ["stop-3"]],
    ["SHEPPARD|SHERWAY", ["stop-4"]],
  ]);
  const index = buildPrefixIndex(known.keys());

  it("resolves an exact key", () => {
    expect(resolveIntersection("BIRCHMOUNT|ST CLAIR", known, index)).toEqual(["stop-1a", "stop-1b"]);
  });

  it("resolves a key whose second street was truncated", () => {
    // "ST CLAIR AND BIRCHMOUN" -> "BIRCHMOUN|ST CLAIR"
    expect(resolveIntersection("BIRCHMOUN|ST CLAIR", known, index)).toEqual(["stop-1a", "stop-1b"]);
  });

  it("resolves a prefix that is unique among that street's corners", () => {
    // Only SHEPPARD crosses MEADOWVALE, so "SH" is unambiguous here.
    expect(resolveIntersection("MEADOWVALE|SH", known, index)).toEqual(["stop-2"]);
  });

  it("refuses an ambiguous prefix rather than guessing a corner", () => {
    // SHEPPARD crosses both SHERBOURNE and SHERWAY, so "SHER" cannot be resolved.
    expect(resolveIntersection("SHEPPARD|SHER", known, index)).toBeNull();
  });

  it("returns null for a genuinely unknown corner", () => {
    expect(resolveIntersection("NOWHERE|ELSE", known, index)).toBeNull();
  });
});

describe("applySurfaceAlias", () => {
  it("maps a station renamed since the archive began", () => {
    expect(applySurfaceAlias("EGLINTON WEST")).toBe("CEDARVALE");
  });

  it("applies an alias through truncation", () => {
    expect(applySurfaceAlias("SCARBOROUGH TOWN CENTR")).toBe("SCARBOROUGH CENTRE");
  });

  it("leaves unaliased names alone", () => {
    expect(applySurfaceAlias("WARDEN")).toBe("WARDEN");
  });
});
