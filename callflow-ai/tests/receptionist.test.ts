import { describe, expect, it } from "vitest";
import { answerFromKnowledge } from "@/lib/domain/knowledge";
import { processTurn, startConversation, type EngineEffect } from "@/lib/domain/receptionist";
import { getScenario } from "@/lib/simulator/scenarios";
import { zonedTimeToUtc } from "@/lib/time";
import { makeCtx } from "./helpers/engine-context";

function run(scenarioId: string, now: Date, isAfterHours: boolean, known = null as Parameters<typeof makeCtx>[0]["known"]) {
  const sc = getScenario(scenarioId)!;
  const ctx = makeCtx({ now, isAfterHours, callerNumber: sc.callerNumber, known });
  let { state } = startConversation(ctx);
  const effects: EngineEffect[] = [];
  const replies: string[] = [];
  for (const line of sc.script) {
    const r = processTurn(state, line, ctx);
    state = r.state;
    effects.push(...r.effects);
    replies.push(r.reply);
  }
  return { state, effects, replies };
}

// Tuesday Sep 29 2026, 9:40 PM Mountain
const AFTER_HOURS = zonedTimeToUtc(2026, 9, 29, 21, 40);
// Tuesday Sep 29 2026, 10:15 AM Mountain
const BUSINESS = zonedTimeToUtc(2026, 9, 29, 10, 15);

describe("AI receptionist engine", () => {
  it("handles an after-hours AC emergency end to end", () => {
    const { state, effects, replies } = run("emergency-ac", AFTER_HOURS, true);
    expect(state.data.isEmergency).toBe(true);
    expect(state.data.urgency).toBe("EMERGENCY");
    expect(state.data.firstName).toBe("Jordan");
    expect(state.data.lastName).toBe("Ellis");
    expect(state.data.phone).toBe("(801) 555-0142");
    expect(state.data.zip).toBe("84124");
    expect(state.data.inServiceArea).toBe(true);
    expect(state.stage).toBe("ended");
    const types = effects.map((e) => e.type);
    expect(types).toContain("ENSURE_LEAD");
    expect(types).toContain("BOOK");
    expect(types).toContain("SEND_CONFIRMATION_SMS");
    const book = effects.find((e) => e.type === "BOOK") as Extract<EngineEffect, { type: "BOOK" }>;
    expect(book.slot.isEmergency).toBe(true);
    expect(book.slot.technicianName).toBe("Jake Morrison");
    expect(replies.join(" ")).toMatch(/emergency/i);
    expect(replies.join(" ")).toContain("$149");
  });

  it("books a standard repair respecting time preference", () => {
    const { state, effects } = run("furnace-noise", BUSINESS, false);
    expect(state.data.serviceKey).toBe("furnace_repair");
    expect(state.data.urgency).toBe("NORMAL");
    const book = effects.find((e) => e.type === "BOOK") as Extract<EngineEffect, { type: "BOOK" }>;
    expect(book).toBeTruthy();
    expect(book.slot.isEmergency).toBe(false);
    // Wednesday Sep 30 morning in Denver
    const start = new Date(book.slot.startAt);
    expect(start.getTime()).toBeGreaterThanOrEqual(zonedTimeToUtc(2026, 9, 30, 8, 0).getTime());
    expect(start.getTime()).toBeLessThan(zonedTimeToUtc(2026, 9, 30, 12, 0).getTime());
  });

  it("declines callers outside the service area without booking", () => {
    const { state, effects, replies } = run("out-of-area", BUSINESS, false);
    expect(state.stage).toBe("out_of_area");
    expect(effects.some((e) => e.type === "BOOK")).toBe(false);
    expect(effects).toContainEqual({ type: "END", outcome: "OUT_OF_AREA" });
    expect(replies.at(-1)).toMatch(/outside our service area/);
  });

  it("answers price questions only from the knowledge base", () => {
    const { replies, effects } = run("price-question", BUSINESS, false);
    expect(replies[0]).toContain("$89");
    expect(effects.some((e) => e.type === "BOOK")).toBe(true);
  });

  it("defers price questions not covered by the knowledge base", () => {
    const ctx = makeCtx({ now: BUSINESS, isAfterHours: false });
    ctx.answerQuestion = (q) => answerFromKnowledge(q, [], []);
    const { state } = startConversation(ctx);
    const r = processTurn(state, "How much is a new heat pump installed?", ctx);
    expect(r.reply).not.toMatch(/\$\d/);
    expect(r.reply).toMatch(/inaccurate number/);
  });

  it("recognizes existing customers and confirms the address on file", () => {
    const known = { id: "c1", firstName: "Linda", lastName: "Morales", phone: "8015550117", address: "1420 E Browning Ave", city: "Salt Lake City", zip: "84105" };
    const ctx = makeCtx({ now: BUSINESS, isAfterHours: false, callerNumber: "(801) 555-0117", known });
    const start = startConversation(ctx);
    expect(start.reply).toMatch(/Hi Linda/);
    const r1 = processTurn(start.state, "Hi, I'd like to schedule my fall furnace tune-up.", ctx);
    expect(r1.reply).toMatch(/1420 E Browning Ave/);
  });

  it("transfers to a human during business hours", () => {
    const { state, effects } = run("human-transfer", BUSINESS, false);
    expect(state.stage).toBe("transferred");
    expect(effects.some((e) => e.type === "TRANSFER")).toBe(true);
  });

  it("escalates gas odor immediately with safety instructions", () => {
    const ctx = makeCtx({ now: AFTER_HOURS, isAfterHours: true });
    const { state } = startConversation(ctx);
    const r = processTurn(state, "I smell gas near my furnace", ctx);
    expect(r.reply).toMatch(/leave the home/);
    expect(r.effects.some((e) => e.type === "PAGE_ON_CALL")).toBe(true);
    expect(r.state.stage).toBe("transferred");
  });
});
