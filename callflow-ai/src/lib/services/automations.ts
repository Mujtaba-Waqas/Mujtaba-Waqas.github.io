import type { AutomationKey, Prisma, RunTrigger } from "@prisma/client";
import { db } from "../db";
import { DEFAULT_ESTIMATE_TEMPLATES, getFollowupStopReason, renderTemplate, STOP_REASON_LABELS } from "../domain/followups";
import { SERVICE_LABELS, type ServiceKey } from "../domain/intents";
import { customerName, formatCents, formatDateTime, formatPhone } from "../format";
import { isQuietHours } from "../domain/quiet-hours";
import { DAY, HOUR, MINUTE } from "../time";
import { audit } from "./audit";
import { loadOrg, nowOf, type TenantContext } from "./context";
import { cancelPendingFollowups } from "./estimates";
import { logEvent } from "./events";
import { sendSms } from "./messaging";
import { recoverMissedCall } from "./phone";

export const TEMPLATE_SEPARATOR = "\n---\n";

export interface RunLogEntry {
  at: string;
  level: "info" | "action" | "skip" | "stop" | "error";
  message: string;
  entityType?: string;
  entityId?: string;
}

export interface RunOptions {
  trigger: RunTrigger;
  /** Demo "Run now": process the next pending action immediately, ignoring its scheduled delay. */
  force?: boolean;
}

class RunLogger {
  entries: RunLogEntry[] = [];
  processed = 0;
  actions = 0;
  skipped = 0;
  constructor(private now: Date) {}
  log(level: RunLogEntry["level"], message: string, entityType?: string, entityId?: string) {
    this.entries.push({ at: this.now.toISOString(), level, message, entityType, entityId });
    if (level === "action") this.actions++;
    if (level === "skip" || level === "stop") this.skipped++;
  }
}

export function splitTemplates(template: string) {
  return template.split(TEMPLATE_SEPARATOR).map((t) => t.trim()).filter(Boolean);
}

async function commonVars(ctx: TenantContext) {
  const { org, settings } = await loadOrg(ctx);
  return { org, settings, vars: { business: org.name, phone: formatPhone(org.phone ?? settings.sms.senderNumber), reviewLink: org.googleReviewUrl ?? "" } };
}

