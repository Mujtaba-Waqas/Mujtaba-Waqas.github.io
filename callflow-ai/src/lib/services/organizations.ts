import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { DEFAULT_ESTIMATE_TEMPLATES } from "../domain/followups";
import { DEFAULT_SETTINGS } from "../validation/settings";

const DEFAULT_SERVICES = [
  { category: "ac_repair", name: "AC Repair", durationMinutes: 90 },
  { category: "ac_install", name: "AC Installation", durationMinutes: 120 },
  { category: "furnace_repair", name: "Furnace Repair", durationMinutes: 90 },
  { category: "furnace_install", name: "Furnace Installation", durationMinutes: 120 },
  { category: "maintenance", name: "Maintenance Plan Tune-Up", durationMinutes: 60 },
  { category: "iaq", name: "Indoor Air Quality", durationMinutes: 60 },
  { category: "general", name: "HVAC Diagnostic", durationMinutes: 60 },
  { category: "emergency", name: "Emergency HVAC Service", durationMinutes: 120, isEmergency: true },
];

export const DEFAULT_AUTOMATIONS = [
  { key: "ESTIMATE_RECOVERY", name: "Estimate Recovery", description: "Follows up on sent estimates on day 1, 3 and 7 until the customer decides.", triggerDescription: "Estimate marked as Sent", template: DEFAULT_ESTIMATE_TEMPLATES.join("\n---\n"), delaysHours: [24, 72, 168], stopConditions: ["Estimate accepted", "Estimate declined", "Estimate expired", "Customer replied STOP", "Customer asked for a person", "Paused manually"] },
  { key: "APPOINTMENT_REMINDERS", name: "Appointment Reminders", description: "Texts customers 24 hours before their appointment.", triggerDescription: "Appointment starts within 24 hours", template: "Hi {{firstName}}, reminder from {{business}}: {{service}} is scheduled for {{time}} with {{technician}}. Reply C to confirm or call {{phone}} to reschedule.", delaysHours: [24], stopConditions: ["Appointment cancelled", "Customer replied STOP"] },
  { key: "REVIEW_REQUESTS", name: "Review Requests", description: "Asks for feedback after completed jobs. Happy customers get the Google review link; unhappy customers are routed to the owner.", triggerDescription: "Appointment marked Completed (after delay)", template: "Hi {{firstName}}, thanks for choosing {{business}}! How did {{technician}} do? Reply with a number from 1 (poor) to 5 (great).\n---\nThank you, {{firstName}}! If you have a moment, would you share your experience on Google? It really helps a local business: {{reviewLink}}", delaysHours: [2], stopConditions: ["Customer replied STOP", "Negative feedback (routed to owner)", "No response after 5 days"] },
  { key: "MISSED_CALL_RECOVERY", name: "Missed Call Recovery", description: "Instantly texts callers the team couldn't answer and opens a lead.", triggerDescription: "Inbound call missed, abandoned or sent to voicemail", template: "Sorry we missed your call! This is {{business}} — how can we help? Reply here or call {{phone}}. Emergency service is available 24/7.", delaysHours: [0], stopConditions: ["Caller already reached by staff", "Customer replied STOP"] },
  { key: "NEW_LEAD_FOLLOWUP", name: "New Lead Follow-Up", description: "Responds to web-form, Google LSA and referral leads within minutes.", triggerDescription: "New lead created with no response after 5 minutes", template: "Hi {{firstName}}, thanks for reaching out to {{business}} about {{service}}! What's a good time for a quick call? You can also reply here.", delaysHours: [0], stopConditions: ["Lead contacted by staff", "Customer replied STOP"] },
] as const;

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "company";
}

/** Creates a tenant with sane defaults (services, automations, integrations, demo subscription) owned by `userId`. */
export async function createOrganization(userId: string, name: string, opts: { owner?: { name: string; email: string } } = {}) {
  let slug = slugify(name);
  for (let i = 2; await db.organization.findUnique({ where: { slug } }); i++) slug = `${slugify(name)}-${i}`;
  const now = new Date();
  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name, slug, settings: DEFAULT_SETTINGS as unknown as Prisma.InputJsonValue, onboardingStep: 1 } });
    await tx.membership.create({ data: { userId, organizationId: org.id, role: "OWNER" } });
    if (opts.owner) await tx.employee.create({ data: { organizationId: org.id, userId, name: opts.owner.name, title: "Owner", kind: "OWNER", email: opts.owner.email, color: "#0f172a" } });
    await tx.service.createMany({ data: DEFAULT_SERVICES.map((s) => ({ ...s, organizationId: org.id })) });
    await tx.automation.createMany({ data: DEFAULT_AUTOMATIONS.map((a) => ({ ...a, delaysHours: [...a.delaysHours], stopConditions: [...a.stopConditions], organizationId: org.id })) });
    await tx.integration.createMany({
      data: [
        ...(["TWILIO", "GOOGLE_CALENDAR", "STRIPE", "OPENAI"] as const).map((provider) => ({ organizationId: org.id, provider, status: "DEMO" as const })),
        ...(["JOBBER", "HOUSECALL_PRO", "QUICKBOOKS", "SERVICETITAN", "HUBSPOT"] as const).map((provider) => ({ organizationId: org.id, provider, status: "COMING_SOON" as const })),
      ],
    });
    await tx.subscription.create({ data: { organizationId: org.id, plan: "STARTER", status: "DEMO", isDemo: true, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000) } });
    await tx.auditLog.create({ data: { organizationId: org.id, userId, action: "organization.created", entityType: "Organization", entityId: org.id } });
    return org;
  });
}

export const COUNTY_PRESETS: Record<string, { zip: string; city: string }[]> = {
  "Salt Lake": [["84101", "Salt Lake City"], ["84102", "Salt Lake City"], ["84105", "Salt Lake City"], ["84106", "South Salt Lake"], ["84107", "Murray"], ["84109", "Salt Lake City"], ["84117", "Holladay"], ["84121", "Cottonwood Heights"], ["84124", "Holladay"], ["84047", "Midvale"], ["84070", "Sandy"], ["84092", "Sandy"], ["84093", "Sandy"], ["84084", "West Jordan"], ["84095", "South Jordan"], ["84065", "Riverton"], ["84020", "Draper"], ["84119", "West Valley City"], ["84123", "Taylorsville"]].map(([zip, city]) => ({ zip, city })),
  Davis: [["84010", "Bountiful"], ["84014", "Centerville"], ["84025", "Farmington"], ["84037", "Kaysville"], ["84040", "Layton"], ["84041", "Layton"], ["84015", "Clearfield"], ["84075", "Syracuse"]].map(([zip, city]) => ({ zip, city })),
  Utah: [["84003", "American Fork"], ["84043", "Lehi"], ["84045", "Saratoga Springs"], ["84057", "Orem"], ["84058", "Orem"], ["84062", "Pleasant Grove"], ["84601", "Provo"], ["84604", "Provo"], ["84660", "Spanish Fork"], ["84663", "Springville"]].map(([zip, city]) => ({ zip, city })),
  Weber: [["84401", "Ogden"], ["84403", "Ogden"], ["84404", "Ogden"], ["84405", "Ogden"], ["84067", "Roy"]].map(([zip, city]) => ({ zip, city })),
};
