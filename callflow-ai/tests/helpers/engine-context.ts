import { generateEmergencySlots, generateSlots, type BusyBlock } from "@/lib/domain/availability";
import { answerFromKnowledge, type KnowledgeDoc } from "@/lib/domain/knowledge";
import type { EngineContext, KnownCustomer } from "@/lib/domain/receptionist";
import { checkServiceArea, findCityInText, KNOWN_OUT_OF_AREA_CITIES, type ServiceAreaEntry } from "@/lib/domain/service-area";
import { DEFAULT_SETTINGS } from "@/lib/validation/settings";

export const AREAS: ServiceAreaEntry[] = [
  { zip: "84124", city: "Holladay", county: "Salt Lake" },
  { zip: "84109", city: "Salt Lake City", county: "Salt Lake" },
  { zip: "84106", city: "Millcreek", county: "Salt Lake" },
  { zip: "84105", city: "Salt Lake City", county: "Salt Lake" },
  { zip: "84010", city: "Bountiful", county: "Davis" },
  { zip: "84604", city: "Provo", county: "Utah" },
];

export const DOCS: KnowledgeDoc[] = [
  {
    id: "kb1",
    category: "PRICING",
    title: "Diagnostic and service call fee",
    content:
      "Our standard diagnostic visit is $89, and it is applied toward the repair if you approve the work during the same visit. Repair pricing is quoted on site after diagnosis, before any work begins.",
    tags: ["price", "diagnostic", "service call", "fee", "cost"],
  },
  {
    id: "kb2",
    category: "EMERGENCY",
    title: "After-hours emergency dispatch",
    content: "After-hours emergency visits include a $149 dispatch fee in addition to the diagnostic.",
    tags: ["after-hours-fee", "emergency"],
  },
  { id: "kb3", category: "FINANCING", title: "Financing", content: "Financing is available on new systems with approved credit, with plans starting at 0% APR for 12 months.", tags: ["financing"] },
];

export const TECHS = [
  { id: "t1", name: "Jake Morrison", isOnCall: true },
  { id: "t2", name: "Sofia Alvarez", isOnCall: false },
  { id: "t3", name: "Dev Patel", isOnCall: false },
];

export function makeCtx(opts: { now: Date; isAfterHours: boolean; callerNumber?: string; known?: KnownCustomer | null; busy?: BusyBlock[] }): EngineContext {
  const s = DEFAULT_SETTINGS;
  return {
    businessName: "Summit Peak HVAC",
    tz: "America/Denver",
    isAfterHours: opts.isAfterHours,
    callerNumber: opts.callerNumber ?? "(801) 555-0142",
    knownCustomer: opts.known ?? null,
    greeting: s.receptionist.greeting,
    afterHoursGreeting: s.receptionist.afterHoursGreeting,
    recordingDisclosure: s.receptionist.recordingDisclosure,
    transferTarget: { name: "Marcus", number: "(801) 555-0198" },
    onCallName: "Jake",
    serviceAreaSummary: "Salt Lake, Davis, and Utah counties",
    afterHoursFeeNote: "After-hours emergency visits include a $149 dispatch fee in addition to the diagnostic.",
    checkServiceArea: (i) => checkServiceArea(i, AREAS),
    findCity: (t) => findCityInText(t, AREAS, KNOWN_OUT_OF_AREA_CITIES),
    getSlots: ({ emergency, preference, offset }) =>
      emergency
        ? generateEmergencySlots({ now: opts.now, durationMinutes: 120, bufferMinutes: 30, technicians: TECHS, busy: opts.busy ?? [] })
        : generateSlots({
            now: opts.now,
            businessHours: s.businessHours,
            durationMinutes: 90,
            bufferMinutes: 30,
            slotIntervalMinutes: 60,
            minLeadTimeMinutes: 120,
            horizonDays: 10,
            technicians: TECHS,
            busy: opts.busy ?? [],
            preference,
            offset,
          }),
    answerQuestion: (q) => answerFromKnowledge(q, DOCS, s.receptionist.prohibitedClaims),
  };
}
