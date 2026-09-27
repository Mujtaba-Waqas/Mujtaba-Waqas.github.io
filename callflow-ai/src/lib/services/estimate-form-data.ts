import { db } from "../db";
import { customerName } from "../format";
import type { TenantContext } from "./context";
import { getLookups } from "./lookups";

export async function getEstimateFormData(ctx: TenantContext) {
  const [lookups, customers, leads] = await Promise.all([
    getLookups(ctx),
    db.customer.findMany({ where: { organizationId: ctx.orgId }, orderBy: [{ lastName: "asc" }], select: { id: true, firstName: true, lastName: true, city: true } }),
    db.lead.findMany({ where: { organizationId: ctx.orgId, status: { notIn: ["LOST"] } }, orderBy: { createdAt: "desc" }, take: 400, select: { id: true, requestedService: true, customerId: true, createdAt: true } }),
  ]);
  return {
    services: lookups.services,
    employees: lookups.employees.filter((e) => e.kind !== "TECHNICIAN" || true),
    customers: customers.map((c) => ({ id: c.id, label: `${customerName(c)}${c.city ? ` — ${c.city}` : ""}` })),
    leads: leads.map((l) => ({ id: l.id, customerId: l.customerId, label: `${l.requestedService} (${l.createdAt.toISOString().slice(0, 10)})` })),
  };
}
