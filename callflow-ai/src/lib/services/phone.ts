import { db } from "../db";
import { renderTemplate } from "../domain/followups";
import { formatPhone, toE164 } from "../format";
import { getSmsProvider } from "../providers";
import { audit } from "./audit";
import { loadOrg, NotFoundError, nowOf, type TenantContext } from "./context";
import { findCustomerByPhone, findOrCreateCustomer } from "./customers";
import { logEvent } from "./events";
import { sendSms } from "./messaging";

/**
 * Text a staff alert (new reply, voicemail, accepted estimate…) to the
 * company's alert phone. Uses the same SMS provider as customer messages, so
 * it's simulated in demo mode. Never throws — alerts must not break webhooks.
 */
export async function alertStaff(ctx: TenantContext, text: string, link?: { customerId?: string | null; leadId?: string | null }) {
  try {
    const { org, settings } = await loadOrg(ctx);
    const to = toE164(settings.phone.alertPhone);
    if (!to) return { sent: false as const, reason: "No alert phone configured" };
    const from = toE164(settings.phone.callflowNumber) ?? toE164(settings.sms.senderNumber) ?? "+18015550198";
    const body = `CallFlow · ${org.name}: ${text}`.slice(0, 480);
    const r = await getSmsProvider().send({ to, from, body });
    await db.usageRecord.create({ data: { organizationId: ctx.orgId, type: "SMS_SEGMENTS", quantity: Math.max(1, Math.ceil(body.length / 153)), occurredAt: nowOf(ctx) } });
    await logEvent(ctx, {
      customerId: link?.customerId ?? null,
      leadId: link?.leadId ?? null,
      type: "staff_alert",
      title: `Staff alerted by text${r.simulated ? " (simulated)" : ""}`,
      detail: `To ${formatPhone(to)}: ${text}`,
      actor: "SYSTEM",
    });
    return { sent: r.status !== "FAILED", simulated: r.simulated };
  } catch (err) {
    console.error("[alertStaff] failed", err instanceof Error ? err.message : err);
    return { sent: false as const, reason: "error" };
  }
}

/**
 * Sends the missed-call text-back for one call, creates/links the customer
 * and lead, and marks the call recovered. Idempotent: does nothing if a
 * text-back was already sent for this call.
 */
export async function recoverMissedCall(ctx: TenantContext, callId: string) {
  const call = await db.call.findFirst({ where: { id: callId, organizationId: ctx.orgId } });
  if (!call) throw new NotFoundError("Call");
  if (call.textBackSentAt) return { ok: true as const, alreadySent: true, leadId: call.leadId, customerId: call.customerId };
  if (!toE164(call.fromNumber)) return { ok: false as const, reason: "Caller number unavailable (blocked or private)" };

  const now = nowOf(ctx);
  const { org, settings } = await loadOrg(ctx);
  // Some forwarding setups replace the caller ID with the business's own number. Never text ourselves.
  const ownNumbers = [org.phone, settings.phone.callflowNumber, settings.phone.officeNumber, settings.phone.alertPhone].map((n) => toE164(n)).filter(Boolean);
  if (ownNumbers.includes(toE164(call.fromNumber))) {
    await logEvent(ctx, { type: "missed_call_textback_blocked", title: "Missed call from your own number — no text sent", detail: "Your call forwarding may be hiding the caller's number. Check the forwarding setup.", actor: "SYSTEM", metadata: { callId: call.id } });
    return { ok: false as const, reason: "Caller ID is one of your own numbers (check call forwarding)" };
  }
  const automation = await db.automation.findUnique({ where: { organizationId_key: { organizationId: ctx.orgId, key: "MISSED_CALL_RECOVERY" } } });
  if (automation && !automation.enabled) return { ok: false as const, reason: "Missed Call Recovery automation is disabled" };
  const template = automation?.template ?? "Sorry we missed your call! This is {{business}} — how can we help? Reply here or call {{phone}}.";
  const customer = await findOrCreateCustomer(ctx, { phone: call.fromNumber, firstName: call.callerName?.split(" ")[0], lastName: call.callerName?.split(" ").slice(1).join(" "), source: "MISSED_CALL" });
  const body = renderTemplate(template, {
    business: org.name,
    phone: formatPhone(org.phone ?? settings.phone.callflowNumber ?? settings.sms.senderNumber),
    firstName: customer.firstName === "Unknown" ? "there" : customer.firstName,
  });
  const r = await sendSms(ctx, { customerId: customer.id, body, sender: "AUTOMATION", automationKey: "MISSED_CALL_RECOVERY" });
  if (!r.ok) {
    await logEvent(ctx, { customerId: customer.id, type: "missed_call_textback_blocked", title: "Missed-call text-back not sent", detail: r.reason, actor: "AUTOMATION" });
    await db.call.update({ where: { id: call.id }, data: { customerId: customer.id } });
    return { ok: false as const, reason: r.reason };
  }
  const open = await db.lead.findFirst({ where: { organizationId: ctx.orgId, customerId: customer.id, status: { notIn: ["WON", "LOST"] } }, orderBy: { createdAt: "desc" } });
  const leadId =
    call.leadId ??
    open?.id ??
    (await db.lead.create({ data: { organizationId: ctx.orgId, customerId: customer.id, source: "MISSED_CALL", urgency: "NORMAL", requestedService: "Callback — missed call", firstResponseAt: now, status: "CONTACTED", createdAt: now } })).id;
  await db.call.update({ where: { id: call.id }, data: { textBackSentAt: now, outcome: "MISSED_RECOVERED", customerId: customer.id, leadId } });
  await logEvent(ctx, { leadId, customerId: customer.id, type: "missed_call_textback", title: "Missed call recovered by text-back", detail: body, actor: "AUTOMATION", metadata: { callId: call.id } });
  return { ok: true as const, alreadySent: false, leadId, customerId: customer.id, simulated: r.simulated };
}

