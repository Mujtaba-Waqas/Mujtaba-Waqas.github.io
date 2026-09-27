import { db } from "../db";
import { buildFollowupSchedule, STOP_REASON_LABELS, type StopReason } from "../domain/followups";
import { formatCents } from "../format";
import { audit } from "./audit";
import { NotFoundError, nowOf, ValidationError, type TenantContext } from "./context";
import { logEvent } from "./events";
import { sendSms } from "./messaging";

export async function getEstimateScoped(ctx: TenantContext, id: string) {
  const est = await db.estimate.findFirst({ where: { id, organizationId: ctx.orgId }, include: { customer: true, service: true } });
  if (!est) throw new NotFoundError("Estimate");
  return est;
}

async function nextEstimateNumber(ctx: TenantContext) {
  const count = await db.estimate.count({ where: { organizationId: ctx.orgId } });
  let n = 1041 + count;
  // Numbers are unique per org; skip forward on collision.
  while (await db.estimate.findUnique({ where: { organizationId_number: { organizationId: ctx.orgId, number: `EST-${n}` } } })) n++;
  return `EST-${n}`;
}

export interface EstimateInput {
  customerId: string;
  leadId?: string | null;
  serviceId?: string | null;
  assignedEmployeeId?: string | null;
  title: string;
  notes?: string | null;
  taxRateBps?: number;
  items: { description: string; quantity: number; unitPriceCents: number }[];
}

async function assertRefs(ctx: TenantContext, input: Partial<EstimateInput>) {
  if (input.customerId && !(await db.customer.findFirst({ where: { id: input.customerId, organizationId: ctx.orgId } }))) throw new NotFoundError("Customer");
  if (input.leadId && !(await db.lead.findFirst({ where: { id: input.leadId, organizationId: ctx.orgId } }))) throw new NotFoundError("Lead");
  if (input.serviceId && !(await db.service.findFirst({ where: { id: input.serviceId, organizationId: ctx.orgId } }))) throw new NotFoundError("Service");
  if (input.assignedEmployeeId && !(await db.employee.findFirst({ where: { id: input.assignedEmployeeId, organizationId: ctx.orgId } }))) throw new NotFoundError("Employee");
}

function totals(items: EstimateInput["items"], taxRateBps = 0) {
  const subtotalCents = items.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0);
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10_000);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

export async function createEstimate(ctx: TenantContext, input: EstimateInput) {
  await assertRefs(ctx, input);
  const number = await nextEstimateNumber(ctx);
  const t = totals(input.items, input.taxRateBps);
  const est = await db.estimate.create({
    data: {
      organizationId: ctx.orgId,
      number,
      customerId: input.customerId,
      leadId: input.leadId ?? null,
      serviceId: input.serviceId ?? null,
      assignedEmployeeId: input.assignedEmployeeId ?? null,
      title: input.title,
      notes: input.notes ?? null,
      ...t,
      expiresAt: new Date(nowOf(ctx).getTime() + 30 * 86_400_000),
      items: { create: input.items.map((i, idx) => ({ ...i, organizationId: ctx.orgId, sortOrder: idx })) },
    },
  });
  await logEvent(ctx, { leadId: est.leadId, customerId: est.customerId, type: "estimate_created", title: `Estimate ${number} created`, detail: `${input.title} · ${formatCents(t.totalCents)}`, actor: "STAFF" });
  await audit(ctx, "estimate.created", "Estimate", est.id, { number, totalCents: t.totalCents });
  return est;
}

export async function updateEstimate(ctx: TenantContext, id: string, input: EstimateInput) {
  const est = await getEstimateScoped(ctx, id);
  if (["ACCEPTED", "DECLINED"].includes(est.status)) throw new ValidationError("Closed estimates can't be edited");
  await assertRefs(ctx, input);
  const t = totals(input.items, input.taxRateBps);
  await db.$transaction([
    db.estimateItem.deleteMany({ where: { estimateId: id, organizationId: ctx.orgId } }),
    db.estimate.update({
      where: { id },
      data: {
        customerId: input.customerId,
        leadId: input.leadId ?? null,
        serviceId: input.serviceId ?? null,
        assignedEmployeeId: input.assignedEmployeeId ?? null,
        title: input.title,
        notes: input.notes ?? null,
        ...t,
        items: { create: input.items.map((i, idx) => ({ ...i, organizationId: ctx.orgId, sortOrder: idx })) },
      },
    }),
  ]);
  await audit(ctx, "estimate.updated", "Estimate", id, { totalCents: t.totalCents });
}

