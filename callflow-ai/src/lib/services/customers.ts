import type { LeadSource } from "@prisma/client";
import { db } from "../db";
import { toE164 } from "../format";
import { NotFoundError, ValidationError, type TenantContext } from "./context";

export async function getCustomerScoped(ctx: TenantContext, id: string) {
  const c = await db.customer.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!c) throw new NotFoundError("Customer");
  return c;
}

export async function findCustomerByPhone(ctx: TenantContext, phone: string) {
  const e164 = toE164(phone);
  if (!e164) return null;
  return db.customer.findUnique({ where: { organizationId_phone: { organizationId: ctx.orgId, phone: e164 } } });
}

export async function findOrCreateCustomer(
  ctx: TenantContext,
  input: { firstName?: string | null; lastName?: string | null; phone: string; email?: string | null; address?: string | null; city?: string | null; zip?: string | null; source?: LeadSource },
) {
  const e164 = toE164(input.phone);
  if (!e164) throw new ValidationError("A valid US phone number is required");
  const existing = await db.customer.findUnique({ where: { organizationId_phone: { organizationId: ctx.orgId, phone: e164 } } });
  if (existing) {
    // Fill blanks only — never overwrite data a human entered.
    return db.customer.update({
      where: { id: existing.id },
      data: {
        firstName: existing.firstName === "Unknown" && input.firstName ? input.firstName : existing.firstName,
        lastName: existing.lastName === "Caller" && input.lastName ? input.lastName : existing.lastName,
        email: existing.email ?? input.email ?? null,
        address: existing.address ?? input.address ?? null,
        city: existing.city ?? input.city ?? null,
        zip: existing.zip ?? input.zip ?? null,
      },
    });
  }
  return db.customer.create({
    data: {
      organizationId: ctx.orgId,
      firstName: input.firstName || "Unknown",
      lastName: input.lastName || "Caller",
      phone: e164,
      email: input.email ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      zip: input.zip ?? null,
      tags: input.source ? [input.source.toLowerCase().replace(/_/g, "-")] : [],
    },
  });
}
