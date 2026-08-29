import { describe, it, expect } from "vitest";
import { displayStopName, displayStationName } from "../stop-names.js";

describe("displayStopName", () => {
  it("drops the platform, whatever trails it", () => {
    expect(displayStopName("Sherbourne Station - Eastbound Platform")).toBe("Sherbourne Station");
    expect(displayStopName("Union Station - Northbound Platform Towards Finch")).toBe("Union Station");
    expect(displayStopName("Bloor-Yonge Station - Southbound Platform")).toBe("Bloor-Yonge Station");
  });

  it("drops the side of the street", () => {
    expect(displayStopName("Jane St at Eglinton Ave West North Side")).toBe("Jane St at Eglinton Ave West");
  });

  it("leaves a plain stop name alone", () => {
    expect(displayStopName("Queen St East at Sherbourne St")).toBe("Queen St East at Sherbourne St");
    expect(displayStopName("Spadina Ave at Nassau St")).toBe("Spadina Ave at Nassau St");
  });

  it("does not eat a directional that is part of the street name", () => {
    expect(displayStopName("Eglinton Ave West at Jane St")).toBe("Eglinton Ave West at Jane St");
  });
});

describe("displayStationName", () => {
  it("cases a code back into a name", () => {
    expect(displayStationName("SHERBOURNE")).toBe("Sherbourne");
    expect(displayStationName("BLOOR-YONGE")).toBe("Bloor-Yonge");
    expect(displayStationName("ST CLAIR WEST")).toBe("St Clair West");
  });
});
