/**
 * Deterministic AI front-office engine.
 *
 * The engine is a pure state machine: (state, caller utterance, context) ->
 * (new state, reply, effects). It never touches the database; the service
 * layer applies the returned effects (create lead, book appointment, send SMS…).
 * Business-critical decisions — emergency routing, service-area checks,
 * availability, pricing statements — are rule-based and auditable. A live LLM
 * (when configured) is only used for summaries and suggested replies.
 */
import type { CallOutcome, Urgency } from "@prisma/client";
import { formatPhone } from "../format";
import type { SlotOption } from "./availability";
import { assessUrgency, maxUrgency, type SafetyHazard } from "./emergency";
import {
  classifyService,
  detectAffirmative,
  detectFarewell,
  detectHumanRequest,
  detectNegative,
  detectPriceQuestion,
  extractEmail,
  extractName,
  extractPhone,
  extractStreetAddress,
  extractTimePreference,
  parseSlotChoice,
  SERVICE_LABELS,
  type ServiceKey,
  type TimePreference,
} from "./intents";
import type { GroundedAnswer } from "./knowledge";
import { extractZip, type ServiceAreaResult } from "./service-area";

export type AwaitingField = "issue" | "name" | "phone" | "address" | "zip" | "confirm_address" | "preference" | "slot" | "anything_else";
export type EngineStage = "intake" | "awaiting_slot" | "booked" | "transferred" | "out_of_area" | "ended";

export interface EngineData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  zip?: string;
  addressConfirmed?: boolean;
  issue?: string;
  serviceKey?: ServiceKey;
  urgency: Urgency;
  isEmergency: boolean;
  safetyHazard: SafetyHazard;
  temperatureF: number | null;
  urgencyReasons: string[];
  preference?: TimePreference | null;
  inServiceArea?: boolean;
  county?: string;
  existingCustomerId?: string;
}

export interface EngineState {
  stage: EngineStage;
  awaiting: AwaitingField | null;
  data: EngineData;
  offeredSlots: SlotOption[];
  slotOffset: number;
  booked?: SlotOption;
  callerText: string;
  flags: {
    emergencyAnnounced: boolean;
    areaChecked: boolean;
    preferenceAsked: boolean;
    callbackRequested: boolean;
    leadRequested: boolean;
    serviceAcknowledged: boolean;
  };
  outcome?: CallOutcome;
}

export interface KnownCustomer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
}

export interface EngineContext {
  businessName: string;
  tz: string;
  isAfterHours: boolean;
  callerNumber?: string | null;
  knownCustomer?: KnownCustomer | null;
  greeting: string;
  afterHoursGreeting: string;
  recordingDisclosure?: string | null;
  transferTarget: { name: string; number: string };
  onCallName?: string | null;
  serviceAreaSummary: string;
  afterHoursFeeNote?: string | null;
  checkServiceArea: (input: { zip?: string | null; city?: string | null }) => ServiceAreaResult;
  findCity: (text: string) => string | null;
  getSlots: (opts: { emergency: boolean; serviceKey?: ServiceKey; preference?: TimePreference | null; offset?: number }) => SlotOption[];
  answerQuestion: (question: string) => GroundedAnswer;
}

export type EngineEffect =
  | { type: "EVENT"; key: string; title: string; detail?: string }
  | { type: "ENSURE_LEAD" }
  | { type: "BOOK"; slot: SlotOption }
  | { type: "SEND_CONFIRMATION_SMS"; slot: SlotOption }
  | { type: "TRANSFER"; to: string; name: string; reason: string }
  | { type: "PAGE_ON_CALL"; reason: string }
  | { type: "FLAG_HUMAN_FOLLOWUP"; reason: string }
  | { type: "END"; outcome: CallOutcome };

export interface EngineResult {
  state: EngineState;
  reply: string;
  effects: EngineEffect[];
}

const firstName = (full: string) => full.split(" ")[0];

