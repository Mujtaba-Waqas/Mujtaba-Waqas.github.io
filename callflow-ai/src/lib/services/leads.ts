import type { LeadSource, LeadStatus, Urgency } from "@prisma/client";
import { db } from "../db";
import { audit } from "./audit";
import { NotFoundError, nowOf, type TenantContext } from "./context";
import { findOrCreateCustomer } from "./customers";
import { logEvent } from "./events";

export const LEAD_STAGES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "BOOKED", "ESTIMATE_SENT", "WON", "LOST"];

export async function getLeadScoped(ctx: TenantContext, id: string) {
  const lead = await db.lead.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!lead) throw new NotFoundError("Lead");
  return lead;
}

export interface CreateLeadInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  source: LeadSource;
  urgency: Urgency;
  requestedService: string;
  serviceId?: string | null;
  description?: string | null;
  estimatedValueCents?: number | null;
  assignedEmployeeId?: string | null;
  notes?: string | null;
}

export async function createLead(ctx: TenantContext, input: CreateLeadInput, actor: "STAFF" | "AI" | "SYSTEM" = "STAFF") {
  if (input.assignedEmployeeId) {
    const emp = await db.employee.findFirst({ where: { id: input.assignedEmployeeId, organizationId: ctx.orgId } });
    if (!emp) throw new NotFoundError("Employee");
  }
  if (input.serviceId) {
    const svc = await db.service.findFirst({ where: { id: input.serviceId, organizationId: ctx.orgId } });
    if (!svc) throw new NotFoundError("Service");
  }
  const customer = await findOrCreateCustomer(ctx, input);
  const lead = await db.lead.create({
    data: {
      organizationId: ctx.orgId,
      customerId: customer.id,
      source: input.source,
      urgency: input.urgency,
      requestedService: input.requestedService,
      serviceId: input.serviceId ?? null,
      description: input.description ?? null,
      estimatedValueCents: input.estimatedValueCents ?? null,
      assignedEmployeeId: input.assignedEmployeeId ?? null,
      notes: input.notes ?? null,
      createdAt: nowOf(ctx),
    },
  });
  await logEvent(ctx, { leadId: lead.id, customerId: customer.id, type: "lead_created", title: "Lead created", detail: `${input.requestedService} · via ${input.source.replace(/_/g, " ").toLowerCase()}`, actor });
  await audit(ctx, "lead.created", "Lead", lead.id, { source: input.source });
  return lead;
}

export async function updateLeadStatus(ctx: TenantContext, id: string, status: LeadStatus, lostReason?: string | null) {
  const lead = await getLeadScoped(ctx, id);
  const now = nowOf(ctx);
  const updated = await db.lead.update({
    where: { id },
    data: {
      status,
      wonAt: status === "WON" ? now : lead.wonAt,
      lostAt: status === "LOST" ? now : lead.lostAt,
      lostReason: status === "LOST" ? (lostReason ?? lead.lostReason ?? "Not specified") : lead.lostReason,
      firstResponseAt: lead.firstResponseAt ?? (status !== "NEW" ? now : null),
    },
  });
  await logEvent(ctx, { leadId: id, customerId: lead.customerId, type: "stage_changed", title: `Moved to ${status.replace("_", " ").toLowerCase()}`, detail: status === "LOST" ? lostReason : null, actor: ctx.userId ? "STAFF" : "SYSTEM" });
  await audit(ctx, "lead.status_changed", "Lead", id, { from: lead.status, to: status });
  return updated;
}

export async function updateLead(ctx: TenantContext, id: string, input: { assignedEmployeeId?: string | null; notes?: string | null; estimatedValueCents?: number | null; urgency?: Urgency }) {
  await getLeadScoped(ctx, id);
  if (input.assignedEmployeeId) {
    const emp = await db.employee.findFirst({ where: { id: input.assignedEmployeeId, organizationId: ctx.orgId } });
    if (!emp) throw new NotFoundError("Employee");
  }
  const updated = await db.lead.update({ where: { id }, data: input });
  await audit(ctx, "lead.updated", "Lead", id, Object.keys(input));
  return updated;
}

export async function addLeadNote(ctx: TenantContext, id: string, note: string) {
  const lead = await getLeadScoped(ctx, id);
  await logEvent(ctx, { leadId: id, customerId: lead.customerId, type: "note", title: "Note added", detail: note, actor: "STAFF" });
}
