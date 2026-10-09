import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { processCallTurn, startCall } from "@/lib/services/calls";
import { getScenario } from "@/lib/simulator/scenarios";
import { cleanupTestOrgs, createTestOrg } from "./helpers/db";

async function runScenario(id: string, ctx: Awaited<ReturnType<typeof createTestOrg>>["ctx"]) {
  const sc = getScenario(id)!;
  const { callId } = await startCall(ctx, { callerNumber: sc.callerNumber, clock: sc.clock, simulated: true });
  let last;
  for (const line of sc.script) {
    last = await processCallTurn(ctx, callId, line);
    if (last.ended) break;
  }
  return { callId, last };
}

describe("lead creation from call simulation", () => {
  afterAll(cleanupTestOrgs);

  it("turns an after-hours emergency call into a lead, appointment, transcript, timeline and SMS", async () => {
    const { ctx, techs } = await createTestOrg("sim-emergency");
    const { callId, last } = await runScenario("emergency-ac", ctx);
    expect(last?.ended).toBe(true);

    const call = await db.call.findUniqueOrThrow({ where: { id: callId }, include: { lead: true, appointment: true, customer: true, transcripts: true } });
    expect(call.status).toBe("COMPLETED");
    expect(call.outcome).toBe("BOOKED");
    expect(call.isEmergency).toBe(true);
    expect(call.isAfterHours).toBe(true);
    expect(call.summary).toMatchObject({ urgency: "EMERGENCY" });
    expect(call.transcripts.length).toBeGreaterThanOrEqual(13);

    expect(call.customer).toMatchObject({ firstName: "Jordan", lastName: "Ellis", phone: "+18015550142", zip: "84124" });
    expect(call.lead).toMatchObject({ source: "AFTER_HOURS_CALL", urgency: "EMERGENCY", status: "BOOKED" });
    expect(call.appointment).toMatchObject({ isEmergency: true, bookedBy: "AI", technicianId: techs[0].id });
    expect(call.appointment?.confirmationSentAt).not.toBeNull();

    const events = await db.leadEvent.findMany({ where: { leadId: call.leadId! } });
    const types = events.map((e) => e.type);
    for (const t of ["call_answered", "emergency", "lead_created", "service_area_ok", "appointment_booked", "sms_confirmation", "call_completed"]) expect(types).toContain(t);

    const sms = await db.message.findMany({ where: { customerId: call.customerId!, direction: "OUTBOUND" } });
    expect(sms).toHaveLength(1);
    expect(sms[0]).toMatchObject({ status: "SIMULATED", isSimulated: true, sender: "AI" });
    expect(sms[0].body).toMatch(/confirmed/i);
  });

  it("marks out-of-area callers as lost without booking", async () => {
    const { ctx } = await createTestOrg("sim-ooa");
    const { callId } = await runScenario("out-of-area", ctx);
    const call = await db.call.findUniqueOrThrow({ where: { id: callId }, include: { lead: true, appointment: true } });
    expect(call.outcome).toBe("OUT_OF_AREA");
    expect(call.appointment).toBeNull();
    expect(call.lead).toMatchObject({ status: "LOST", lostReason: "Outside service area" });
  });

  it("transfers human requests during business hours", async () => {
    const { ctx } = await createTestOrg("sim-transfer");
    const { callId } = await runScenario("human-transfer", ctx);
    const call = await db.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call.status).toBe("TRANSFERRED");
    expect(call.transferredTo).toMatch(/Disp/);
  });
});