const TERMINAL: EngineStage[] = ["transferred", "out_of_area", "ended"];

function fill(template: string, businessName: string) {
  return template.replace(/\{business\}/g, businessName);
}

export function initialState(ctx: EngineContext): EngineState {
  const kc = ctx.knownCustomer;
  return {
    stage: "intake",
    awaiting: "issue",
    data: {
      urgency: "NORMAL",
      isEmergency: false,
      safetyHazard: null,
      temperatureF: null,
      urgencyReasons: [],
      firstName: kc?.firstName,
      lastName: kc?.lastName,
      phone: kc ? formatPhone(kc.phone) : undefined,
      address: kc?.address ?? undefined,
      city: kc?.city ?? undefined,
      zip: kc?.zip ?? undefined,
      existingCustomerId: kc?.id,
    },
    offeredSlots: [],
    slotOffset: 0,
    callerText: "",
    flags: {
      emergencyAnnounced: false,
      areaChecked: false,
      preferenceAsked: false,
      callbackRequested: false,
      leadRequested: false,
      serviceAcknowledged: false,
    },
  };
}

export function startConversation(ctx: EngineContext): EngineResult {
  const state = initialState(ctx);
  const base = fill(ctx.isAfterHours ? ctx.afterHoursGreeting : ctx.greeting, ctx.businessName);
  const personal = ctx.knownCustomer ? `Hi ${ctx.knownCustomer.firstName}, welcome back! ` : "";
  // Recording disclosure goes right after the first sentence, before any questions.
  const [first, ...rest] = base.split(/(?<=[.!?])\s+/);
  const greeting = [first, ctx.recordingDisclosure, ...rest].filter(Boolean).join(" ");
  const effects: EngineEffect[] = [
    { type: "EVENT", key: "call_answered", title: ctx.isAfterHours ? "After-hours call answered by AI" : "Call answered by AI", detail: "Answered on the first ring" },
  ];
  if (ctx.knownCustomer) effects.push({ type: "EVENT", key: "existing_customer", title: "Existing customer recognized by caller ID", detail: `${ctx.knownCustomer.firstName} ${ctx.knownCustomer.lastName}` });
  return { state, reply: `${personal}${greeting}`.trim(), effects };
}

function applyExtraction(s: EngineState, text: string, ctx: EngineContext) {
  const d = s.data;
  const name = extractName(text, s.awaiting === "name");
  if (name && (!d.firstName || s.awaiting === "name")) {
    d.firstName = name.first;
    d.lastName = name.last || d.lastName;
  }
  const phone = extractPhone(text);
  if (phone) d.phone = phone;
  const email = extractEmail(text);
  if (email) d.email = email;

  const street = extractStreetAddress(text);
  if (street) {
    d.address = street;
    d.addressConfirmed = true;
    d.city = ctx.findCity(text) ?? undefined;
    d.zip = extractZip(text.replace(street, "")) ?? undefined;
    s.flags.areaChecked = false;
  } else {
    const zip = extractZip(text);
    if (zip && (s.awaiting === "zip" || s.awaiting === "address")) {
      d.zip = zip;
      s.flags.areaChecked = false;
    }
    const city = ctx.findCity(text);
    if (city && (s.awaiting === "zip" || s.awaiting === "address")) {
      d.city = city;
      s.flags.areaChecked = false;
    }
  }

  if (!d.issue) {
    const svc = classifyService(text);
    const substantive = text.split(/\s+/).length >= 4 && !detectHumanRequest(text);
    if (svc || (s.awaiting === "issue" && substantive)) {
      d.issue = text.trim().slice(0, 280);
      d.serviceKey = svc ?? "general";
    }
  }

  const pref = extractTimePreference(text);
  if (pref) d.preference = pref;
}

