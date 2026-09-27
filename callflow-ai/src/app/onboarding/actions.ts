"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { secureAction } from "@/lib/actions";
import { getAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { COUNTY_PRESETS, createOrganization } from "@/lib/services/organizations";

export async function createOrganizationAction(input: { name: string }): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Please sign in again." };
  const parsed = z.object({ name: z.string().trim().min(2, "Company name is required").max(120) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const org = await createOrganization(auth.userId, parsed.data.name, { owner: { name: auth.user.name, email: auth.user.email } });
  await db.session.update({ where: { id: auth.sessionId }, data: { activeOrganizationId: org.id } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export const setOnboardingStepAction = secureAction("settings:manage", z.object({ step: z.number().int().min(1).max(10) }), async ({ step }, ctx) => {
  await db.organization.update({ where: { id: ctx.orgId }, data: { onboardingStep: step } });
});

export const setServicesAction = secureAction("settings:manage", z.object({ activeIds: z.array(z.string().min(1)).max(50) }), async ({ activeIds }, ctx) => {
  await db.service.updateMany({ where: { organizationId: ctx.orgId }, data: { active: false } });
  await db.service.updateMany({ where: { organizationId: ctx.orgId, id: { in: activeIds } }, data: { active: true } });
  await audit(ctx, "services.updated", "Service", null, { active: activeIds.length });
});

export const addCountyPresetAction = secureAction("settings:manage", z.object({ county: z.enum(["Salt Lake", "Davis", "Utah", "Weber"]) }), async ({ county }, ctx) => {
  const rows = COUNTY_PRESETS[county];
  await db.serviceArea.createMany({ data: rows.map((r) => ({ ...r, county, organizationId: ctx.orgId })), skipDuplicates: true });
  await audit(ctx, "service_area.preset_added", "ServiceArea", null, { county });
  revalidatePath("/onboarding");
});

export const setIntegrationChoiceAction = secureAction(
  "integrations:manage",
  z.object({ provider: z.enum(["TWILIO", "GOOGLE_CALENDAR"]), mode: z.enum(["DEMO", "CONNECTED"]) }),
  async ({ provider, mode }, ctx) => {
    await db.integration.upsert({
      where: { organizationId_provider: { organizationId: ctx.orgId, provider } },
      update: { status: mode, connectedAt: new Date(), config: provider === "TWILIO" && mode === "DEMO" ? { phoneNumber: "+18015550198", note: "Demo number — simulated calls & SMS" } : {} },
      create: { organizationId: ctx.orgId, provider, status: mode, connectedAt: new Date() },
    });
    await audit(ctx, "integration.configured", "Integration", null, { provider, mode });
  },
);

export const activateAction = secureAction("settings:manage", z.object({}), async (_i, ctx) => {
  await db.organization.update({ where: { id: ctx.orgId }, data: { onboardingStep: 10, onboardingCompletedAt: new Date() } });
  await audit(ctx, "organization.onboarding_completed", "Organization", ctx.orgId);
  revalidatePath("/", "layout");
});
