import { z } from "zod";

const phone = z
  .string()
  .trim()
  .refine((v) => v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "").length === 10, "Enter a 10-digit US phone number");
const id = z.string().min(1).max(64);
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : null));
const dollars = z.coerce.number().min(0).max(1_000_000);

export const LEAD_SOURCES = ["PHONE", "AFTER_HOURS_CALL", "MISSED_CALL", "WEB_FORM", "SMS", "REFERRAL", "GOOGLE_LSA", "REPEAT_CUSTOMER"] as const;
export const URGENCIES = ["EMERGENCY", "HIGH", "NORMAL", "LOW"] as const;
export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "BOOKED", "ESTIMATE_SENT", "WON", "LOST"] as const;

export const createLeadSchema = z.object({
  firstName: z.string().trim().min(1, "Required").max(60),
  lastName: z.string().trim().min(1, "Required").max(60),
  phone,
  email: z.string().trim().email("Invalid email").max(120).optional().or(z.literal("")).transform((v) => v || null),
  address: optionalText(160),
  city: optionalText(80),
  zip: z.string().trim().regex(/^\d{5}$/, "5-digit ZIP").optional().or(z.literal("")).transform((v) => v || null),
  source: z.enum(LEAD_SOURCES),
  urgency: z.enum(URGENCIES),
  serviceId: z.string().max(64).optional().or(z.literal("")).transform((v) => v || null),
  requestedService: z.string().trim().min(2, "Required").max(120),
  description: optionalText(2000),
  estimatedValue: dollars.optional(),
  assignedEmployeeId: z.string().max(64).optional().or(z.literal("")).transform((v) => v || null),
});
export type CreateLeadForm = z.input<typeof createLeadSchema>;

export const updateLeadStatusSchema = z.object({ id, status: z.enum(LEAD_STATUSES), lostReason: optionalText(200) });
export const updateLeadSchema = z.object({
  id,
  assignedEmployeeId: z.string().max(64).nullable(),
  urgency: z.enum(URGENCIES),
  estimatedValue: dollars.nullable(),
  notes: optionalText(4000),
});
export const noteSchema = z.object({ id, note: z.string().trim().min(1).max(2000) });

export const estimateItemSchema = z.object({
  description: z.string().trim().min(1, "Required").max(200),
  quantity: z.coerce.number().int().min(1).max(999),
  unitPrice: z.coerce.number().min(0).max(500_000),
});
export const estimateSchema = z.object({
  id: id.optional(),
  customerId: id,
  leadId: z.string().max(64).optional().or(z.literal("")).transform((v) => v || null),
  serviceId: z.string().max(64).optional().or(z.literal("")).transform((v) => v || null),
  assignedEmployeeId: z.string().max(64).optional().or(z.literal("")).transform((v) => v || null),
  title: z.string().trim().min(3, "Add a short title").max(160),
  notes: optionalText(2000),
  taxRatePercent: z.coerce.number().min(0).max(20).default(0),
  items: z.array(estimateItemSchema).min(1, "Add at least one line item").max(40),
});
export type EstimateForm = z.input<typeof estimateSchema>;

export const smsSchema = z.object({ customerId: id, body: z.string().trim().min(1, "Message is empty").max(1600) });
export const simulateInboundSchema = z.object({ customerId: id, body: z.string().trim().min(1).max(1600) });

export const bookAppointmentSchema = z.object({
  customerId: id,
  leadId: z.string().max(64).optional().or(z.literal("")).transform((v) => v || null),
  serviceId: id,
  technicianId: id,
  startAt: z.string().datetime({ offset: true }),
  isEmergency: z.boolean().default(false),
  notes: optionalText(1000),
});
export const rescheduleSchema = z.object({ id, startAt: z.string().datetime({ offset: true }), technicianId: id });

export const simulatorStartSchema = z.object({
  callerNumber: phone,
  clock: z.enum(["after_hours", "business_hours", "auto"]),
});
export const simulatorTurnSchema = z.object({ callId: id, text: z.string().trim().min(1, "Say something").max(500) });

export const knowledgeSchema = z.object({
  id: z.string().max(64).optional().nullable(),
  category: z.enum(["COMPANY", "SERVICES", "HOURS", "SERVICE_AREA", "FAQ", "PRICING", "FINANCING", "EMERGENCY", "ESCALATION", "PROHIBITED"]),
  title: z.string().trim().min(3).max(160),
  content: z.string().trim().min(10).max(4000),
  tags: z.string().max(400).transform((v) => v.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20)),
  isActive: z.boolean(),
});

export const automationUpdateSchema = z.object({
  key: z.enum(["ESTIMATE_RECOVERY", "APPOINTMENT_REMINDERS", "REVIEW_REQUESTS", "MISSED_CALL_RECOVERY", "NEW_LEAD_FOLLOWUP"]),
  enabled: z.boolean(),
  templates: z.array(z.string().trim().min(10, "Template is too short").max(640)).min(1).max(3),
  delaysHours: z.array(z.coerce.number().int().min(0).max(24 * 30)).min(1).max(3),
});

/** Public web-form lead capture (unauthenticated; org resolved by slug, rate-limited). */
export const publicLeadSchema = z.object({
  organization: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(120),
  phone,
  email: z.string().trim().email().max(120).optional(),
  zip: z.string().trim().regex(/^\d{5}$/).optional(),
  service: z.string().trim().max(120).optional(),
  message: z.string().trim().max(2000).optional(),
  smsConsent: z.literal(true, { message: "SMS consent is required to receive texts" }),
  website: z.string().max(0).optional(), // honeypot: must be empty
});