function acknowledgement(s: EngineState, ctx: EngineContext): string | null {
  const d = s.data;
  if (d.isEmergency && !s.flags.emergencyAnnounced) {
    s.flags.emergencyAnnounced = true;
    s.flags.serviceAcknowledged = true;
    const why = d.temperatureF ? `with it ${d.temperatureF} degrees inside` : "given what you're describing";
    return `I'm sorry you're dealing with that — ${why}, I'm treating this as an emergency and prioritizing our on-call technician${ctx.onCallName ? `, ${ctx.onCallName}` : ""}.`;
  }
  if (d.issue && !s.flags.serviceAcknowledged) {
    s.flags.serviceAcknowledged = true;
    const label = SERVICE_LABELS[d.serviceKey ?? "general"].toLowerCase().replace(/^ac\b/, "AC");
    const article = /^[aeio]/i.test(label) ? "an" : "a";
    return d.urgency === "HIGH"
      ? `Got it — that sounds like ${article} ${label} visit, and I'll prioritize it.`
      : `Got it — that sounds like ${article} ${label} visit. I can get that scheduled for you.`;
  }
  return null;
}

function offerSlots(s: EngineState, ctx: EngineContext, parts: string[], effects: EngineEffect[]) {
  const d = s.data;
  const slots = ctx.getSlots({ emergency: d.isEmergency, serviceKey: d.serviceKey, preference: d.preference, offset: s.slotOffset });
  if (!slots.length) {
    parts.push(
      d.isEmergency
        ? `I'm paging our on-call technician right now, and they'll call you back within 15 minutes to confirm an arrival time.`
        : `I don't see an opening in the next couple of weeks that fits, so I've flagged this for ${ctx.transferTarget.name} to call you first thing.`,
    );
    effects.push(d.isEmergency ? { type: "PAGE_ON_CALL", reason: "No emergency window available" } : { type: "FLAG_HUMAN_FOLLOWUP", reason: "No availability found" });
    effects.push({ type: "END", outcome: "LEAD_CAPTURED" });
    s.stage = "ended";
    s.outcome = "LEAD_CAPTURED";
    s.awaiting = null;
    return;
  }
  s.offeredSlots = slots;
  s.stage = "awaiting_slot";
  s.awaiting = "slot";
  effects.push({ type: "EVENT", key: `slots_offered_${s.slotOffset}`, title: "Availability checked", detail: slots.map((x) => `${x.label} (${x.technicianName})`).join(" · ") });
  if (d.isEmergency) {
    const opts = slots.map((x) => x.label.replace(/^(Tonight|Today|Tomorrow), /, (_, w: string) => `${w.toLowerCase()} `)).join(" or ");
    parts.push(`${firstName(slots[0].technicianName)}, our on-call technician, can be there ${opts}.${ctx.afterHoursFeeNote && ctx.isAfterHours ? ` ${ctx.afterHoursFeeNote}` : ""} Which works better?`);
  } else {
    const prefLabel = d.preference && !d.preference.asap ? ` for ${d.preference.label}` : "";
    const list = slots.map((x, i) => `${i + 1}) ${x.label}`).join(", ");
    parts.push(`Here are the next openings${prefLabel}: ${list}. Which works best?`);
  }
}

