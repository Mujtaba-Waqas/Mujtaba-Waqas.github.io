import { describe, expect, it } from "vitest";
import { checkServiceArea, extractZip, findCityInText } from "@/lib/domain/service-area";

const AREAS = [
  { zip: "84124", city: "Holladay", county: "Salt Lake" },
  { zip: "84010", city: "Bountiful", county: "Davis" },
  { zip: "84604", city: "Provo", county: "Utah" },
];

describe("service-area validation", () => {
  it("accepts ZIPs inside the territory and reports the county", () => {
    const r = checkServiceArea({ zip: "84010" }, AREAS);
    expect(r).toMatchObject({ inArea: true, county: "Davis", matchedBy: "zip" });
  });
  it("rejects ZIPs outside the territory even when the city name matches", () => {
    expect(checkServiceArea({ zip: "84404", city: "Provo" }, AREAS).inArea).toBe(false);
  });
  it("falls back to city when no ZIP is given", () => {
    expect(checkServiceArea({ city: "provo" }, AREAS)).toMatchObject({ inArea: true, matchedBy: "city" });
    expect(checkServiceArea({ city: "Ogden" }, AREAS).inArea).toBe(false);
  });
  it("reports unknown when nothing is provided", () => {
    expect(checkServiceArea({}, AREAS)).toMatchObject({ inArea: false, unknown: true });
  });
  it("extracts ZIPs without confusing Utah grid street numbers", () => {
    expect(extractZip("12450 S 700 E, Draper 84020")).toBe("84020");
    expect(extractZip("4185 S Highland Dr, Holladay, UT 84124-1234")).toBe("84124");
    expect(extractZip("no zip here")).toBeNull();
  });
  it("finds known cities in free text", () => {
    expect(findCityInText("I live in Bountiful near the temple", AREAS)).toBe("Bountiful");
    expect(findCityInText("up in Park City", AREAS, ["Park City"])).toBe("Park City");
  });
});