export type LiveCallPlan = { kind: "ai"; callId: null } | { kind: "dial"; callId: string; officeNumber: string; ringSeconds: number } | { kind: "missed"; callId: string; message: string; voicemail: boolean };

/** Decide how to handle an inbound live call based on the company's phone mode. */
export async function planLiveCall(ctx: TenantContext, input: { from: string; to: string; callSid: string | null }): Promise<LiveCallPlan> {
  const { org, settings } = await loadOrg(ctx);
  const mode = settings.phone.mode;
  if (mode === "ai_receptionist") return { kind: "ai", callId: null };
  const known = await findCustomerByPhone(ctx, input.from);
  const now = nowOf(ctx);
  const call = await db.call.create({
    data: {
      organizationId: ctx.orgId,
      customerId: known?.id ?? null,
      status: mode === "ring_then_text_back" ? "IN_PROGRESS" : "MISSED",
      answeredBy: "NONE",
      fromNumber: toE164(input.from) ?? input.from,
      toNumber: toE164(input.to) ?? input.to,
      callerName: known ? `${known.firstName} ${known.lastName}` : null,
      startedAt: now,
      providerCallSid: input.callSid,
      recordingStatus: "NOT_RECORDED",
    },
  });
  const officeNumber = toE164(settings.phone.officeNumber);
  if (mode === "ring_then_text_back" && officeNumber) return { kind: "dial", callId: call.id, officeNumber, ringSeconds: settings.phone.ringSeconds };
  if (mode === "ring_then_text_back") await db.call.update({ where: { id: call.id }, data: { status: "MISSED" } });
  return { kind: "missed", callId: call.id, message: settings.phone.missedCallMessage.replace(/\{business\}/g, org.name), voicemail: settings.phone.voicemail };
}

/** A call was not answered by a person: text back immediately and alert staff. */
export async function handleMissedCall(ctx: TenantContext, callId: string) {
  const call = await db.call.update({ where: { id: callId }, data: { status: "MISSED", answeredBy: "NONE", endedAt: nowOf(ctx) } });
  if (call.organizationId !== ctx.orgId) throw new NotFoundError("Call");
  const r = await recoverMissedCall(ctx, callId);
  await alertStaff(
    ctx,
    r.ok ? `Missed call from ${formatPhone(call.fromNumber)} — texted them back automatically. Reply in your CallFlow inbox.` : `Missed call from ${formatPhone(call.fromNumber)} — could not text back (${r.reason}). Please call them.`,
    { customerId: r.ok ? r.customerId : call.customerId, leadId: r.ok ? r.leadId : null },
  );
  await audit(ctx, "call.missed_live", "Call", callId, { textBack: r.ok });
  return r;
}

/** Result of the ring-first <Dial>. Returns true when staff answered. */
export async function completeDial(ctx: TenantContext, callId: string, dialStatus: string, durationSec: number) {
  const answered = dialStatus === "completed" || dialStatus === "answered";
  const call = await db.call.findFirst({ where: { id: callId, organizationId: ctx.orgId } });
  if (!call) throw new NotFoundError("Call");
  if (answered) {
    await db.call.update({ where: { id: callId }, data: { status: "COMPLETED", answeredBy: "STAFF", outcome: "NO_ACTION", durationSeconds: durationSec, endedAt: nowOf(ctx) } });
    if (durationSec) await db.usageRecord.create({ data: { organizationId: ctx.orgId, type: "VOICE_MINUTES", quantity: Math.max(1, Math.ceil(durationSec / 60)), occurredAt: nowOf(ctx), referenceId: callId } });
  }
  return answered;
}

/** Store a voicemail left after a missed call and alert staff. */
export async function saveVoicemail(ctx: TenantContext, callId: string, recordingUrl: string | null, durationSec: number) {
  const call = await db.call.findFirst({ where: { id: callId, organizationId: ctx.orgId } });
  if (!call) throw new NotFoundError("Call");
  if (!recordingUrl || durationSec < 2) return;
  await db.call.update({ where: { id: callId }, data: { status: "VOICEMAIL", recordingUrl, recordingStatus: "RECORDED", durationSeconds: durationSec } });
  await logEvent(ctx, { customerId: call.customerId, leadId: call.leadId, type: "voicemail", title: `Voicemail left (${durationSec}s)`, detail: `From ${formatPhone(call.fromNumber)}`, actor: "CUSTOMER", metadata: { callId } });
  await alertStaff(ctx, `New ${durationSec}s voicemail from ${formatPhone(call.fromNumber)}. Listen in CallFlow → Calls.`, { customerId: call.customerId, leadId: call.leadId });
}