function nextStep(s: EngineState, ctx: EngineContext, parts: string[], effects: EngineEffect[]) {
  const d = s.data;
  const ack = acknowledgement(s, ctx);
  if (ack) parts.push(ack);

  if (!d.issue) {
    s.awaiting = "issue";
    parts.push(parts.length ? "Is there something going on with your heating or cooling I can help with?" : "Can you tell me a little about what's going on with your system?");
    return;
  }
  if (!d.firstName) {
    s.awaiting = "name";
    parts.push("Can I get your first and last name?");
    return;
  }
  if (!d.phone) {
    s.awaiting = "phone";
    parts.push(ctx.callerNumber ? `Thanks, ${d.firstName}. Is ${formatPhone(ctx.callerNumber)} the best number to reach you?` : `Thanks, ${d.firstName}. What's the best callback number?`);
    return;
  }
  if (!s.flags.leadRequested) {
    s.flags.leadRequested = true;
    effects.push({ type: "ENSURE_LEAD" });
  }
  if (d.address && d.existingCustomerId && !d.addressConfirmed) {
    s.awaiting = "confirm_address";
    parts.push(`Should we send the technician to ${d.address}${d.city ? `, ${d.city}` : ""}?`);
    return;
  }
  if (!d.address) {
    s.awaiting = "address";
    parts.push("What's the service address, including the ZIP code?");
    return;
  }
  if (!d.zip && !d.city) {
    s.awaiting = "zip";
    parts.push("And what ZIP code is that in?");
    return;
  }
  if (!s.flags.areaChecked) {
    s.flags.areaChecked = true;
    const res = ctx.checkServiceArea({ zip: d.zip, city: d.city });
    d.inServiceArea = res.inArea;
    d.county = res.county;
    if (!res.inArea) {
      const where = d.city ?? `ZIP ${d.zip}`;
      parts.push(
        `Thanks, ${d.firstName}. Unfortunately ${where} is outside our service area — we cover ${ctx.serviceAreaSummary}. I'd recommend reaching out to a licensed HVAC contractor closer to you, and I'm sorry we can't help this time.${
          d.isEmergency ? " If anyone in the home is in danger from the heat, please call 911." : ""
        }`,
      );
      effects.push({ type: "EVENT", key: "out_of_area", title: "Outside service area — politely declined", detail: res.reason });
      effects.push({ type: "END", outcome: "OUT_OF_AREA" });
      s.stage = "out_of_area";
      s.outcome = "OUT_OF_AREA";
      s.awaiting = null;
      return;
    }
    effects.push({ type: "EVENT", key: "service_area_ok", title: "Service area confirmed", detail: res.reason });
    parts.push(`Thanks${d.firstName ? `, ${d.firstName}` : ""} — ${res.city ?? "that address"} is in our service area.`);
  }
  if (!d.isEmergency && !d.preference && !s.flags.preferenceAsked) {
    s.flags.preferenceAsked = true;
    s.awaiting = "preference";
    parts.push("Do you have a preferred day or time of day?");
    return;
  }
  offerSlots(s, ctx, parts, effects);
}

function bookingConfirmation(s: EngineState, slot: SlotOption) {
  const d = s.data;
  const label = slot.label.replace(/^(Tonight|Today|Tomorrow), /, (_, w: string) => `${w.toLowerCase()} `);
  const arrival = slot.isEmergency
    ? `${firstName(slot.technicianName)} will call you about 30 minutes before arriving.`
    : "You'll get a reminder text the day before.";
  return `You're all set for ${label} with ${slot.technicianName}. ${arrival} I've texted a confirmation to ${d.phone}. Is there anything else I can help with?`;
}