async function runEstimateRecovery(ctx: TenantContext, automation: { enabled: boolean; template: string }, opts: RunOptions, L: RunLogger) {
  const now = nowOf(ctx);
  const { vars } = await commonVars(ctx);
  const templates = splitTemplates(automation.template);
  const due = await db.followup.findMany({
    where: { organizationId: ctx.orgId, status: "SCHEDULED", ...(opts.force ? {} : { scheduledFor: { lte: now } }) },
    include: { estimate: { include: { service: true } }, customer: { include: { conversation: true } } },
    orderBy: [{ estimateId: "asc" }, { stage: "asc" }],
  });
  // One action per estimate per run: the earliest pending stage.
  const seen = new Set<string>();
  const batch = due.filter((f) => (seen.has(f.estimateId) ? false : (seen.add(f.estimateId), true)));
  if (!batch.length) L.log("info", opts.force ? "No estimates have pending follow-ups." : "No follow-ups are due yet.");

  for (const f of batch) {
    L.processed++;
    const est = f.estimate;
    const stop = getFollowupStopReason({
      estimateStatus: est.status,
      automationPaused: est.automationPaused,
      customerOptedOut: f.customer.smsOptedOut,
      humanTakeover: f.customer.conversation?.humanTakeover ?? false,
      automationEnabled: automation.enabled,
      expiresAt: est.expiresAt,
      now,
    });
    if (stop) {
      if (stop === "EXPIRED" && (est.status === "SENT" || est.status === "VIEWED")) await db.estimate.update({ where: { id: est.id }, data: { status: "EXPIRED" } });
      const cancelled = stop === "AUTOMATION_DISABLED" ? 0 : await cancelPendingFollowups(ctx, { estimateId: est.id }, stop);
      L.log("stop", `${est.number}: stopped — ${STOP_REASON_LABELS[stop]}${cancelled ? ` (${cancelled} pending follow-up${cancelled > 1 ? "s" : ""} cancelled)` : ""}`, "Estimate", est.id);
      if (stop !== "AUTOMATION_DISABLED")
        await logEvent(ctx, { leadId: est.leadId, customerId: est.customerId, type: "automation_stopped", title: "Estimate follow-ups stopped", detail: STOP_REASON_LABELS[stop], actor: "AUTOMATION" });
      continue;
    }
    const template = templates[f.stage - 1] ?? templates.at(-1) ?? DEFAULT_ESTIMATE_TEMPLATES[f.stage - 1];
    const body = renderTemplate(template, {
      ...vars,
      firstName: f.customer.firstName,
      estimateNumber: est.number,
      service: est.service?.name ?? est.title,
      amount: formatCents(est.totalCents),
    });
    const result = await sendSms(ctx, { customerId: f.customerId, body, sender: "AUTOMATION", automationKey: "ESTIMATE_RECOVERY", estimateId: est.id });
    if (!result.ok) {
      await db.followup.update({ where: { id: f.id }, data: { status: "CANCELLED", cancelledReason: result.reason, messageId: result.messageId } });
      L.log("stop", `${est.number}: follow-up #${f.stage} not sent — ${result.reason}`, "Estimate", est.id);
      continue;
    }
    await db.followup.update({ where: { id: f.id }, data: { status: "SENT", sentAt: now, messageId: result.messageId } });
    await db.estimate.update({ where: { id: est.id }, data: { followupStage: f.stage } });
    const day = [1, 3, 7][f.stage - 1] ?? f.stage;
    await logEvent(ctx, { leadId: est.leadId, customerId: est.customerId, type: "followup_sent", title: `Automated follow-up #${f.stage} sent (day ${day})`, detail: body, actor: "AUTOMATION", metadata: { estimateId: est.id, messageId: result.messageId } });
    L.log("action", `${est.number}: sent follow-up #${f.stage} (day ${day}) to ${customerName(f.customer)}${result.simulated ? " — simulated SMS" : ""}`, "Estimate", est.id);
  }
}

async function runAppointmentReminders(ctx: TenantContext, automation: { template: string }, opts: RunOptions, L: RunLogger) {
  const now = nowOf(ctx);
  const { org, vars } = await commonVars(ctx);
  const appts = await db.appointment.findMany({
    where: {
      organizationId: ctx.orgId,
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      reminderSentAt: null,
      startAt: { gt: now, lte: new Date(now.getTime() + (opts.force ? 3 * DAY : DAY)) },
    },
    include: { customer: true, technician: true, service: true },
    orderBy: { startAt: "asc" },
    take: 50,
  });
  if (!appts.length) L.log("info", "No upcoming appointments need a reminder.");
  for (const a of appts) {
    L.processed++;
    const body = renderTemplate(automation.template, {
      ...vars,
      firstName: a.customer.firstName,
      time: formatDateTime(a.startAt, org.timezone),
      service: a.service?.name ?? a.title,
      technician: a.technician?.name.split(" ")[0] ?? "our technician",
    });
    const r = await sendSms(ctx, { customerId: a.customerId, body, sender: "AUTOMATION", automationKey: "APPOINTMENT_REMINDERS", appointmentId: a.id });
    if (!r.ok) {
      L.log("skip", `${customerName(a.customer)}: reminder not sent — ${r.reason}`, "Appointment", a.id);
      continue;
    }
    await db.appointment.update({ where: { id: a.id }, data: { reminderSentAt: now } });
    await logEvent(ctx, { leadId: a.leadId, customerId: a.customerId, type: "reminder_sent", title: "Appointment reminder sent", detail: body, actor: "AUTOMATION" });
    L.log("action", `Reminder sent to ${customerName(a.customer)} for ${formatDateTime(a.startAt, org.timezone)}`, "Appointment", a.id);
  }
}

