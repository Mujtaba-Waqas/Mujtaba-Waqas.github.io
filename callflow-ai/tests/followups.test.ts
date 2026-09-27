import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildFollowupSchedule, getFollowupStopReason, renderTemplate } from "@/lib/domain/followups";
import { runAutomation } from "@/lib/services/automations";
import { createEstimate, markEstimateSent, setEstimateAutomationPaused } from "@/lib/services/estimates";
import { handleInboundSms } from "@/lib/services/inbound-sms";
import { findOrCreateCustomer } from "@/lib/services/customers";
import { sendSms } from "@/lib/services/messaging";
import { cleanupTestOrgs, createTestOrg } from "./helpers/db";

const now = new Date("2026-09-30T18:00:00Z");
const base = { estimateStatus: "SENT" as const, automationPaused: false, customerOptedOut: false, humanTakeover: false, automationEnabled: true, now };

describe("estimate follow-up stop rules (pure)", () => {
  it("schedules day 1, 3 and 7", () => {
    const s = buildFollowupSchedule(now);
    expect(s.map((x) => (x.scheduledFor.getTime() - now.getTime()) / 86_400_000)).toEqual([1, 3, 7]);
  });
  it("continues only when nothing blocks it", () => expect(getFollowupStopReason(base)).toBeNull());
  it.each([
    [{ estimateStatus: "ACCEPTED" as const }, "ACCEPTED"],
    [{ estimateStatus: "DECLINED" as const }, "DECLINED"],
    [{ customerOptedOut: true }, "OPTED_OUT"],
    [{ humanTakeover: true }, "HUMAN_REQUESTED"],
    [{ automationPaused: true }, "PAUSED"],
    [{ automationEnabled: false }, "AUTOMATION_DISABLED"],
    [{ expiresAt: new Date(now.getTime() - 1000) }, "EXPIRED"],
    [{ estimateStatus: "DRAFT" as const }, "NOT_SENT"],
  ])("stops for %o", (patch, reason) => expect(getFollowupStopReason({ ...base, ...patch })).toBe(reason));
  it("checks opt-out before anything else", () => expect(getFollowupStopReason({ ...base, customerOptedOut: true, estimateStatus: "ACCEPTED" })).toBe("OPTED_OUT"));
  it("renders templates safely", () => expect(renderTemplate("Hi {{firstName}} {{missing}}!", { firstName: "Al" })).toBe("Hi Al !"));
});

describe("estimate recovery automation + STOP opt-out (database)", () => {
  afterAll(cleanupTestOrgs);

  async function setup(label: string, phone: string) {
    const t = await createTestOrg(label);
    const c = await findOrCreateCustomer(t.ctx, { firstName: "Dana", lastName: "Fox", phone });
    const est = await createEstimate(t.ctx, { customerId: c.id, title: "AC replacement", items: [{ description: "AC", quantity: 1, unitPriceCents: 650_000 }] });
    await markEstimateSent(t.ctx, est.id);
    return { ...t, customer: c, est };
  }

  it("sends the next follow-up on 'Run now', then stops everything after STOP", async () => {
    const { ctx, customer, est } = await setup("stop", "8015550501");
    expect(await db.followup.count({ where: { estimateId: est.id, status: "SCHEDULED" } })).toBe(3);

    const run1 = await runAutomation(ctx, "ESTIMATE_RECOVERY", { trigger: "MANUAL", force: true });
    expect(run1.actionsTaken).toBe(1);
    const sent = await db.message.findMany({ where: { customerId: customer.id, automationKey: "ESTIMATE_RECOVERY" } });
    expect(sent).toHaveLength(1);
    expect(sent[0].status).toBe("SIMULATED");
    expect((await db.estimate.findUniqueOrThrow({ where: { id: est.id } })).followupStage).toBe(1);

    const r = await handleInboundSms(ctx, { from: customer.phone, body: "STOP", simulated: true });
    expect(r.action).toBe("OPTED_OUT");
    expect((await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).smsOptedOut).toBe(true);
    expect(await db.followup.count({ where: { estimateId: est.id, status: "SCHEDULED" } })).toBe(0);
    expect(await db.followup.count({ where: { estimateId: est.id, status: "CANCELLED" } })).toBe(2);

    const run2 = await runAutomation(ctx, "ESTIMATE_RECOVERY", { trigger: "MANUAL", force: true });
    expect(run2.actionsTaken).toBe(0);
    expect(await db.message.count({ where: { customerId: customer.id, automationKey: "ESTIMATE_RECOVERY" } })).toBe(1);

    // Any later outbound text is recorded as BLOCKED, never sent
    const blocked = await sendSms(ctx, { customerId: customer.id, body: "Still there?", sender: "STAFF" });
    expect(blocked.ok).toBe(false);
    expect((await db.message.findUniqueOrThrow({ where: { id: blocked.messageId } })).status).toBe("BLOCKED");

    // Exactly one compliance confirmation was sent after STOP
    expect(await db.message.count({ where: { customerId: customer.id, sender: "SYSTEM", direction: "OUTBOUND" } })).toBe(1);
  });

  it("accepts the estimate and attributes recovery when the customer replies YES", async () => {
    const { ctx, customer, est } = await setup("yes", "8015550502");
    await runAutomation(ctx, "ESTIMATE_RECOVERY", { trigger: "MANUAL", force: true });
    const r = await handleInboundSms(ctx, { from: customer.phone, body: "Yes, let's do it", simulated: true });
    expect(r.action).toBe("ESTIMATE_ACCEPTED");
    const e = await db.estimate.findUniqueOrThrow({ where: { id: est.id } });
    expect(e).toMatchObject({ status: "ACCEPTED", recoveredByAutomation: true });
    expect(await db.followup.count({ where: { estimateId: est.id, status: "SCHEDULED" } })).toBe(0);
  });

  it("hands off to staff when the customer asks for a person", async () => {
    const { ctx, customer, est } = await setup("human", "8015550503");
    const r = await handleInboundSms(ctx, { from: customer.phone, body: "Can I speak to someone about this?", simulated: true });
    expect(r.action).toBe("HANDOFF");
    expect((await db.conversation.findUniqueOrThrow({ where: { customerId: customer.id } })).humanTakeover).toBe(true);
    expect(await db.followup.count({ where: { estimateId: est.id, status: "SCHEDULED" } })).toBe(0);
  });

  it("respects a manual pause", async () => {
    const { ctx, est } = await setup("pause", "8015550504");
    await setEstimateAutomationPaused(ctx, est.id, true);
    const run = await runAutomation(ctx, "ESTIMATE_RECOVERY", { trigger: "MANUAL", force: true });
    expect(run.actionsTaken).toBe(0);
    expect((run.log as { level: string }[]).some((l) => l.level === "stop")).toBe(true);
  });

  it("routes negative satisfaction replies to a human and never sends the review link", async () => {
    const { ctx, customer } = await setup("review", "8015550505");
    await db.review.create({ data: { organizationId: ctx.orgId, customerId: customer.id, status: "SATISFACTION_SENT", satisfactionSentAt: new Date() } });
    const r = await handleInboundSms(ctx, { from: customer.phone, body: "2 - still broken", simulated: true });
    expect(r.action).toBe("REVIEW_NEGATIVE");
    const review = await db.review.findFirstOrThrow({ where: { customerId: customer.id } });
    expect(review.status).toBe("NEGATIVE_FLAGGED");
    const outbound = await db.message.findMany({ where: { customerId: customer.id, direction: "OUTBOUND", sender: { not: "AUTOMATION" } } });
    expect(outbound.some((m) => /http/.test(m.body))).toBe(false);
  });
});
