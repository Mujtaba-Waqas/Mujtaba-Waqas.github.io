"use server";

import { appUrl } from "@/lib/app-url";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { secureAction } from "@/lib/actions";
import { db } from "@/lib/db";
import { toE164 } from "@/lib/format";
import { getPaymentProvider } from "@/lib/providers";
import { audit } from "@/lib/services/audit";
import { loadOrg, ValidationError, type TenantContext } from "@/lib/services/context";
import { phoneSettingsFormSchema } from "@/lib/validation/schemas";
import { businessHoursSchema, orgSettingsSchema, receptionistSchema, type OrgSettings } from "@/lib/validation/settings";
import { alertStaff } from "@/lib/services/phone";

async function patchSettings(ctx: TenantContext, patch: (s: OrgSettings) => OrgSettings, action: string) {
  const { settings } = await loadOrg(ctx);
  const next = orgSettingsSchema.parse(patch(settings));
  await db.organization.update({ where: { id: ctx.orgId }, data: { settings: next as unknown as Prisma.InputJsonValue } });
  await audit(ctx, action, "Organization", ctx.orgId);
}

export const saveReceptionistAction = secureAction("receptionist:manage", receptionistSchema, async (input, ctx) => {
  await patchSettings(ctx, (s) => ({ ...s, receptionist: input }), "receptionist.updated");
  revalidatePath("/ai-receptionist");
});

const companySchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().refine((v) => toE164(v) !== null, "Enter a valid US phone number"),
  email: z.string().trim().email().max(120),
  website: z.string().trim().url().max(200).or(z.literal("")),
  address: z.string().trim().max(160),
  city: z.string().trim().max(80),
  state: z.string().trim().length(2),
  timezone: z.enum(["America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Chicago", "America/New_York"]),
  googleReviewUrl: z.string().trim().url("Enter a full https:// URL").max(300).or(z.literal("")),
});

export const saveCompanyAction = secureAction("settings:manage", companySchema, async (input, ctx) => {
  await db.organization.update({
    where: { id: ctx.orgId },
    data: { ...input, phone: toE164(input.phone), website: input.website || null, googleReviewUrl: input.googleReviewUrl || null },
  });
  await audit(ctx, "organization.updated", "Organization", ctx.orgId);
  revalidatePath("/", "layout");
});

export const saveHoursAction = secureAction(
  "settings:manage",
  z.object({
    businessHours: businessHoursSchema,
    emergency: z.object({ available24x7: z.boolean(), responseTargetHours: z.coerce.number().min(0.5).max(24), onCallEmployeeId: z.string().nullable(), policy: z.string().max(1000) }),
    bufferMinutes: z.coerce.number().int().min(0).max(120),
  }),
  async (input, ctx) => {
    if (input.emergency.onCallEmployeeId && !(await db.employee.findFirst({ where: { id: input.emergency.onCallEmployeeId, organizationId: ctx.orgId } }))) throw new ValidationError("On-call employee not found");
    await patchSettings(ctx, (s) => ({ ...s, businessHours: input.businessHours, emergency: input.emergency, scheduling: { ...s.scheduling, bufferMinutes: input.bufferMinutes } }), "settings.hours_updated");
    if (input.emergency.onCallEmployeeId) {
      await db.employee.updateMany({ where: { organizationId: ctx.orgId }, data: { isOnCall: false } });
      await db.employee.updateMany({ where: { organizationId: ctx.orgId, id: input.emergency.onCallEmployeeId }, data: { isOnCall: true } });
    }
    revalidatePath("/settings");
    revalidatePath("/calendar");
  },
);

export const saveReviewPolicyAction = secureAction("settings:manage", z.object({ policy: z.enum(["positive_only", "all_customers"]), delayHours: z.coerce.number().int().min(0).max(168) }), async (input, ctx) => {
  await patchSettings(ctx, (s) => ({ ...s, reviews: input }), "settings.review_policy_updated");
  revalidatePath("/settings");
  revalidatePath("/reviews");
});

export const addServiceAreaAction = secureAction(
  "settings:manage",
  z.object({ zip: z.string().trim().regex(/^\d{5}$/, "5-digit ZIP"), city: z.string().trim().min(2).max(80), county: z.string().trim().min(2).max(80) }),
  async (input, ctx) => {
    const exists = await db.serviceArea.findUnique({ where: { organizationId_zip: { organizationId: ctx.orgId, zip: input.zip } } });
    if (exists) throw new ValidationError(`ZIP ${input.zip} is already in your territory`);
    await db.serviceArea.create({ data: { ...input, organizationId: ctx.orgId } });
    await audit(ctx, "service_area.added", "ServiceArea", null, input);
    revalidatePath("/settings");
  },
);

export const removeServiceAreaAction = secureAction("settings:manage", z.object({ id: z.string().min(1) }), async ({ id }, ctx) => {
  const { count } = await db.serviceArea.deleteMany({ where: { id, organizationId: ctx.orgId } });
  if (!count) throw new ValidationError("Not found");
  await audit(ctx, "service_area.removed", "ServiceArea", id);
  revalidatePath("/settings");
});

