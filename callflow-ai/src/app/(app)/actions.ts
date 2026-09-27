"use server";

import type { AutomationKey } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { secureAction } from "@/lib/actions";
import { db } from "@/lib/db";
import { renderTemplate } from "@/lib/domain/followups";
import { containsReviewIncentive } from "@/lib/domain/intents";
import { formatCents, formatPhone } from "@/lib/format";
import { getAIProvider } from "@/lib/providers";
import { audit } from "@/lib/services/audit";
import { runAutomation, TEMPLATE_SEPARATOR } from "@/lib/services/automations";
import { processCallTurn, startCall } from "@/lib/services/calls";
import { loadOrg, ValidationError } from "@/lib/services/context";
import { assignEstimate, closeEstimate, createEstimate, markEstimateSent, sendManualEstimateFollowup, setEstimateAutomationPaused, trackSentEstimate, updateEstimate } from "@/lib/services/estimates";
import { zonedDateKey, zonedTimeToUtc } from "@/lib/time";
import { logEvent } from "@/lib/services/events";
import { handleInboundSms } from "@/lib/services/inbound-sms";
import { deleteKnowledgeDoc, getKnowledgeDocs, upsertKnowledgeDoc } from "@/lib/services/knowledge";
import { addLeadNote, createLead, updateLead, updateLeadStatus } from "@/lib/services/leads";
import { markConversationRead, sendSms, setHumanTakeover } from "@/lib/services/messaging";
import { bookAppointment, getAvailableSlots, rescheduleAppointment, setAppointmentStatus } from "@/lib/services/scheduling";
import {
  automationUpdateSchema, bookAppointmentSchema, createLeadSchema, estimateSchema, knowledgeSchema, noteSchema, quickEstimateSchema, rescheduleSchema, simulateInboundSchema,
  simulatorStartSchema, simulatorTurnSchema, smsSchema, updateLeadSchema, updateLeadStatusSchema,
} from "@/lib/validation/schemas";

const idOnly = z.object({ id: z.string().min(1).max(64) });
const AUTOMATION_KEYS = ["ESTIMATE_RECOVERY", "APPOINTMENT_REMINDERS", "REVIEW_REQUESTS", "MISSED_CALL_RECOVERY", "NEW_LEAD_FOLLOWUP"] as const;

// ── Leads ────────────────────────────────────────────────────────────────
export const createLeadAction = secureAction("leads:write", createLeadSchema, async (input, ctx) => {
  const lead = await createLead(ctx, { ...input, estimatedValueCents: input.estimatedValue ? Math.round(input.estimatedValue * 100) : null });
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { id: lead.id };
});

export const updateLeadStatusAction = secureAction("leads:write", updateLeadStatusSchema, async (input, ctx) => {
  await updateLeadStatus(ctx, input.id, input.status, input.lostReason);
  revalidatePath("/leads");
  revalidatePath(`/leads/${input.id}`);
});

export const updateLeadAction = secureAction("leads:write", updateLeadSchema, async (input, ctx) => {
  await updateLead(ctx, input.id, {
    assignedEmployeeId: input.assignedEmployeeId,
    urgency: input.urgency,
    estimatedValueCents: input.estimatedValue === null ? null : Math.round(input.estimatedValue * 100),
    notes: input.notes,
  });
  revalidatePath(`/leads/${input.id}`);
});

export const addLeadNoteAction = secureAction("leads:write", noteSchema, async (input, ctx) => {
  await addLeadNote(ctx, input.id, input.note);
  revalidatePath(`/leads/${input.id}`);
});

// ── Messaging ────────────────────────────────────────────────────────────
export const sendSmsAction = secureAction("inbox:send", smsSchema, async (input, ctx) => {
  const r = await sendSms(ctx, { customerId: input.customerId, body: input.body, sender: "STAFF" });
  revalidatePath("/inbox");
  if (!r.ok) return { ok: false as const, error: r.reason };
  return { simulated: r.simulated };
});

