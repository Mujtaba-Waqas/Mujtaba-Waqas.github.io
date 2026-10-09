import { describe, expect, it } from "vitest";
import { assessUrgency, extractTemperatureF } from "@/lib/domain/emergency";

describe("emergency detection", () => {
  it("flags no cooling at 92°F as an emergency", () => {
    const r = assessUrgency("My AC stopped working and it is 92 degrees in my home.");
    expect(r.isEmergency).toBe(true);
    expect(r.urgency).toBe("EMERGENCY");
    expect(r.temperatureF).toBe(92);
  });
  it("flags no heat below 55°F", () => {
    expect(assessUrgency("The furnace isn't working and it's 50 degrees inside").isEmergency).toBe(true);
  });
  it("flags system failure with a vulnerable occupant regardless of temperature", () => {
    expect(assessUrgency("Our furnace stopped and we have a newborn").isEmergency).toBe(true);
  });
  it("treats gas odor as a safety emergency", () => {
    const r = assessUrgency("I smell gas near the furnace");
    expect(r).toMatchObject({ isEmergency: true, safetyHazard: "gas" });
  });
  it("detects carbon monoxide alarms", () => {
    expect(assessUrgency("our carbon monoxide alarm is going off").safetyHazard).toBe("carbon_monoxide");
  });
  it("does not over-escalate routine requests", () => {
    expect(assessUrgency("My furnace is making a loud noise").urgency).toBe("NORMAL");
    expect(assessUrgency("I'd like to schedule a tune-up").urgency).toBe("LOW");
    expect(assessUrgency("AC is not cooling well, 78 degrees").urgency).toBe("HIGH");
  });
  it("parses temperatures defensively", () => {
    expect(extractTemperatureF("it's 101° in here")).toBe(101);
    expect(extractTemperatureF("I called 3 times")).toBeNull();
  });
});