/** Marks the estimate sent and schedules the Day 1 / 3 / 7 recovery sequence. */
export async function markEstimateSent(ctx: TenantContext, id: string) {
  const est = await getEstimateScoped(ctx, id);
  if (est.status !== "DRAFT") throw new ValidationError("Only draft estimates can be marked as sent");
  if (est.totalCents <= 0) throw new ValidationError("Add at least one line item first");
  const now = nowOf(ctx);
  const automation = await db.automation.findUnique({ where: { organizationId_key: { organizationId: ctx.orgId, key: "ESTIMATE_RECOVERY" } } });
  const schedule = buildFollowupSchedule(now, automation?.delaysHours?.length ? automation.delaysHours : undefined);
  await db.$transaction([
    db.estimate.update({ where: { id }, data: { status: "SENT", sentAt: now, followupStage: 0, automationPaused: false, automationStopReason: null } }),
    db.followup.deleteMany({ where: { estimateId: id, organizationId: ctx.orgId } }),
    db.followup.createMany({ data: schedule.map((s) => ({ organizationId: ctx.orgId, estimateId: id, customerId: est.customerId, stage: s.stage, scheduledFor: s.scheduledFor })) }),
  ]);
  if (est.leadId) await db.lead.updateMany({ where: { id: est.leadId, organizationId: ctx.orgId, status: { notIn: ["WON", "LOST"] } }, data: { status: "ESTIMATE_SENT" } });
  await logEvent(ctx, { leadId: est.leadId, customerId: est.customerId, type: "estimate_sent", title: `Estimate ${est.number} sent`, detail: `Recovery follow-ups scheduled for day 1, 3 and 7`, actor: "STAFF" });
  await audit(ctx, "estimate.sent", "Estimate", id);
}

export async function cancelPendingFollowups(ctx: TenantContext, where: { estimateId?: string; customerId?: string }, reason: StopReason) {
  const { count } = await db.followup.updateMany({
    where: { organizationId: ctx.orgId, status: "SCHEDULED", ...where },
    data: { status: "CANCELLED", cancelledReason: STOP_REASON_LABELS[reason] },
  });
  const estimateFilter = where.estimateId ? { id: where.estimateId } : { customerId: where.customerId };
  await db.estimate.updateMany({
    where: { organizationId: ctx.orgId, ...estimateFilter, status: { in: ["SENT", "VIEWED"] } },
    data: { automationStopReason: STOP_REASON_LABELS[reason] },
  });
  return count;
}

export async function closeEstimate(ctx: TenantContext, id: string, outcome: "ACCEPTED" | "DECLINED", via: "STAFF" | "CUSTOMER" = "STAFF") {
  const est = await getEstimateScoped(ctx, id);
  if (!["SENT", "VIEWED", "DRAFT", "EXPIRED"].includes(est.status)) throw new ValidationError(`Estimate is already ${est.status.toLowerCase()}`);
  const now = nowOf(ctx);
  // Revenue is attributed to automation only if at least one automated follow-up went out before the decision.
  const recovered = outcome === "ACCEPTED" && est.followupStage > 0;
  await db.estimate.update({
    where: { id },
    data: {
      status: outcome,
      acceptedAt: outcome === "ACCEPTED" ? now : null,
      declinedAt: outcome === "DECLINED" ? now : null,
      recoveredByAutomation: recovered,
    },
  });
  await cancelPendingFollowups(ctx, { estimateId: id }, outcome);
  if (est.leadId) {
    await db.lead.updateMany({
      where: { id: est.leadId, organizationId: ctx.orgId },
      data: outcome === "ACCEPTED" ? { status: "WON", wonAt: now } : { status: "LOST", lostAt: now, lostReason: "Estimate declined" },
    });
  }
  await logEvent(ctx, {
    leadId: est.leadId,
    customerId: est.customerId,
    type: outcome === "ACCEPTED" ? "estimate_accepted" : "estimate_declined",
    title: `Estimate ${est.number} ${outcome.toLowerCase()}${via === "CUSTOMER" ? " by customer via SMS" : ""}`,
    detail: recovered ? `Recovered after ${est.followupStage} automated follow-up${est.followupStage > 1 ? "s" : ""} · ${formatCents(est.totalCents)} attributed` : formatCents(est.totalCents),
    actor: via,
  });
  await audit(ctx, `estimate.${outcome.toLowerCase()}`, "Estimate", id, { recovered, via });
  return { recovered };
}

export async function setEstimateAutomationPaused(ctx: TenantContext, id: string, paused: boolean) {
  const est = await getEstimateScoped(ctx, id);
  await db.estimate.update({ where: { id }, data: { automationPaused: paused, automationStopReason: paused ? STOP_REASON_LABELS.PAUSED : null } });
  await logEvent(ctx, { leadId: est.leadId, customerId: est.customerId, type: paused ? "automation_paused" : "automation_resumed", title: `Estimate follow-ups ${paused ? "paused" : "resumed"}`, actor: "STAFF" });
  await audit(ctx, paused ? "estimate.automation_paused" : "estimate.automation_resumed", "Estimate", id);
}

export async function assignEstimate(ctx: TenantContext, id: string, employeeId: string | null) {
  await getEstimateScoped(ctx, id);
  if (employeeId && !(await db.employee.findFirst({ where: { id: employeeId, organizationId: ctx.orgId } }))) throw new NotFoundError("Employee");
  await db.estimate.update({ where: { id }, data: { assignedEmployeeId: employeeId } });
  await audit(ctx, "estimate.assigned", "Estimate", id, { employeeId });
}

export async function sendManualEstimateFollowup(ctx: TenantContext, id: string, body: string) {
  const est = await getEstimateScoped(ctx, id);
  const result = await sendSms(ctx, { customerId: est.customerId, body, sender: "STAFF", estimateId: id });
  await logEvent(ctx, {
    leadId: est.leadId,
    customerId: est.customerId,
    type: "manual_followup",
    title: result.ok ? "Manual follow-up sent" : "Manual follow-up blocked",
    detail: result.ok ? body : result.reason,
    actor: "STAFF",
  });
  return result;
}