export const simulateInboundSmsAction = secureAction("inbox:send", simulateInboundSchema, async (input, ctx) => {
  const customer = await db.customer.findFirst({ where: { id: input.customerId, organizationId: ctx.orgId } });
  if (!customer) throw new ValidationError("Customer not found");
  const result = await handleInboundSms(ctx, { from: customer.phone, body: input.body, simulated: true });
  revalidatePath("/inbox");
  revalidatePath("/estimates", "layout");
  revalidatePath("/reviews");
  return { action: result.action };
});

export const setTakeoverAction = secureAction("inbox:send", z.object({ conversationId: z.string().min(1), enabled: z.boolean() }), async (input, ctx) => {
  await setHumanTakeover(ctx, input.conversationId, input.enabled);
  revalidatePath("/inbox");
});

export const markReadAction = secureAction("inbox:view", z.object({ conversationId: z.string().min(1) }), async (input, ctx) => {
  await markConversationRead(ctx, input.conversationId);
});

export const suggestReplyAction = secureAction("inbox:view", z.object({ conversationId: z.string().min(1) }), async (input, ctx) => {
  const convo = await db.conversation.findFirst({
    where: { id: input.conversationId, organizationId: ctx.orgId },
    include: { customer: true, messages: { orderBy: { createdAt: "asc" }, take: 40 } },
  });
  if (!convo) throw new ValidationError("Conversation not found");
  const { org, settings } = await loadOrg(ctx);
  const [estimate, appt, knowledge] = await Promise.all([
    db.estimate.findFirst({ where: { organizationId: ctx.orgId, customerId: convo.customerId, status: { in: ["SENT", "VIEWED"] } }, include: { service: true } }),
    db.appointment.findFirst({ where: { organizationId: ctx.orgId, customerId: convo.customerId, startAt: { gte: new Date() }, status: { in: ["SCHEDULED", "CONFIRMED"] } }, orderBy: { startAt: "asc" } }),
    getKnowledgeDocs(ctx),
  ]);
  return getAIProvider().suggestSmsReply({
    businessName: org.name,
    customerFirstName: convo.customer.firstName === "Unknown" ? "" : convo.customer.firstName,
    messages: convo.messages.map((m) => ({ direction: m.direction, body: m.body })),
    knowledge,
    prohibitedClaims: settings.receptionist.prohibitedClaims,
    context: {
      openEstimate: estimate ? { number: estimate.number, service: estimate.service?.name ?? estimate.title, amount: formatCents(estimate.totalCents) } : null,
      nextAppointment: appt ? new Intl.DateTimeFormat("en-US", { timeZone: org.timezone, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(appt.startAt) : null,
    },
  });
});

// ── Estimates ────────────────────────────────────────────────────────────
function toEstimateInput(input: z.infer<typeof estimateSchema>) {
  return {
    customerId: input.customerId,
    leadId: input.leadId,
    serviceId: input.serviceId,
    assignedEmployeeId: input.assignedEmployeeId,
    title: input.title,
    notes: input.notes,
    taxRateBps: Math.round(input.taxRatePercent * 100),
    items: input.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPriceCents: Math.round(i.unitPrice * 100) })),
  };
}

export const saveEstimateAction = secureAction("estimates:write", estimateSchema, async (input, ctx) => {
  if (input.id) {
    await updateEstimate(ctx, input.id, toEstimateInput(input));
    revalidatePath(`/estimates/${input.id}`);
    return { id: input.id };
  }
  const est = await createEstimate(ctx, toEstimateInput(input));
  revalidatePath("/estimates");
  return { id: est.id };
});

export const trackSentEstimateAction = secureAction("estimates:write", quickEstimateSchema, async (input, ctx) => {
  const { org } = await loadOrg(ctx);
  const [y, m, d] = input.sentOn.split("-").map(Number);
  // Today → now; earlier days → mid-afternoon of that day in the company's timezone.
  const sentAt = input.sentOn === zonedDateKey(new Date(), org.timezone) ? new Date() : zonedTimeToUtc(y, m, d, 15, 0, org.timezone);
  const est = await trackSentEstimate(ctx, {
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    title: input.title,
    amountCents: Math.round(input.amount * 100),
    serviceId: input.serviceId,
    sentAt,
    smsConsent: input.smsConsent,
  });
  revalidatePath("/estimates");
  revalidatePath("/dashboard");
  return { id: est.id };
});

