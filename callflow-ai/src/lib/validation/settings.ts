import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)");

export const businessHoursSchema = z
  .array(
    z.object({
      day: z.number().int().min(0).max(6),
      open: hhmm,
      close: hhmm,
    }),
  )
  .refine((rows) => rows.every((r) => r.open < r.close), "Opening time must be before closing time");

export const receptionistSchema = z.object({
  greeting: z.string().min(10).max(400),
  afterHoursGreeting: z.string().min(10).max(400),
  personality: z.enum(["warm", "professional", "concise"]),
  voice: z.enum(["female_1", "female_2", "male_1", "male_2"]),
  recordingEnabled: z.boolean(),
  recordingDisclosure: z.string().max(300),
  transferNumber: z.string().min(7).max(20),
  transferDuringHoursOnly: z.boolean(),
  prohibitedClaims: z.array(z.string().min(2).max(120)).max(50),
  knowledgeCategories: z.array(z.string()).max(20),
  askForEmail: z.boolean(),
});

export const orgSettingsSchema = z.object({
  businessHours: businessHoursSchema,
  emergency: z.object({
    available24x7: z.boolean(),
    responseTargetHours: z.number().min(0.5).max(24),
    onCallEmployeeId: z.string().nullable(),
    policy: z.string().max(1000),
  }),
  scheduling: z.object({
    bufferMinutes: z.number().int().min(0).max(120),
    slotIntervalMinutes: z.number().int().min(15).max(240),
    bookingHorizonDays: z.number().int().min(1).max(60),
    minLeadTimeMinutes: z.number().int().min(0).max(24 * 60),
  }),
  receptionist: receptionistSchema,
  reviews: z.object({
    /** positive_only follows the requested flow; all_customers is the most platform-policy-conservative option. */
    policy: z.enum(["positive_only", "all_customers"]),
    delayHours: z.number().int().min(0).max(168),
  }),
  sms: z.object({
    senderNumber: z.string(),
    demoPhoneNumber: z.boolean(),
  }),
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;
export type BusinessHours = z.infer<typeof businessHoursSchema>;
export type ReceptionistSettings = z.infer<typeof receptionistSchema>;

export const DEFAULT_SETTINGS: OrgSettings = {
  businessHours: [1, 2, 3, 4, 5].map((day) => ({ day, open: "08:00", close: "18:00" })),
  emergency: {
    available24x7: true,
    responseTargetHours: 2,
    onCallEmployeeId: null,
    policy:
      "Emergency service is available 24/7. No cooling above 85°F indoors, no heat below 55°F indoors, or any household with infants, seniors, or medical needs is treated as an emergency. Gas odor or carbon-monoxide alarms: advise leaving the home and calling 911 and the gas utility first.",
  },
  scheduling: { bufferMinutes: 30, slotIntervalMinutes: 60, bookingHorizonDays: 10, minLeadTimeMinutes: 120 },
  receptionist: {
    greeting: "Thanks for calling {business}. This is the virtual front-office assistant. How can I help you today?",
    afterHoursGreeting:
      "Thanks for calling {business}. Our office is closed right now, but I can help — including emergency service. What's going on?",
    personality: "warm",
    voice: "female_1",
    recordingEnabled: true,
    recordingDisclosure: "This call may be recorded and transcribed for quality and scheduling.",
    transferNumber: "(801) 555-0198",
    transferDuringHoursOnly: true,
    prohibitedClaims: [
      "guarantee",
      "lowest price",
      "cheapest",
      "free repair",
      "we will beat any price",
      "exact price",
      "same-day installation guaranteed",
    ],
    knowledgeCategories: ["COMPANY", "SERVICES", "HOURS", "SERVICE_AREA", "FAQ", "PRICING", "FINANCING", "EMERGENCY"],
    askForEmail: false,
  },
  reviews: { policy: "positive_only", delayHours: 2 },
  sms: { senderNumber: "(801) 555-0198", demoPhoneNumber: true },
};

/** Parse stored settings, filling any missing keys with defaults. */
export function parseSettings(raw: unknown): OrgSettings {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const merged = {
    ...DEFAULT_SETTINGS,
    ...obj,
    emergency: { ...DEFAULT_SETTINGS.emergency, ...(obj.emergency as object) },
    scheduling: { ...DEFAULT_SETTINGS.scheduling, ...(obj.scheduling as object) },
    receptionist: { ...DEFAULT_SETTINGS.receptionist, ...(obj.receptionist as object) },
    reviews: { ...DEFAULT_SETTINGS.reviews, ...(obj.reviews as object) },
    sms: { ...DEFAULT_SETTINGS.sms, ...(obj.sms as object) },
  };
  const parsed = orgSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
