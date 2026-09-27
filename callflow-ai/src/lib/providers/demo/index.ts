import { randomUUID } from "node:crypto";
import { answerFromKnowledge, applyGuardrails } from "../../domain/knowledge";
import { classifySatisfaction, detectHumanRequest, detectPriceQuestion } from "../../domain/intents";
import type { AIProvider, CalendarProvider, CallSummary, PaymentProvider, SmsProvider, VoiceProvider } from "../types";

/** Simulated SMS: never leaves the server; the message is stored with status SIMULATED. */
export const demoSms: SmsProvider = {
  name: "Demo SMS (simulated)",
  mode: "demo",
  async send() {
    return { providerSid: `SIM${randomUUID().replace(/-/g, "").slice(0, 30)}`, status: "SIMULATED", simulated: true };
  },
};

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** Demo voice renders TwiML-compatible XML so the webhook routes can be exercised locally. */
export const demoVoice: VoiceProvider = {
  name: "Demo voice (simulated)",
  mode: "demo",
  answerInboundCall({ greeting, gatherActionUrl }) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${esc(gatherActionUrl)}" speechTimeout="auto"><Say>${esc(greeting)}</Say></Gather></Response>`;
  },
  respondToTurn({ reply, gatherActionUrl, transferTo, hangUp }) {
    if (transferTo) return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${esc(reply)}</Say><Dial>${esc(transferTo)}</Dial></Response>`;
    if (hangUp) return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${esc(reply)}</Say><Hangup/></Response>`;
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${esc(gatherActionUrl)}" speechTimeout="auto"><Say>${esc(reply)}</Say></Gather></Response>`;
  },
  verifyWebhookSignature() {
    // Demo mode accepts local requests; the route still rate-limits them.
    return true;
  },
};

export const demoCalendar: CalendarProvider = {
  name: "CallFlow internal calendar",
  mode: "demo",
  async listBusy() {
    return []; // internal appointments are already the source of truth
  },
  async createEvent() {
    return { externalId: `internal_${randomUUID()}` };
  },
  async cancelEvent() {},
};

export const demoPayments: PaymentProvider = {
  name: "Demo billing (non-production)",
  mode: "demo",
  async createCheckoutSession({ plan, successUrl }) {
    const url = new URL(successUrl);
    url.searchParams.set("demo_plan", plan);
    return { url: url.toString(), simulated: true };
  },
  async createPortalSession({ returnUrl }) {
    const url = new URL(returnUrl);
    url.searchParams.set("demo_portal", "1");
    return { url: url.toString(), simulated: true };
  },
  verifyWebhook() {
    return { ok: false };
  },
};

export function rulesSummary(input: Parameters<AIProvider["summarizeCall"]>[0]): CallSummary {
  const f = input.facts;
  const callerLines = input.transcript.filter((t) => t.speaker === "CALLER").map((t) => t.text);
  const outcomeText: Record<string, string> = {
    BOOKED: `Booked ${f.appointmentLabel ?? "an appointment"}`,
    TRANSFERRED: `Transferred to ${f.transferredTo ?? "staff"}`,
    OUT_OF_AREA: "Declined — outside service area",
    LEAD_CAPTURED: "Lead captured for follow-up",
    INFO_PROVIDED: "Question answered",
    MISSED_RECOVERED: "Missed call recovered by text",
    NO_ACTION: "No action required",
  };
  const outcome = outcomeText[f.outcome ?? ""] ?? "In progress";
  const intent = callerLines.some(detectHumanRequest)
    ? "Speak with staff"
    : callerLines.some(detectPriceQuestion)
      ? "Pricing question + service request"
      : f.service
        ? `Service request — ${f.service}`
        : "General inquiry";
  const keyDetails = [
    ...f.urgencyReasons,
    f.inServiceArea === false ? "Address outside service territory" : null,
    f.inServiceArea ? "Address verified in service territory" : null,
    callerLines[0] ? `Caller said: “${callerLines[0].slice(0, 140)}”` : null,
  ].filter((x): x is string => Boolean(x));
  const nextSteps: string[] = [];
  if (f.outcome === "BOOKED") nextSteps.push("Technician to confirm arrival by phone", "Send appointment reminder");
  if (f.outcome === "TRANSFERRED") nextSteps.push(`Confirm ${f.transferredTo ?? "staff"} resolved the caller's questions`);
  if (f.outcome === "LEAD_CAPTURED") nextSteps.push("Call back to schedule");
  if (f.outcome === "OUT_OF_AREA") nextSteps.push("No follow-up needed");
  if (f.urgency === "EMERGENCY") nextSteps.unshift("Emergency — on-call technician notified");
  return {
    headline: `${f.urgency === "EMERGENCY" ? "EMERGENCY · " : ""}${f.service ?? "Call"} — ${outcome}`,
    intent,
    serviceRequested: f.service ?? null,
    urgency: f.urgency,
    outcome,
    customer: { name: f.name ?? null, phone: f.phone ?? null, address: f.address ?? null },
    keyDetails,
    nextSteps,
    generatedBy: "rules",
  };
}

/** Deterministic AI: retrieval over the knowledge base + explicit rules. No invented facts. */
export const demoAI: AIProvider = {
  name: "Deterministic rules engine (demo)",
  mode: "demo",
  async summarizeCall(input) {
    return rulesSummary(input);
  },
  async suggestSmsReply({ customerFirstName, messages, knowledge, prohibitedClaims, businessName, context }) {
    const last = [...messages].reverse().find((m) => m.direction === "INBOUND");
    const name = customerFirstName || "there";
    if (!last) return { reply: `Hi ${name}, this is ${businessName}. How can we help today?`, sources: [] };
    const text = last.body;
    if (detectHumanRequest(text)) return { reply: `Absolutely, ${name} — a member of our team will call you shortly.`, sources: [] };
    const sat = classifySatisfaction(text);
    if (sat.sentiment === "negative")
      return { reply: `${name}, I'm really sorry to hear that. I'd like to make it right — our owner will call you today to talk it through.`, sources: [] };
    if (/\b(yes|ready|approve|go ahead|let'?s do it)\b/i.test(text) && context.openEstimate)
      return { reply: `Great news, ${name}! We'll get estimate ${context.openEstimate.number} scheduled — what days work best for the install?`, sources: [] };
    if (/\b(resched|move|change)\b.*\b(appointment|time|visit)\b/i.test(text) && context.nextAppointment)
      return { reply: `No problem, ${name}. Your visit is currently ${context.nextAppointment}. What day and time would work better?`, sources: [] };
    if (/\?/.test(text) || detectPriceQuestion(text)) {
      const a = answerFromKnowledge(text, knowledge, prohibitedClaims);
      return { reply: `Hi ${name}, ${a.answer.charAt(0).toLowerCase()}${a.answer.slice(1)}`, sources: a.sources.map((s) => s.title) };
    }
    return { reply: applyGuardrails(`Thanks, ${name}! Let us know if there's anything else we can help with.`, prohibitedClaims).text, sources: [] };
  },
  async answerQuestion({ question, knowledge, prohibitedClaims }) {
    const a = answerFromKnowledge(question, knowledge, prohibitedClaims);
    return { ...a, violations: [] };
  },
};