export const estimateCommandAction = secureAction(
  "estimates:write",
  z.object({ id: z.string().min(1), command: z.enum(["send", "accept", "decline", "pause", "resume"]) }),
  async ({ id, command }, ctx) => {
    if (command === "send") await markEstimateSent(ctx, id);
    if (command === "accept") await closeEstimate(ctx, id, "ACCEPTED");
    if (command === "decline") await closeEstimate(ctx, id, "DECLINED");
    if (command === "pause") await setEstimateAutomationPaused(ctx, id, true);
    if (command === "resume") await setEstimateAutomationPaused(ctx, id, false);
    revalidatePath(`/estimates/${id}`);
    revalidatePath("/estimates");
    revalidatePath("/dashboard");
  },
);

export const assignEstimateAction = secureAction("estimates:write", z.object({ id: z.string().min(1), employeeId: z.string().nullable() }), async (input, ctx) => {
  await assignEstimate(ctx, input.id, input.employeeId);
  revalidatePath(`/estimates/${input.id}`);
});

export const manualFollowupAction = secureAction("estimates:write", z.object({ id: z.string().min(1), body: z.string().trim().min(5).max(1600) }), async (input, ctx) => {
  const r = await sendManualEstimateFollowup(ctx, input.id, input.body);
  revalidatePath(`/estimates/${input.id}`);
  revalidatePath("/inbox");
  if (!r.ok) return { ok: false as const, error: r.reason };
});

// ── Automations ──────────────────────────────────────────────────────────
export const runAutomationAction = secureAction("automations:manage", z.object({ key: z.enum(AUTOMATION_KEYS) }), async ({ key }, ctx) => {
  const run = await runAutomation(ctx, key as AutomationKey, { trigger: "MANUAL", force: true });
  for (const p of ["/automations", "/inbox", "/estimates", "/dashboard", "/reviews", "/leads", "/calls"]) revalidatePath(p, "layout");
  return { status: run.status, actions: run.actionsTaken, skipped: run.skipped, log: run.log as { level: string; message: string }[] };
});

export const updateAutomationAction = secureAction("automations:manage", automationUpdateSchema, async (input, ctx) => {
  if (input.key === "REVIEW_REQUESTS" && input.templates.some(containsReviewIncentive)) {
    throw new ValidationError("Review requests can't offer incentives (discounts, gift cards, rewards). Remove that wording.");
  }
  const automation = await db.automation.findUnique({ where: { organizationId_key: { organizationId: ctx.orgId, key: input.key } } });
  if (!automation) throw new ValidationError("Automation not found");
  await db.automation.update({ where: { id: automation.id }, data: { enabled: input.enabled, template: input.templates.join(TEMPLATE_SEPARATOR), delaysHours: input.delaysHours } });
  await audit(ctx, "automation.updated", "Automation", automation.id, { key: input.key, enabled: input.enabled });
  revalidatePath("/automations");
});

export const toggleAutomationAction = secureAction("automations:manage", z.object({ key: z.enum(AUTOMATION_KEYS), enabled: z.boolean() }), async (input, ctx) => {
  const { count } = await db.automation.updateMany({ where: { organizationId: ctx.orgId, key: input.key }, data: { enabled: input.enabled } });
  if (!count) throw new ValidationError("Automation not found");
  await audit(ctx, input.enabled ? "automation.enabled" : "automation.disabled", "Automation", null, { key: input.key });
  revalidatePath("/automations");
});

