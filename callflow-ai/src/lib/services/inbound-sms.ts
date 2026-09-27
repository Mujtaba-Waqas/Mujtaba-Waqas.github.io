import { db } from "../db";
import { classifySatisfaction, detectAffirmative, detectHumanRequest, detectNegative, parseSmsKeyword } from "../domain/intents";
import { renderTemplate } from "../domain/followups";
import { customerName, formatPhone, toE164 } from "../format";
import { audit } from "./audit";
import { loadOrg, nowOf, ValidationError, type TenantContext } from "./context";
import { findOrCreateCustomer } from "./customers";
import { cancelPendingFollowups, closeEstimate } from "./estimates";
import { logEvent } from "./events";
import { ensureConversation, sendSms } from "./messaging";
import { alertStaff } from "./phone";

/** When Twilio Advanced Opt-Out is on, Twilio itself replies to STOP/START/HELP; skip ours to avoid duplicates. */
const providerHandlesKeywordReplies = () => process.env.TWILIO_HANDLES_OPT_OUT_REPLY === "true";

export type InboundAction =
  | "OPTED_OUT"
  | "OPTED_IN"
  | "HELP"
  | "IGNORED_OPTED_OUT"
  | "HANDOFF"
  | "REVIEW_POSITIVE"
  | "REVIEW_NEGATIVE"
  | "ESTIMATE_ACCEPTED"
  | "ESTIMATE_DECLINED"
  | "STORED";

/**
 * Processes an inbound customer SMS (Twilio webhook or the demo "simulate
 * customer reply" tool). Compliance keywords are handled first, then handoff,
 * then context-specific replies (satisfaction check, open estimate).
 */