async function runReviewRequests(ctx: TenantContext, automation: { template: string }, opts: RunOptions, L: RunLogger) {
  const now = nowOf(ctx);
  const { settings, vars } = await commonVars(ctx);
  const staleCutoff = new Date(now.getTime() - 5 * DAY);
  const stale = await db.review.updateMany({ where: { organizationId: ctx.orgId, status: "SATISFACTION_SENT", satisfactionSentAt: { lt: staleCutoff } }, data: { status: "NO_RESPONSE" } });
  if (stale.count) L.log("info", `${stale.count} satisfaction check${stale.count > 1 ? "s" : ""} marked as no response after 5 days.`);
  const delayCutoff = new Date(now.getTime() - (opts.force ? 0 : settings.reviews.delayHours * HOUR));
  const appts = await db.appointment.findMany({
    where: { organizationId: ctx.orgId, status: "COMPLETED", completedAt: { lte: delayCutoff, gte: new Date(now.getTime() - 14 * DAY) }, review: null },
    include: { customer: true, technician: true },
    take: 50,
  });
  if (!appts.length) L.log("info", "No completed jobs are waiting for a satisfaction check.");
  for (const a of appts) {
    L.processed++;
    const body = renderTemplate(automation.template, { ...vars, firstName: a.customer.firstName, technician: a.technician?.name.split(" ")[0] ?? "our technician" });
    const r = await sendSms(ctx, { customerId: a.customerId, body, sender: "AUTOMATION", automationKey: "REVIEW_REQUESTS", appointmentId: a.id });
    if (!r.ok) {
      L.log("skip", `${customerName(a.customer)}: satisfaction check not sent — ${r.reason}`, "Appointment", a.id);
      continue;
    }
    await db.review.create({ data: { organizationId: ctx.orgId, customerId: a.customerId, appointmentId: a.id, status: "SATISFACTION_SENT", satisfactionSentAt: now, createdAt: now } });
    await logEvent(ctx, { customerId: a.customerId, leadId: a.leadId, type: "satisfaction_sent", title: "Satisfaction check sent", detail: body, actor: "AUTOMATION" });
    L.log("action", `Satisfaction check sent to ${customerName(a.customer)}`, "Appointment", a.id);
  }
}

async function runMissedCallRecovery(ctx: TenantContext, _automation: { template: string }, opts: RunOptions, L: RunLogger) {
  const now = nowOf(ctx);
  const calls = await db.call.findMany({
    where: {
      organizationId: ctx.orgId,
      status: { in: ["MISSED", "VOICEMAIL", "ABANDONED"] },
      textBackSentAt: null,
      startedAt: { gte: new Date(now.getTime() - (opts.force ? 7 * DAY : DAY)), lte: new Date(now.getTime() - (opts.force ? 0 : 2 * MINUTE)) },
    },
    take: 50,
  });
  if (!calls.length) L.log("info", "No unrecovered missed calls.");
  for (const c of calls) {
    L.processed++;
    const r = await recoverMissedCall(ctx, c.id);
    if (!r.ok) {
      L.log("skip", `${formatPhone(c.fromNumber)}: text-back not sent — ${r.reason}`, "Call", c.id);
      continue;
    }
    L.log("action", `Text-back sent to ${formatPhone(c.fromNumber)}`, "Call", c.id);
  }
}