export const addEmployeeAction = secureAction(
  "team:manage",
  z.object({ name: z.string().trim().min(2).max(80), title: z.string().trim().min(2).max(80), kind: z.enum(["DISPATCHER", "OFFICE", "TECHNICIAN"]), phone: z.string().trim().max(20).optional(), email: z.string().trim().email().max(120).optional().or(z.literal("")) }),
  async (input, ctx) => {
    const palette = ["#7c3aed", "#db2777", "#0284c7", "#65a30d", "#ea580c"];
    const count = await db.employee.count({ where: { organizationId: ctx.orgId } });
    const emp = await db.employee.create({ data: { organizationId: ctx.orgId, name: input.name, title: input.title, kind: input.kind, phone: toE164(input.phone) ?? null, email: input.email || null, color: palette[count % palette.length] } });
    await audit(ctx, "team.employee_added", "Employee", emp.id);
    revalidatePath("/settings");
  },
);

export const setEmployeeActiveAction = secureAction("team:manage", z.object({ id: z.string().min(1), active: z.boolean() }), async (input, ctx) => {
  const { count } = await db.employee.updateMany({ where: { id: input.id, organizationId: ctx.orgId, kind: { not: "OWNER" } }, data: { active: input.active } });
  if (!count) throw new ValidationError("Employee not found (owners can't be deactivated)");
  await audit(ctx, input.active ? "team.employee_activated" : "team.employee_deactivated", "Employee", input.id);
  revalidatePath("/settings");
});

// ── Billing ──────────────────────────────────────────────────────────────
export const checkoutAction = secureAction("billing:manage", z.object({ plan: z.enum(["STARTER", "GROWTH", "PRO"]) }), async ({ plan }, ctx, auth) => {
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.orgId } });
  const base = appUrl();
  const provider = getPaymentProvider();
  const { url, simulated } = await provider.createCheckoutSession({
    organizationId: ctx.orgId,
    plan,
    customerEmail: auth.user.email,
    stripeCustomerId: sub?.stripeCustomerId ?? null,
    successUrl: `${base}/billing?checkout=success`,
    cancelUrl: `${base}/billing?checkout=cancelled`,
  });
  if (simulated) {
    // Demo billing: switch plans locally, clearly labeled as non-production.
    const now = new Date();
    await db.subscription.upsert({
      where: { organizationId: ctx.orgId },
      update: { plan, status: "DEMO", isDemo: true },
      create: { organizationId: ctx.orgId, plan, status: "DEMO", isDemo: true, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000) },
    });
    await audit(ctx, "billing.demo_plan_changed", "Subscription", null, { plan });
    revalidatePath("/billing");
    revalidatePath("/", "layout");
  }
  return { url, simulated };
});

export const portalAction = secureAction("billing:manage", z.object({}), async (_input, ctx) => {
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.orgId } });
  const base = appUrl();
  return getPaymentProvider().createPortalSession({ stripeCustomerId: sub?.stripeCustomerId ?? null, returnUrl: `${base}/billing` });
});

export const savePhoneSettingsAction = secureAction("settings:manage", phoneSettingsFormSchema, async (input, ctx) => {
  const callflowNumber = toE164(input.callflowNumber) ?? "";
  if (input.mode === "ring_then_text_back" && !toE164(input.officeNumber)) throw new ValidationError("Enter the office phone to ring first");
  if (callflowNumber) {
    // A CallFlow number can belong to only one company (it routes live calls/texts).
    const clash = await db.organization.findFirst({ where: { id: { not: ctx.orgId }, settings: { path: ["phone", "callflowNumber"], equals: callflowNumber } } });
    if (clash) throw new ValidationError("That CallFlow number is already assigned to another company");
  }
  await patchSettings(
    ctx,
    (s) => ({
      ...s,
      phone: {
        mode: input.mode,
        callflowNumber,
        officeNumber: toE164(input.officeNumber) ?? "",
        ringSeconds: input.ringSeconds,
        alertPhone: toE164(input.alertPhone) ?? "",
        voicemail: input.voicemail,
        missedCallMessage: input.missedCallMessage,
      },
      sms: { ...s.sms, quietHoursStart: input.quietHoursStart, quietHoursEnd: input.quietHoursEnd, demoPhoneNumber: !callflowNumber },
    }),
    "settings.phone_updated",
  );
  revalidatePath("/settings");
});

export const sendTestAlertAction = secureAction("settings:manage", z.object({}), async (_i, ctx) => {
  const r = await alertStaff(ctx, "Test alert — staff alerts are working.");
  if (!r.sent) return { ok: false as const, error: "reason" in r ? `Not sent: ${r.reason}` : "Not sent" };
  return { simulated: Boolean("simulated" in r && r.simulated) };
});
