import type { Actor, AutomationKey } from "@prisma/client";
import { db } from "../db";
import { toE164 } from "../format";
import { getSmsProvider } from "../providers";
import { audit } from "./audit";
import { loadOrg, nowOf, type TenantContext } from "./context";
import { getCustomerScoped } from "./customers";

export async function ensureConversation(ctx: TenantContext, customerId: string) {
  return db.conversation.upsert({
    where: { customerId },
    update: {},
    create: { organizationId: ctx.orgId, customerId, lastMessageAt: nowOf(ctx) },
  });
}

export interface SendSmsOptions {
  customerId: string;
  body: string;
  sender: Actor;
  automationKey?: AutomationKey | null;
  estimateId?: string | null;
  appointmentId?: string | null;
  /** Only for the single opt-out/HELP confirmation required by carriers. */
  complianceReply?: boolean;
}

export type SendSmsOutcome = { ok: true; messageId: string; simulated: boolean } | { ok: false; messageId: string; reason: string };

/**
 * The single path for outbound SMS. Enforces opt-out, records the message,
 * meters usage, and uses the demo provider unless live sending is enabled.
 */
export async function sendSms(ctx: TenantContext, opts: SendSmsOptions): Promise<SendSmsOutcome> {
  const customer = await getCustomerScoped(ctx, opts.customerId);
  const conversation = await ensureConversation(ctx, customer.id);
  const { settings } = await loadOrg(ctx);
  const now = nowOf(ctx);
  const base = {
    organizationId: ctx.orgId,
    conversationId: conversation.id,
    customerId: customer.id,
    direction: "OUTBOUND" as const,
    sender: opts.sender,
    body: opts.body.slice(0, 1600),
    automationKey: opts.automationKey ?? null,
    estimateId: opts.estimateId ?? null,
    appointmentId: opts.appointmentId ?? null,
    createdAt: now,
  };

  if (customer.smsOptedOut && !opts.complianceReply) {
    const blocked = await db.message.create({ data: { ...base, status: "BLOCKED", errorReason: "Recipient opted out (STOP) — not sent" } });
    return { ok: false, messageId: blocked.id, reason: "Recipient has opted out of SMS" };
  }

  const provider = getSmsProvider();
  const from = toE164(settings.sms.senderNumber) ?? "+18015550198";
  const result = await provider.send({ to: customer.phone, from, body: base.body });
  const message = await db.message.create({
    data: {
      ...base,
      status: result.status === "FAILED" ? "FAILED" : result.simulated ? "SIMULATED" : "SENT",
      isSimulated: result.simulated,
      providerSid: result.providerSid || null,
      errorReason: result.error ?? null,
    },
  });
  await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } });
  await db.usageRecord.create({
    data: { organizationId: ctx.orgId, type: "SMS_SEGMENTS", quantity: Math.max(1, Math.ceil(base.body.length / 153)), occurredAt: now, referenceId: message.id },
  });
  if (result.status === "FAILED") return { ok: false, messageId: message.id, reason: result.error ?? "Send failed" };
  return { ok: true, messageId: message.id, simulated: result.simulated };
}

export async function setHumanTakeover(ctx: TenantContext, conversationId: string, enabled: boolean, reason?: string) {
  const convo = await db.conversation.findFirst({ where: { id: conversationId, organizationId: ctx.orgId } });
  if (!convo) throw new Error("Conversation not found");
  await db.conversation.update({ where: { id: convo.id }, data: { humanTakeover: enabled, takeoverReason: enabled ? (reason ?? "Staff took over") : null } });
  await audit(ctx, enabled ? "inbox.takeover_enabled" : "inbox.takeover_disabled", "Conversation", convo.id, { reason: reason ?? null });
}

export async function markConversationRead(ctx: TenantContext, conversationId: string) {
  await db.conversation.updateMany({ where: { id: conversationId, organizationId: ctx.orgId }, data: { unreadCount: 0 } });
}