export async function handleInboundSms(ctx: TenantContext, input: { from: string; body: string; simulated: boolean; providerSid?: string | null }) {
  const from = toE164(input.from);
  if (!from) throw new ValidationError("Invalid sender phone number");
  const body = input.body.trim().slice(0, 1600);
  if (!body) throw new ValidationError("Message body is empty");
  const now = nowOf(ctx);
  const { org, settings } = await loadOrg(ctx);

  const customer = await findOrCreateCustomer(ctx, { phone: from, source: "SMS" });
  const conversation = await ensureConversation(ctx, customer.id);
  const message = await db.message.create({
    data: {
      organizationId: ctx.orgId,
      conversationId: conversation.id,
      customerId: customer.id,
      direction: "INBOUND",
      sender: "CUSTOMER",
      body,
      status: "RECEIVED",
      isSimulated: input.simulated,
      providerSid: input.providerSid ?? null,
      createdAt: now,
    },
  });
  await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now, unreadCount: { increment: 1 } } });
  const openLead = await db.lead.findFirst({ where: { organizationId: ctx.orgId, customerId: customer.id, status: { notIn: ["WON", "LOST"] } }, orderBy: { createdAt: "desc" } });
  const leadId = openLead?.id ?? null;

  const keyword = parseSmsKeyword(body);
  if (keyword === "STOP") {
    await db.customer.update({ where: { id: customer.id }, data: { smsOptedOut: true, smsOptedOutAt: now } });
    const cancelled = await cancelPendingFollowups(ctx, { customerId: customer.id }, "OPTED_OUT");
    await logEvent(ctx, { customerId: customer.id, leadId, type: "opted_out", title: "Customer opted out of SMS (STOP)", detail: `All automated messages stopped${cancelled ? ` · ${cancelled} scheduled follow-up${cancelled > 1 ? "s" : ""} cancelled` : ""}`, actor: "CUSTOMER" });
    await audit(ctx, "sms.opted_out", "Customer", customer.id, { cancelledFollowups: cancelled });
    if (!providerHandlesKeywordReplies()) await sendSms(ctx, { customerId: customer.id, body: `${org.name}: You're unsubscribed and won't receive more texts. Reply START to resubscribe.`, sender: "SYSTEM", complianceReply: true });
    return { action: "OPTED_OUT" as InboundAction, messageId: message.id, customerId: customer.id };
  }
  if (keyword === "START") {
    await db.customer.update({ where: { id: customer.id }, data: { smsOptedOut: false, smsOptedOutAt: null, smsConsentAt: now } });
    await logEvent(ctx, { customerId: customer.id, leadId, type: "opted_in", title: "Customer re-subscribed to SMS (START)", actor: "CUSTOMER" });
    await audit(ctx, "sms.opted_in", "Customer", customer.id);
    if (!providerHandlesKeywordReplies()) await sendSms(ctx, { customerId: customer.id, body: `${org.name}: You're resubscribed. Reply STOP to opt out anytime.`, sender: "SYSTEM", complianceReply: true });
    return { action: "OPTED_IN" as InboundAction, messageId: message.id, customerId: customer.id };
  }
  if (keyword === "HELP") {
    if (!providerHandlesKeywordReplies()) await sendSms(ctx, { customerId: customer.id, body: `${org.name}: For help call ${formatPhone(org.phone)}. Msg & data rates may apply. Reply STOP to opt out.`, sender: "SYSTEM", complianceReply: true });
    return { action: "HELP" as InboundAction, messageId: message.id, customerId: customer.id };
  }
  if (customer.smsOptedOut) {
    await logEvent(ctx, { customerId: customer.id, leadId, type: "inbound_while_opted_out", title: "Message received from opted-out customer", detail: "No automated reply sent. Staff may respond only if the customer re-subscribes.", actor: "CUSTOMER" });
    return { action: "IGNORED_OPTED_OUT" as InboundAction, messageId: message.id, customerId: customer.id };
  }

  if (detectHumanRequest(body)) {
    await db.conversation.update({ where: { id: conversation.id }, data: { humanTakeover: true, takeoverReason: "Customer asked to speak with someone" } });
    await cancelPendingFollowups(ctx, { customerId: customer.id }, "HUMAN_REQUESTED");
    if (leadId) await db.lead.update({ where: { id: leadId }, data: { needsHumanFollowUp: true } });
    await logEvent(ctx, { customerId: customer.id, leadId, type: "handoff", title: "Handed off to staff — customer asked for a person", detail: "Automation paused for this customer", actor: "AI" });
    await audit(ctx, "inbox.handoff", "Conversation", conversation.id);
    await alertStaff(ctx, `${customerName(customer)} (${formatPhone(customer.phone)}) asked to talk to a person: "${body.slice(0, 140)}"`, { customerId: customer.id, leadId });
    await sendSms(ctx, { customerId: customer.id, body: `Thanks ${customer.firstName === "Unknown" ? "" : customer.firstName}! A member of our team will call you shortly.`.replace("Thanks !", "Thanks!"), sender: "AI" });
    return { action: "HANDOFF" as InboundAction, messageId: message.id, customerId: customer.id };
  }

  // Satisfaction check response
  const pendingReview = await db.review.findFirst({ where: { organizationId: ctx.orgId, customerId: customer.id, status: "SATISFACTION_SENT" }, orderBy: { createdAt: "desc" } });
  if (pendingReview) {
    const sat = classifySatisfaction(body);
    if (sat.sentiment === "positive") {
      await db.review.update({ where: { id: pendingReview.id }, data: { status: "POSITIVE", rating: sat.rating, response: body, respondedAt: now } });
      const template = (await db.automation.findUnique({ where: { organizationId_key: { organizationId: ctx.orgId, key: "REVIEW_REQUESTS" } } }))?.template ?? "";
      const reviewAsk = template.split("\n---\n")[1] ?? "Thank you, {{firstName}}! Would you be willing to share your experience on Google? {{reviewLink}}";
      const r = await sendSms(ctx, { customerId: customer.id, body: renderTemplate(reviewAsk, { firstName: customer.firstName, reviewLink: org.googleReviewUrl ?? "", business: org.name }), sender: "AUTOMATION", automationKey: "REVIEW_REQUESTS" });
      if (r.ok) await db.review.update({ where: { id: pendingReview.id }, data: { status: "REVIEW_REQUESTED", reviewRequestedAt: now } });
      await logEvent(ctx, { customerId: customer.id, leadId, type: "review_positive", title: `Positive feedback${sat.rating ? ` (${sat.rating}/5)` : ""} — review link sent`, detail: body, actor: "CUSTOMER" });
      return { action: "REVIEW_POSITIVE" as InboundAction, messageId: message.id, customerId: customer.id };
    }
    if (sat.sentiment === "negative") {
      const owner = await db.employee.findFirst({ where: { organizationId: ctx.orgId, kind: "OWNER" } });
      await db.review.update({ where: { id: pendingReview.id }, data: { status: "NEGATIVE_FLAGGED", rating: sat.rating, response: body, respondedAt: now, flaggedAt: now, assignedEmployeeId: owner?.id ?? null } });
      await db.conversation.update({ where: { id: conversation.id }, data: { humanTakeover: true, takeoverReason: "Negative feedback — owner follow-up" } });
      await logEvent(ctx, { customerId: customer.id, leadId, type: "review_negative", title: `Negative feedback${sat.rating ? ` (${sat.rating}/5)` : ""} — routed to ${owner?.name ?? "owner"}`, detail: body, actor: "CUSTOMER" });
      await audit(ctx, "review.negative_flagged", "Review", pendingReview.id);
      await alertStaff(ctx, `Unhappy customer ${customerName(customer)} (${formatPhone(customer.phone)}): "${body.slice(0, 140)}". Please call them.`, { customerId: customer.id, leadId });
      const policyAllCustomers = settings.reviews.policy === "all_customers";
      await sendSms(ctx, {
        customerId: customer.id,
        body: `${customer.firstName}, I'm sorry we fell short. ${owner?.name.split(" ")[0] ?? "Our owner"} will call you personally to make it right.${policyAllCustomers && org.googleReviewUrl ? ` You're also welcome to share feedback publicly: ${org.googleReviewUrl}` : ""}`,
        sender: "AI",
      });
      return { action: "REVIEW_NEGATIVE" as InboundAction, messageId: message.id, customerId: customer.id };
    }
  }

  // Reply to an estimate follow-up
  if (!conversation.humanTakeover) {
    const openEstimate = await db.estimate.findFirst({
      where: { organizationId: ctx.orgId, customerId: customer.id, status: { in: ["SENT", "VIEWED"] } },
      orderBy: { sentAt: "desc" },
    });
    if (openEstimate) {
      if (detectAffirmative(body)) {
        const { recovered } = await closeEstimate(ctx, openEstimate.id, "ACCEPTED", "CUSTOMER");
        if (openEstimate.leadId) await db.lead.update({ where: { id: openEstimate.leadId }, data: { needsHumanFollowUp: true } });
        await sendSms(ctx, { customerId: customer.id, body: `Wonderful, ${customer.firstName}! Our dispatcher will reach out today to schedule your installation.`, sender: "AI", estimateId: openEstimate.id });
        await audit(ctx, "estimate.accepted_via_sms", "Estimate", openEstimate.id, { recovered });
        await alertStaff(ctx, `${customerName(customer)} said YES to estimate ${openEstimate.number}. Call ${formatPhone(customer.phone)} to schedule.`, { customerId: customer.id, leadId: openEstimate.leadId });
        return { action: "ESTIMATE_ACCEPTED" as InboundAction, messageId: message.id, customerId: customer.id };
      }
      if (detectNegative(body)) {
        await closeEstimate(ctx, openEstimate.id, "DECLINED", "CUSTOMER");
        await sendSms(ctx, { customerId: customer.id, body: `Understood, ${customer.firstName} — thanks for letting us know. We're here if you ever need us.`, sender: "AI", estimateId: openEstimate.id });
        return { action: "ESTIMATE_DECLINED" as InboundAction, messageId: message.id, customerId: customer.id };
      }
    }
  }

  await logEvent(ctx, { customerId: customer.id, leadId, type: "sms_received", title: `SMS from ${customerName(customer)}`, detail: body, actor: "CUSTOMER" });
  await alertStaff(ctx, `New text from ${customerName(customer) === "Unknown Caller" ? formatPhone(customer.phone) : `${customerName(customer)} (${formatPhone(customer.phone)})`}: "${body.slice(0, 160)}"`, { customerId: customer.id, leadId });
  return { action: "STORED" as InboundAction, messageId: message.id, customerId: customer.id };
}