// ── Calendar ─────────────────────────────────────────────────────────────
export const bookAppointmentAction = secureAction("calendar:write", bookAppointmentSchema, async (input, ctx) => {
  const service = await db.service.findFirst({ where: { id: input.serviceId, organizationId: ctx.orgId } });
  if (!service) throw new ValidationError("Service not found");
  const startAt = new Date(input.startAt);
  const duration = input.isEmergency ? 120 : service.durationMinutes;
  const appt = await bookAppointment(ctx, {
    customerId: input.customerId,
    leadId: input.leadId,
    serviceId: service.id,
    technicianId: input.technicianId,
    title: `${service.name}${input.isEmergency ? " — Emergency" : ""}`,
    startAt,
    endAt: new Date(startAt.getTime() + duration * 60_000),
    isEmergency: input.isEmergency,
    bookedBy: "STAFF",
    notes: input.notes,
    estimatedValueCents: service.startingPriceCents,
  });
  const { org } = await loadOrg(ctx);
  const r = await sendSms(ctx, {
    customerId: input.customerId,
    appointmentId: appt.id,
    sender: "SYSTEM",
    body: `${org.name}: You're confirmed for ${new Intl.DateTimeFormat("en-US", { timeZone: org.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(startAt)} — ${appt.title}. Questions? Call ${formatPhone(org.phone)}. Reply STOP to opt out.`,
  });
  if (r.ok) await db.appointment.update({ where: { id: appt.id }, data: { confirmationSentAt: new Date() } });
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { id: appt.id };
});

export const rescheduleAction = secureAction("calendar:write", rescheduleSchema, async (input, ctx) => {
  await rescheduleAppointment(ctx, input.id, { startAt: new Date(input.startAt), technicianId: input.technicianId });
  revalidatePath("/calendar");
});

export const appointmentStatusAction = secureAction(
  "calendar:write",
  z.object({ id: z.string().min(1), status: z.enum(["CANCELLED", "COMPLETED", "NO_SHOW", "IN_PROGRESS"]), reason: z.string().max(200).optional() }),
  async (input, ctx) => {
    await setAppointmentStatus(ctx, input.id, input.status, input.reason);
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
  },
);

export const availabilityAction = secureAction(
  "calendar:write",
  z.object({ serviceId: z.string().min(1), emergency: z.boolean(), offset: z.number().int().min(0).max(60).default(0) }),
  async (input, ctx) => {
    const slots = await getAvailableSlots(ctx, { emergency: input.emergency, serviceId: input.serviceId, offset: input.offset, count: 6 });
    return slots;
  },
);

// ── Call simulator ───────────────────────────────────────────────────────
export const startSimulationAction = secureAction("calls:simulate", simulatorStartSchema, async (input, ctx) => {
  const r = await startCall(ctx, { callerNumber: input.callerNumber, clock: input.clock, simulated: true });
  return { callId: r.callId, reply: r.reply, state: r.state };
});

