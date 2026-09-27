import type { Prisma } from "@prisma/client";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { isQuietHours } from "@/lib/domain/quiet-hours";
import { runAutomation } from "@/lib/services/automations";
import { loadOrg, ValidationError } from "@/lib/services/context";
import { createEstimate, markEstimateSent, trackSentEstimate } from "@/lib/services/estimates";
import { findOrCreateCustomer } from "@/lib/services/customers";
import { handleInboundSms } from "@/lib/services/inbound-sms";
import { completeDial, handleMissedCall, planLiveCall, recoverMissedCall, saveVoicemail } from "@/lib/services/phone";
import { zonedTimeToUtc } from "@/lib/time";
import { twimlDial, twimlMissed } from "@/lib/twiml";
import { resolveOrgByNumber } from "@/lib/webhooks";
import { cleanupTestOrgs, createTestOrg } from "./helpers/db";

async function setPhone(orgId: string, phone: Record<string, unknown>) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const s = org.settings as Record<string, Record<string, unknown>>;
  await db.organization.update({ where: { id: orgId }, data: { settings: { ...s, phone: { ...(s.phone ?? {}), ...phone } } as unknown as Prisma.InputJsonValue } });
}
const uniqueNumber = () => `+1385555${String(Math.floor(Math.random() * 9000) + 1000)}`;

describe("quiet hours (pure)", () => {
  const at = (h: number, m = 0) => zonedTimeToUtc(2026, 10, 7, h, m);
  it("handles windows that wrap past midnight", () => {
    expect(isQuietHours(at(21), "20:00", "08:00")).toBe(true);
    expect(isQuietHours(at(2), "20:00", "08:00")).toBe(true);
    expect(isQuietHours(at(8), "20:00", "08:00")).toBe(false);
    expect(isQuietHours(at(19, 59), "20:00", "08:00")).toBe(false);
  });
  it("handles same-day windows and a disabled window", () => {
    expect(isQuietHours(at(13), "12:00", "14:00")).toBe(true);
    expect(isQuietHours(at(15), "12:00", "14:00")).toBe(false);
    expect(isQuietHours(at(3), "00:00", "00:00")).toBe(false);
  });
});

describe("TwiML builders", () => {
  it("escapes user-controlled text and includes voicemail only when enabled", () => {
    expect(twimlMissed('Hi <b> & "you"', null)).toContain("Hi &lt;b&gt; &amp; &quot;you&quot;");
    expect(twimlMissed("x", null)).toContain("<Hangup/>");
    expect(twimlMissed("x", "https://a.test/vm?callId=1&x=2")).toContain('<Record action="https://a.test/vm?callId=1&amp;x=2"');
    expect(twimlDial("+18015550100", 20, "https://a.test/d")).toContain('<Dial timeout="20"');
  });
});

