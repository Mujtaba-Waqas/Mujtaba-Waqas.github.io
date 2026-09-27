import type { Urgency } from "@prisma/client";

export type SafetyHazard = "gas" | "carbon_monoxide" | "fire" | null;

export interface UrgencyAssessment {
  urgency: Urgency;
  isEmergency: boolean;
  safetyHazard: SafetyHazard;
  temperatureF: number | null;
  reasons: string[];
}

const NO_COOLING = /\b(ac|a\/c|air ?condition(?:er|ing)?|air|cooling|central air|heat pump)\b.*\b(stopped|not working|isn'?t working|won'?t (?:turn on|start|cool)|died|broke|broken|out|not cooling|blowing (?:warm|hot))\b|\b(no (?:ac|a\/c|air|cooling))\b/i;
const NO_HEAT = /\b(furnace|heat(?:er|ing)?|boiler|heat pump)\b.*\b(stopped|not working|isn'?t working|won'?t (?:turn on|start|heat)|died|broke|broken|out|blowing cold)\b|\bno heat\b/i;
const VULNERABLE = /\b(newborn|infant|baby|elderly|senior|grandm(?:a|other)|grandpa|oxygen|medical|disabled|pregnant|heart condition)\b/i;
const GAS = /\b(smell(?:s|ing)? (?:of )?gas|gas (?:smell|leak|odor)|rotten eggs?)\b/i;
const CO = /\b(carbon monoxide|co (?:alarm|detector)|co2? alarm)\b/i;
const FIRE = /\b(smoke|burning smell|sparks?|on fire|flames?|electrical burning)\b/i;
const WATER = /\b(leak(?:ing)?|water (?:everywhere|on the floor|pouring)|flood(?:ing)?)\b/i;
const URGENT_WORDS = /\b(asap|urgent|right away|emergency|as soon as possible|today)\b/i;
const LOW_WORDS = /\b(tune[- ]?up|maintenance|quote|estimate|thinking about|next month|no rush|whenever)\b/i;

export function extractTemperatureF(text: string): number | null {
  const m = text.match(/\b(\d{2,3})\s*(?:°\s*f?|degrees?|deg\b)/i);
  if (!m) return null;
  const t = Number(m[1]);
  return t >= 20 && t <= 130 ? t : null;
}

/**
 * Rule-based urgency classification. Deterministic by design: emergency routing
 * must be predictable and auditable, not left to a model's discretion.
 */
export function assessUrgency(text: string): UrgencyAssessment {
  const reasons: string[] = [];
  const temperatureF = extractTemperatureF(text);
  let safetyHazard: SafetyHazard = null;

  if (GAS.test(text)) safetyHazard = "gas";
  else if (CO.test(text)) safetyHazard = "carbon_monoxide";
  else if (FIRE.test(text)) safetyHazard = "fire";
  if (safetyHazard) {
    reasons.push(`Safety hazard reported (${safetyHazard.replace("_", " ")})`);
    return { urgency: "EMERGENCY", isEmergency: true, safetyHazard, temperatureF, reasons };
  }

  const noCooling = NO_COOLING.test(text);
  const noHeat = NO_HEAT.test(text);
  const vulnerable = VULNERABLE.test(text);

  if (noCooling && temperatureF !== null && temperatureF >= 85) reasons.push(`No cooling with indoor temperature of ${temperatureF}°F`);
  if (noHeat && temperatureF !== null && temperatureF <= 55) reasons.push(`No heat with indoor temperature of ${temperatureF}°F`);
  if ((noCooling || noHeat) && vulnerable) reasons.push("System down with a vulnerable occupant in the home");

  if (reasons.length) return { urgency: "EMERGENCY", isEmergency: true, safetyHazard: null, temperatureF, reasons };

  if (noCooling || noHeat) {
    reasons.push(noCooling ? "No cooling reported" : "No heat reported");
    return { urgency: "HIGH", isEmergency: false, safetyHazard: null, temperatureF, reasons };
  }
  if (WATER.test(text)) return { urgency: "HIGH", isEmergency: false, safetyHazard: null, temperatureF, reasons: ["Active water leak reported"] };
  if (URGENT_WORDS.test(text)) return { urgency: "HIGH", isEmergency: false, safetyHazard: null, temperatureF, reasons: ["Caller asked for urgent service"] };
  if (LOW_WORDS.test(text)) return { urgency: "LOW", isEmergency: false, safetyHazard: null, temperatureF, reasons: ["Planned / non-urgent request"] };
  return { urgency: "NORMAL", isEmergency: false, safetyHazard: null, temperatureF, reasons: [] };
}

const RANK: Record<Urgency, number> = { LOW: 0, NORMAL: 1, HIGH: 2, EMERGENCY: 3 };
export function maxUrgency(a: Urgency, b: Urgency): Urgency {
  return RANK[a] >= RANK[b] ? a : b;
}