export const simulationTurnAction = secureAction("calls:simulate", simulatorTurnSchema, async (input, ctx) => {
  const r = await processCallTurn(ctx, input.callId, input.text);
  const call = await db.call.findFirst({
    where: { id: input.callId, organizationId: ctx.orgId },
    include: {
      lead: { select: { id: true, status: true, urgency: true, requestedService: true } },
      appointment: { select: { id: true, startAt: true, endAt: true, title: true, technician: { select: { name: true } } } },
      customer: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  const [events, messages] = await Promise.all([
    call?.leadId || call?.customerId
      ? db.leadEvent.findMany({ where: { organizationId: ctx.orgId, OR: [{ metadata: { path: ["callId"], equals: input.callId } }, ...(call?.appointment ? [{ metadata: { path: ["appointmentId"], equals: call.appointment.id } }] : [])] }, orderBy: { createdAt: "asc" } })
      : db.leadEvent.findMany({ where: { organizationId: ctx.orgId, metadata: { path: ["callId"], equals: input.callId } }, orderBy: { createdAt: "asc" } }),
    call?.customerId ? db.message.findMany({ where: { organizationId: ctx.orgId, customerId: call.customerId, direction: "OUTBOUND", createdAt: { gte: call.startedAt } }, orderBy: { createdAt: "asc" } }) : [],
  ]);
  if (r.ended) {
    revalidatePath("/calls");
    revalidatePath("/dashboard");
  }
  return {
    reply: r.reply,
    state: r.state,
    ended: r.ended,
    transferTo: r.transferTo,
    records: {
      callId: input.callId,
      lead: call?.lead ?? null,
      customer: call?.customer ?? null,
      appointment: call?.appointment ? { id: call.appointment.id, title: call.appointment.title, startAt: call.appointment.startAt.toISOString(), technician: call.appointment.technician?.name ?? null } : null,
      events: events.map((e) => ({ id: e.id, title: e.title, detail: e.detail, at: e.createdAt.toISOString() })),
      messages: messages.map((m) => ({ id: m.id, body: m.body, status: m.status })),
      status: call?.status ?? "IN_PROGRESS",
    },
  };
});

// ── Knowledge base & receptionist ────────────────────────────────────────
export const saveKnowledgeAction = secureAction("knowledge:manage", knowledgeSchema, async (input, ctx) => {
  const id = await upsertKnowledgeDoc(ctx, input);
  revalidatePath("/knowledge-base");
  return { id };
});

export const deleteKnowledgeAction = secureAction("knowledge:manage", idOnly, async ({ id }, ctx) => {
  await deleteKnowledgeDoc(ctx, id);
  revalidatePath("/knowledge-base");
});

export const testAIResponseAction = secureAction("receptionist:manage", z.object({ question: z.string().trim().min(3).max(500) }), async ({ question }, ctx) => {
  const { settings } = await loadOrg(ctx);
  const docs = (await getKnowledgeDocs(ctx)).filter((d) => settings.receptionist.knowledgeCategories.includes(d.category));
  const provider = getAIProvider();
  const answer = await provider.answerQuestion({ question, knowledge: docs, prohibitedClaims: settings.receptionist.prohibitedClaims });
  await db.usageRecord.create({ data: { organizationId: ctx.orgId, type: "AI_REQUESTS", quantity: 1 } });
  return { ...answer, provider: provider.name };
});

// ── Reviews ──────────────────────────────────────────────────────────────
export const resolveReviewAction = secureAction("reviews:manage", z.object({ id: z.string().min(1), notes: z.string().trim().min(3).max(1000) }), async (input, ctx) => {
  const review = await db.review.findFirst({ where: { id: input.id, organizationId: ctx.orgId } });
  if (!review) throw new ValidationError("Review not found");
  await db.review.update({ where: { id: review.id }, data: { status: "RESOLVED", resolvedAt: new Date(), notes: input.notes } });
  await db.conversation.updateMany({ where: { organizationId: ctx.orgId, customerId: review.customerId }, data: { humanTakeover: false, takeoverReason: null } });
  await logEvent(ctx, { customerId: review.customerId, type: "review_resolved", title: "Negative feedback resolved", detail: input.notes, actor: "STAFF" });
  await audit(ctx, "review.resolved", "Review", review.id);
  revalidatePath("/reviews");
});

export const sendReviewLinkAction = secureAction("reviews:manage", idOnly, async ({ id }, ctx) => {
  const review = await db.review.findFirst({ where: { id, organizationId: ctx.orgId }, include: { customer: true } });
  if (!review) throw new ValidationError("Review not found");
  const { org } = await loadOrg(ctx);
  const tpl = (await db.automation.findUnique({ where: { organizationId_key: { organizationId: ctx.orgId, key: "REVIEW_REQUESTS" } } }))?.template.split(TEMPLATE_SEPARATOR)[1] ?? "Would you share your experience on Google? {{reviewLink}}";
  const r = await sendSms(ctx, { customerId: review.customerId, sender: "STAFF", automationKey: "REVIEW_REQUESTS", body: renderTemplate(tpl, { firstName: review.customer.firstName, reviewLink: org.googleReviewUrl ?? "", business: org.name }) });
  if (!r.ok) return { ok: false as const, error: r.reason };
  await db.review.update({ where: { id }, data: { status: "REVIEW_REQUESTED", reviewRequestedAt: new Date() } });
  await audit(ctx, "review.link_sent_manual", "Review", id);
  revalidatePath("/reviews");
});