describe("live missed-call pilot flow (database)", () => {
  afterAll(cleanupTestOrgs);
  afterEach(() => {
    delete process.env.TWILIO_HANDLES_OPT_OUT_REPLY;
  });

  it("routes calls to the company that owns the CallFlow number", async () => {
    const { org } = await createTestOrg("route");
    const num = uniqueNumber();
    await setPhone(org.id, { callflowNumber: num });
    expect((await resolveOrgByNumber(num))?.id).toBe(org.id);
  });

  it("text_back: records a missed call, texts back immediately, alerts staff, and stores voicemail", async () => {
    const { ctx, org } = await createTestOrg("textback");
    await setPhone(org.id, { mode: "text_back", alertPhone: "+18015550777", callflowNumber: uniqueNumber() });
    const plan = await planLiveCall(ctx, { from: "+18015550901", to: "+18015550000", callSid: "CA-test-1" });
    expect(plan.kind).toBe("missed");
    if (plan.kind !== "missed") return;
    expect(plan.message).toContain(org.name);

    const r = await handleMissedCall(ctx, plan.callId);
    expect(r.ok).toBe(true);
    const call = await db.call.findUniqueOrThrow({ where: { id: plan.callId }, include: { lead: true } });
    expect(call).toMatchObject({ status: "MISSED", outcome: "MISSED_RECOVERED", answeredBy: "NONE" });
    expect(call.textBackSentAt).not.toBeNull();
    expect(call.lead?.source).toBe("MISSED_CALL");
    const sms = await db.message.findMany({ where: { customerId: call.customerId!, automationKey: "MISSED_CALL_RECOVERY" } });
    expect(sms).toHaveLength(1);
    expect(await db.leadEvent.count({ where: { organizationId: org.id, type: "staff_alert" } })).toBe(1);

    // Idempotent: a second attempt (e.g. the cron backstop) doesn't text again
    await recoverMissedCall(ctx, plan.callId);
    expect(await db.message.count({ where: { customerId: call.customerId!, automationKey: "MISSED_CALL_RECOVERY" } })).toBe(1);

    await saveVoicemail(ctx, plan.callId, "https://api.twilio.com/2010-04-01/Accounts/AC/Recordings/RE1", 14);
    const vm = await db.call.findUniqueOrThrow({ where: { id: plan.callId } });
    expect(vm).toMatchObject({ status: "VOICEMAIL", recordingStatus: "RECORDED", durationSeconds: 14 });
  });

  it("never texts back the company's own number (forwarding that hides caller ID)", async () => {
    const { ctx, org } = await createTestOrg("own-number");
    await setPhone(org.id, { mode: "text_back", officeNumber: "+18015550889" });
    const plan = await planLiveCall(ctx, { from: "+18015550889", to: "+18015550000", callSid: null });
    if (plan.kind !== "missed") throw new Error("expected missed");
    const r = await handleMissedCall(ctx, plan.callId);
    expect(r.ok).toBe(false);
    expect(await db.message.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("ring_then_text_back: staff answering means no text-back; no answer triggers it", async () => {
    const { ctx, org } = await createTestOrg("ring");
    await setPhone(org.id, { mode: "ring_then_text_back", officeNumber: "+18015550888" });
    const a = await planLiveCall(ctx, { from: "+18015550902", to: "+18015550000", callSid: "CA-test-2" });
    expect(a).toMatchObject({ kind: "dial", officeNumber: "+18015550888" });
    if (a.kind !== "dial") return;
    expect(await completeDial(ctx, a.callId, "completed", 95)).toBe(true);
    expect(await db.call.findUniqueOrThrow({ where: { id: a.callId } })).toMatchObject({ status: "COMPLETED", answeredBy: "STAFF", textBackSentAt: null });

    const b = await planLiveCall(ctx, { from: "+18015550903", to: "+18015550000", callSid: "CA-test-3" });
    if (b.kind !== "dial") throw new Error("expected dial");
    expect(await completeDial(ctx, b.callId, "no-answer", 0)).toBe(false);
    await handleMissedCall(ctx, b.callId);
    expect((await db.call.findUniqueOrThrow({ where: { id: b.callId } })).textBackSentAt).not.toBeNull();
  });

  it("ai_receptionist mode hands the call to the AI engine", async () => {
    const { ctx, org } = await createTestOrg("ai-mode");
    await setPhone(org.id, { mode: "ai_receptionist" });
    expect((await planLiveCall(ctx, { from: "+18015550904", to: "+18015550000", callSid: null })).kind).toBe("ai");
  });

  it("does not send scheduled follow-ups during quiet hours, but a manual run still can", async () => {
    const { ctx } = await createTestOrg("quiet");
    const c = await findOrCreateCustomer(ctx, { firstName: "Quinn", lastName: "Hours", phone: "8015550905" });
    const est = await createEstimate(ctx, { customerId: c.id, title: "AC", items: [{ description: "AC", quantity: 1, unitPriceCents: 500_000 }] });
    const nightCtx = { ...ctx, now: zonedTimeToUtc(2026, 10, 7, 23, 30) };
    await markEstimateSent(nightCtx, est.id, zonedTimeToUtc(2026, 10, 1, 15, 0));
    const scheduled = await runAutomation(nightCtx, "ESTIMATE_RECOVERY", { trigger: "SCHEDULED" });
    expect(scheduled.actionsTaken).toBe(0);
    expect((scheduled.log as { message: string }[])[0].message).toMatch(/Quiet hours/);
    const manual = await runAutomation(nightCtx, "ESTIMATE_RECOVERY", { trigger: "MANUAL", force: true });
    expect(manual.actionsTaken).toBe(1);
  });

  it("tracks an estimate quoted elsewhere, only with SMS consent, timed from the real sent date", async () => {
    const { ctx } = await createTestOrg("track");
    const sentAt = new Date(Date.now() - 2 * 86_400_000);
    const input = { firstName: "Tia", lastName: "Quote", phone: "8015550906", title: "Furnace replacement", amountCents: 640_000, sentAt, smsConsent: true };
    await expect(trackSentEstimate(ctx, { ...input, smsConsent: false })).rejects.toBeInstanceOf(ValidationError);
    const est = await trackSentEstimate(ctx, input);
    const row = await db.estimate.findUniqueOrThrow({ where: { id: est.id }, include: { followups: { orderBy: { stage: "asc" } }, customer: true } });
    expect(row).toMatchObject({ status: "SENT", totalCents: 640_000 });
    expect(row.customer.smsConsentAt).not.toBeNull();
    expect(row.followups.map((f) => Math.round((f.scheduledFor.getTime() - sentAt.getTime()) / 86_400_000))).toEqual([1, 3, 7]);
    await expect(trackSentEstimate(ctx, { ...input, sentAt: new Date(Date.now() - 40 * 86_400_000) })).rejects.toBeInstanceOf(ValidationError);
  });

  it("alerts staff about customer replies and can defer STOP confirmations to Twilio", async () => {
    const { ctx, org } = await createTestOrg("alerts");
    await setPhone(org.id, { alertPhone: "+18015550778" });
    await handleInboundSms(ctx, { from: "8015550907", body: "Hi, can you come look at my furnace?", simulated: true });
    const alert = await db.leadEvent.findFirst({ where: { organizationId: org.id, type: "staff_alert" } });
    expect(alert?.detail).toContain("can you come look");

    process.env.TWILIO_HANDLES_OPT_OUT_REPLY = "true";
    const r = await handleInboundSms(ctx, { from: "8015550908", body: "STOP", simulated: true });
    expect(r.action).toBe("OPTED_OUT");
    expect(await db.message.count({ where: { customerId: r.customerId, direction: "OUTBOUND" } })).toBe(0);
    const { settings } = await loadOrg(ctx);
    expect(settings.phone.alertPhone).toBe("+18015550778");
  });
});