export function processTurn(state: EngineState, utterance: string, ctx: EngineContext): EngineResult {
  const s: EngineState = structuredClone(state);
  const text = utterance.trim();
  const parts: string[] = [];
  const effects: EngineEffect[] = [];
  s.callerText = `${s.callerText} ${text}`.trim();

  if (TERMINAL.includes(s.stage)) {
    return { state: s, reply: "Thanks again for calling. Take care!", effects: [] };
  }

  // Wrap-up after booking
  if (s.stage === "booked") {
    if (detectHumanRequest(text)) {
      s.stage = "transferred";
      effects.push({ type: "TRANSFER", to: ctx.transferTarget.number, name: ctx.transferTarget.name, reason: "Caller asked for a person after booking" });
      return { state: s, reply: `Of course — connecting you with ${ctx.transferTarget.name} now.`, effects };
    }
    if (detectPriceQuestion(text)) {
      const ans = ctx.answerQuestion(text);
      effects.push({ type: "EVENT", key: "price_question_post", title: ans.grounded ? "Pricing answered from knowledge base" : "Pricing deferred to technician", detail: ans.sources.map((x) => x.title).join(", ") || undefined });
      return { state: s, reply: `${ans.answer} Anything else I can help with?`, effects };
    }
    s.stage = "ended";
    s.awaiting = null;
    effects.push({ type: "END", outcome: s.outcome ?? "BOOKED" });
    const closing = s.data.isEmergency ? "Help is on the way — try to stay somewhere cool until the technician arrives." : "We'll see you soon.";
    return { state: s, reply: `Thanks for calling ${ctx.businessName}. ${closing} Take care!`, effects };
  }

  const prevUrgency = s.data.urgency;
  applyExtraction(s, text, ctx);

  // Confirmation answers
  if (s.awaiting === "phone" && !extractPhone(text)) {
    if (detectAffirmative(text) && ctx.callerNumber) s.data.phone = formatPhone(ctx.callerNumber);
    else if (detectNegative(text)) {
      return { state: { ...s, awaiting: "phone" }, reply: "No problem — what's the best number to reach you?", effects };
    }
  }
  if (s.awaiting === "confirm_address" && !extractStreetAddress(text)) {
    if (detectAffirmative(text) || /\bsame\b/i.test(text)) s.data.addressConfirmed = true;
    else if (detectNegative(text)) {
      s.data.address = undefined;
      s.data.city = undefined;
      s.data.zip = undefined;
      s.data.addressConfirmed = true;
    }
  }

  // Urgency (re-assessed over everything the caller has said)
  const assessment = assessUrgency(s.callerText);
  s.data.urgency = maxUrgency(s.data.urgency, assessment.urgency);
  if (assessment.temperatureF) s.data.temperatureF = assessment.temperatureF;
  if (assessment.isEmergency && !s.data.isEmergency) {
    s.data.isEmergency = true;
    s.data.safetyHazard = assessment.safetyHazard;
    s.data.urgencyReasons = assessment.reasons;
    effects.push({ type: "EVENT", key: "emergency", title: "Emergency detected", detail: assessment.reasons.join("; ") });
  } else if (s.data.urgency !== prevUrgency && assessment.reasons.length) {
    s.data.urgencyReasons = assessment.reasons;
  }

  // Safety hazards: give safety instructions and escalate immediately.
  if (s.data.safetyHazard) {
    const hazard = s.data.safetyHazard === "gas" ? "a gas odor" : s.data.safetyHazard === "carbon_monoxide" ? "a carbon monoxide alarm" : "smoke or burning";
    parts.push(
      `For your safety: with ${hazard}, please leave the home now, don't operate switches or appliances, and call 911${s.data.safetyHazard === "gas" ? " and your gas utility" : ""} from outside. I'm alerting our on-call technician${ctx.onCallName ? `, ${ctx.onCallName},` : ""} to call you right away.`,
    );
    effects.push({ type: "PAGE_ON_CALL", reason: `Safety hazard: ${hazard}` });
    effects.push({ type: "ENSURE_LEAD" });
    effects.push({ type: "TRANSFER", to: ctx.transferTarget.number, name: ctx.onCallName ?? ctx.transferTarget.name, reason: "Safety hazard escalation" });
    effects.push({ type: "END", outcome: "TRANSFERRED" });
    s.stage = "transferred";
    s.outcome = "TRANSFERRED";
    s.awaiting = null;
    return { state: s, reply: parts.join(" "), effects };
  }

  // Human requested
  if (detectHumanRequest(text)) {
    if (!ctx.isAfterHours || s.data.isEmergency) {
      const target = ctx.isAfterHours ? { name: ctx.onCallName ?? ctx.transferTarget.name, number: ctx.transferTarget.number } : ctx.transferTarget;
      effects.push({ type: "EVENT", key: "human_requested", title: "Caller requested a person", detail: `Warm transfer to ${target.name}` });
      if (s.data.phone || ctx.callerNumber) effects.push({ type: "ENSURE_LEAD" });
      effects.push({ type: "TRANSFER", to: target.number, name: target.name, reason: "Caller requested a person" });
      effects.push({ type: "END", outcome: "TRANSFERRED" });
      s.stage = "transferred";
      s.outcome = "TRANSFERRED";
      s.awaiting = null;
      return {
        state: s,
        reply: `Of course. I'm connecting you with ${target.name} now — I'll pass along what you've shared so you don't have to repeat yourself.`,
        effects,
      };
    }
    if (!s.flags.callbackRequested) {
      s.flags.callbackRequested = true;
      effects.push({ type: "FLAG_HUMAN_FOLLOWUP", reason: "After-hours caller asked to speak with staff" });
      effects.push({ type: "EVENT", key: "callback_requested", title: "Priority callback requested", detail: `Flagged for ${ctx.transferTarget.name} at opening` });
      parts.push(`Our office team is back at 8:00 AM, and I've flagged your call so ${ctx.transferTarget.name} reaches out first thing. In the meantime, I can get you on the schedule right now.`);
    }
  }

  // Choosing an offered slot
  if (s.stage === "awaiting_slot") {
    const newPref = extractTimePreference(text);
    if (/\b(none|neither|other|different|later|another|don'?t work|doesn'?t work)\b/i.test(text) || (detectNegative(text) && !newPref)) {
      s.slotOffset += s.offeredSlots.length || 3;
      offerSlots(s, ctx, parts, effects);
      return { state: s, reply: ["No problem.", ...parts].join(" "), effects };
    }
    const hours = s.offeredSlots.map((x) => Number(new Intl.DateTimeFormat("en-US", { timeZone: ctx.tz, hour: "numeric", hourCycle: "h23" }).format(new Date(x.startAt))));
    const idx = newPref && !/\b(first|second|third|last|one|two|three|\d)\b/i.test(text) ? null : parseSlotChoice(text, s.offeredSlots.length, hours);
    if (idx !== null) {
      const slot = s.offeredSlots[idx];
      s.booked = slot;
      s.stage = "booked";
      s.outcome = "BOOKED";
      s.awaiting = "anything_else";
      effects.push({ type: "BOOK", slot });
      effects.push({ type: "SEND_CONFIRMATION_SMS", slot });
      return { state: s, reply: bookingConfirmation(s, slot), effects };
    }
    if (newPref) {
      s.slotOffset = 0;
      offerSlots(s, ctx, parts, effects);
      return { state: s, reply: ["Sure.", ...parts].join(" "), effects };
    }
    if (detectPriceQuestion(text)) {
      const ans = ctx.answerQuestion(text);
      return { state: s, reply: `${ans.answer} Which of those times works best for you?`, effects };
    }
    return { state: s, reply: "Sorry, which of those works best? You can say the first, second, or third option.", effects };
  }

  // Pricing questions are answered only from the knowledge base.
  if (detectPriceQuestion(text)) {
    const ans = ctx.answerQuestion(text);
    parts.push(ans.answer);
    effects.push({
      type: "EVENT",
      key: `price_question_${s.callerText.length}`,
      title: ans.grounded ? "Pricing answered from knowledge base" : "Pricing question deferred (not in knowledge base)",
      detail: ans.sources.map((x) => x.title).join(", ") || undefined,
    });
  }

  if (!s.data.issue && detectFarewell(text) && s.callerText.split(/\s+/).length < 12) {
    s.stage = "ended";
    s.outcome = "INFO_PROVIDED";
    effects.push({ type: "END", outcome: "INFO_PROVIDED" });
    return { state: s, reply: [...parts, `Thanks for calling ${ctx.businessName}. Have a great day!`].join(" "), effects };
  }

  nextStep(s, ctx, parts, effects);
  return { state: s, reply: parts.join(" "), effects };
}
