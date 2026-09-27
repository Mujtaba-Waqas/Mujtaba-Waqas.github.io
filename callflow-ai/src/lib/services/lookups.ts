import { db } from "../db";
import type { TenantContext } from "./context";

export async function getLookups(ctx: TenantContext) {
  const [services, employees] = await Promise.all([
    db.service.findMany({ where: { organizationId: ctx.orgId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, category: true, durationMinutes: true } }),
    db.employee.findMany({ where: { organizationId: ctx.orgId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true, color: true, isOnCall: true } }),
  ]);
  return { services, employees, technicians: employees.filter((e) => e.kind === "TECHNICIAN") };
}