async function runNewLeadFollowup(ctx: TenantContext, automation: { template: string }, opts: RunOptions, L: RunLogger) {
  const now = nowOf(ctx);
  const { vars } = await commonVars(ctx);
  const leads = await db.lead.findMany({
    where: {
      organizationId: ctx.orgId,
      status: "NEW",
      firstResponseAt: null,
      source: { in: ["WEB_FORM", "GOOGLE_LSA", "REFERRAL", "SMS"] },
      createdAt: { lte: new Date(now.getTime() - (opts.force ? 0 : 5 * MINUTE)) },
    },
    include: { customer: true, service: true },
    take: 50,
  });
  if (!leads.length) L.log("info", "Every new lead has already been contacted.");
  for (const lead of leads) {
    L.processed++;
    const service = lead.service?.name ?? SERVICE_LABELS[(lead.service?.category as ServiceKey) ?? "general"] ?? lead.requestedService;
    const body = renderTemplate(automation.template, { ...vars, firstName: lead.customer.firstName, service: service.toLowerCase() });
    const r = await sendSms(ctx, { customerId: lead.customerId, body, sender: "AUTOMATION", automationKey: "NEW_LEAD_FOLLOWUP" });
    if (!r.ok) {
      L.log("skip", `${customerName(lead.customer)}: intro text not sent — ${r.reason}`, "Lead", lead.id);
      continue;
    }
    await db.lead.update({ where: { id: lead.id }, data: { status: "CONTACTED", firstResponseAt: now } });
    await logEvent(ctx, { leadId: lead.id, customerId: lead.customerId, type: "lead_contacted", title: "Instant lead response sent", detail: body, actor: "AUTOMATION" });
    L.log("action", `Intro text sent to ${customerName(lead.customer)} (${lead.source.replace(/_/g, " ").toLowerCase()})`, "Lead", lead.id);
  }
}

const RUNNERS: Record<AutomationKey, (ctx: TenantContext, a: { enabled: boolean; template: string }, o: RunOptions, L: RunLogger) => Promise<void>> = {
  ESTIMATE_RECOVERY: runEstimateRecovery,
  APPOINTMENT_REMINDERS: runAppointmentReminders,
  REVIEW_REQUESTS: runReviewRequests,
  MISSED_CALL_RECOVERY: runMissedCallRecovery,
  NEW_LEAD_FOLLOWUP: runNewLeadFollowup,
};

export async function runAutomation(ctx: TenantContext, key: AutomationKey, opts: RunOptions) {
  const automation = await db.automation.findUnique({ where: { organizationId_key: { organizationId: ctx.orgId, key } } });
  if (!automation) throw new Error(`Automation ${key} is not configured`);
  const now = nowOf(ctx);
  const L = new RunLogger(now);
  let failed = false;
  const { org, settings } = await loadOrg(ctx);
  const quiet = opts.trigger === "SCHEDULED" && key !== "MISSED_CALL_RECOVERY" && isQuietHours(now, settings.sms.quietHoursStart, settings.sms.quietHoursEnd, org.timezone);
  if (!automation.enabled && key !== "ESTIMATE_RECOVERY") {
    L.log("info", "Automation is disabled — nothing was sent.");
  } else if (quiet) {
    L.log("info", `Quiet hours (${settings.sms.quietHoursStart}–${settings.sms.quietHoursEnd}) — pending texts will go out on the next run after quiet hours.`);
  } else {
    try {
      await RUNNERS[key](ctx, automation, opts, L);
    } catch (err) {
      failed = true;
      L.log("error", err instanceof Error ? err.message : "Unexpected error");
    }
  }
  const status = failed ? (L.actions ? "PARTIAL" : "FAILED") : L.actions ? "SUCCESS" : "NOOP";
  const run = await db.automationRun.create({
    data: {
      organizationId: ctx.orgId,
      automationId: automation.id,
      trigger: opts.trigger,
      status,
      processed: L.processed,
      actionsTaken: L.actions,
      skipped: L.skipped,
      log: L.entries as unknown as Prisma.InputJsonValue,
      triggeredById: ctx.userId,
      startedAt: now,
      finishedAt: new Date(),
    },
  });
  await db.automation.update({ where: { id: automation.id }, data: { lastRunAt: now } });
  if (opts.trigger === "MANUAL") await audit(ctx, "automation.run_manual", "Automation", automation.id, { key, actions: L.actions });
  return run;
}

export async function runAllDueAutomations(ctx: TenantContext) {
  const automations = await db.automation.findMany({ where: { organizationId: ctx.orgId, enabled: true } });
  const runs = [];
  for (const a of automations) runs.push(await runAutomation(ctx, a.key, { trigger: "SCHEDULED" }));
  return runs;
}
