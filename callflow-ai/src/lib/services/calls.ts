import type { CallOutcome, Prisma, Speaker } from "@prisma/client";
import { db } from "../db";
import { generateEmergencySlots, generateSlots, isWithinBusinessHours } from "../domain/availability";
import { SERVICE_LABELS } from "../domain/intents";
import { answerFromKnowledge } from "../domain/knowledge";
import { initialState, processTurn, startConversation, type EngineContext, type EngineEffect, type EngineState } from "../domain/receptionist";
import { checkServiceArea, findCityInText, KNOWN_OUT_OF_AREA_CITIES } from "../domain/service-area";
import { formatPhone, formatWindow, toE164 } from "../format";
import { getAIProvider } from "../providers";
import type { SimulatedClock } from "../simulator/scenarios";
import { DAY } from "../time";
import { audit } from "./audit";
import { ConflictError, loadOrg, NotFoundError, nowOf, type TenantContext } from "./context";
import { findCustomerByPhone, findOrCreateCustomer } from "./customers";
import { logEvent } from "./events";
import { getKnowledgeDocs } from "./knowledge";
import { sendSms } from "./messaging";
import { bookAppointment, getBusyBlocks, getTechnicians, resolveService } from "./scheduling";

/** Typical ticket sizes used for attributed-revenue estimates when a service has no price. */
export const TYPICAL_TICKET_CENTS: Record<string, number> = {
  ac_repair: 48_500,
  furnace_repair: 42_000,
  ac_install: 890_000,
  furnace_install: 640_000,
  maintenance: 14_900,
  iaq: 120_000,
  general: 35_000,
};

async function buildEngineContext(ctx: TenantContext, opts: { isAfterHours: boolean; callerNumber: string | null; knownCustomerId?: string | null }): Promise<EngineContext> {
  const now = nowOf(ctx);
  const { org, settings } = await loadOrg(ctx);
  const [areas, docs, techs, busy, employees] = await Promise.all([
    db.serviceArea.findMany({ where: { organizationId: ctx.orgId } }),
    getKnowledgeDocs(ctx),
    getTechnicians(ctx),
    getBusyBlocks(ctx, now, new Date(now.getTime() + (settings.scheduling.bookingHorizonDays + 1) * DAY)),
    db.employee.findMany({ where: { organizationId: ctx.orgId, active: true } }),
  ]);
  const onCall = employees.find((e) => e.id === settings.emergency.onCallEmployeeId) ?? employees.find((e) => e.isOnCall && e.kind === "TECHNICIAN") ?? null;
  const dispatcher = employees.find((e) => e.kind === "DISPATCHER") ?? employees.find((e) => e.kind === "OWNER");
  const techRefs = techs.map((t) => ({ ...t, isOnCall: onCall ? t.id === onCall.id : t.isOnCall }));
  const known = opts.knownCustomerId ? await db.customer.findFirst({ where: { id: opts.knownCustomerId, organizationId: ctx.orgId } }) : null;
  const feeDoc = docs.find((d) => d.tags.includes("after-hours-fee"));
  const counties = [...new Set(areas.map((a) => a.county))];
  const prohibited = settings.receptionist.prohibitedClaims;
  const allowedDocs = docs.filter((d) => settings.receptionist.knowledgeCategories.includes(d.category));
  const services = await db.service.findMany({ where: { organizationId: ctx.orgId, active: true } });

  return {
    businessName: org.name,
    tz: org.timezone,
    isAfterHours: opts.isAfterHours,
    callerNumber: opts.callerNumber,
    knownCustomer: known ? { id: known.id, firstName: known.firstName, lastName: known.lastName, phone: known.phone, address: known.address, city: known.city, zip: known.zip } : null,
    greeting: settings.receptionist.greeting,
    afterHoursGreeting: settings.receptionist.afterHoursGreeting,
    recordingDisclosure: settings.receptionist.recordingEnabled ? settings.receptionist.recordingDisclosure : null,
    transferTarget: { name: dispatcher?.name.split(" ")[0] ?? "our team", number: settings.receptionist.transferNumber },
    onCallName: onCall?.name.split(" ")[0] ?? null,
    serviceAreaSummary: counties.length ? `${counties.slice(0, -1).join(", ")}${counties.length > 1 ? ", and " : ""}${counties.at(-1)} ${counties.length > 1 ? "counties" : "County"}` : "our local area",
    afterHoursFeeNote: feeDoc ? feeDoc.content.split(/(?<=[.!?])\s+/)[0] : null,
    checkServiceArea: (i) => checkServiceArea(i, areas),
    findCity: (text) => findCityInText(text, areas, KNOWN_OUT_OF_AREA_CITIES),
    getSlots: ({ emergency, serviceKey, preference, offset }) => {
      const svc = services.find((s) => s.category === serviceKey);
      return emergency
        ? generateEmergencySlots({ now, tz: org.timezone, durationMinutes: 120, bufferMinutes: settings.scheduling.bufferMinutes, technicians: techRefs, busy, count: 2 })
        : generateSlots({
            now,
            tz: org.timezone,
            businessHours: settings.businessHours,
            durationMinutes: svc?.durationMinutes ?? 90,
            bufferMinutes: settings.scheduling.bufferMinutes,
            slotIntervalMinutes: settings.scheduling.slotIntervalMinutes,
            minLeadTimeMinutes: settings.scheduling.minLeadTimeMinutes,
            horizonDays: settings.scheduling.bookingHorizonDays,
            technicians: techRefs,
            busy,
            preference,
            offset,
          });
    },
    answerQuestion: (q) => answerFromKnowledge(q, allowedDocs, prohibited),
  };
}

async function appendTranscript(ctx: TenantContext, callId: string, turns: { speaker: Speaker; text: string }[]) {
  const last = await db.callTranscript.findFirst({ where: { callId }, orderBy: { seq: "desc" }, select: { seq: true } });
  let seq = (last?.seq ?? -1) + 1;
  const now = nowOf(ctx).getTime();
  await db.callTranscript.createMany({
    data: turns.map((t, i) => ({ organizationId: ctx.orgId, callId, seq: seq++, speaker: t.speaker, text: t.text, createdAt: new Date(now + i) })),
  });
}

export async function startCall(ctx: TenantContext, input: { callerNumber: string; clock: SimulatedClock; simulated: boolean; providerCallSid?: string | null; toNumber?: string | null }) {
  const now = nowOf(ctx);
  const { org, settings } = await loadOrg(ctx);
  const isAfterHours = input.clock === "after_hours" ? true : input.clock === "business_hours" ? false : !isWithinBusinessHours(now, settings.businessHours, org.timezone);
  const e164 = toE164(input.callerNumber);
  const known = e164 ? await findCustomerByPhone(ctx, e164) : null;
  const engineCtx = await buildEngineContext(ctx, { isAfterHours, callerNumber: e164 ? formatPhone(e164) : null, knownCustomerId: known?.id });
  const { state, reply, effects } = startConversation(engineCtx);
  const call = await db.call.create({
    data: {
      organizationId: ctx.orgId,
      customerId: known?.id ?? null,
      direction: "INBOUND",
      status: "IN_PROGRESS",
      fromNumber: e164 ?? input.callerNumber,
      toNumber: input.toNumber ?? toE164(org.phone) ?? "+18015550198",
      callerName: known ? `${known.firstName} ${known.lastName}` : null,
      startedAt: now,
      isAfterHours,
      answeredBy: "AI",
      recordingStatus: input.simulated ? "NOT_RECORDED" : settings.receptionist.recordingEnabled ? "PROCESSING" : "DISABLED",
      isSimulated: input.simulated,
      providerCallSid: input.providerCallSid ?? null,
      engineState: state as unknown as Prisma.InputJsonValue,
    },
  });
  await appendTranscript(ctx, call.id, [{ speaker: "AI", text: reply }]);
  await applyEffects(ctx, call.id, state, effects);
  await audit(ctx, input.simulated ? "call.simulated_started" : "call.started", "Call", call.id, { isAfterHours });
  return { callId: call.id, reply, state };
}

export interface TurnResult {
  reply: string;
  state: EngineState;
  ended: boolean;
  transferTo: string | null;
}

export async function processCallTurn(ctx: TenantContext, callId: string, utterance: string): Promise<TurnResult> {
  const call = await db.call.findFirst({ where: { id: callId, organizationId: ctx.orgId } });
  if (!call) throw new NotFoundError("Call");
  if (call.status !== "IN_PROGRESS") return { reply: "This call has already ended.", state: call.engineState as unknown as EngineState, ended: true, transferTo: null };
  const engineCtx = await buildEngineContext(ctx, { isAfterHours: call.isAfterHours, callerNumber: formatPhone(call.fromNumber), knownCustomerId: (call.engineState as unknown as EngineState | null)?.data.existingCustomerId ?? null });
  const prev = (call.engineState as unknown as EngineState) ?? initialState(engineCtx);
  const result = processTurn(prev, utterance, engineCtx);
  let { state, reply } = result;
  const { effects } = result;

  const override = await applyEffects(ctx, call.id, state, effects, engineCtx);
  if (override) {
    state = override.state;
    reply = override.reply;
  }
  await appendTranscript(ctx, call.id, [
    { speaker: "CALLER", text: utterance },
    { speaker: "AI", text: reply },
  ]);
  await db.call.update({ where: { id: call.id }, data: { engineState: state as unknown as Prisma.InputJsonValue, urgency: state.data.urgency, isEmergency: state.data.isEmergency } });
  const ended = ["ended", "transferred", "out_of_area"].includes(state.stage) && effects.some((e) => e.type === "END");
  if (ended) await finalizeCall(ctx, call.id, state);
  const transfer = effects.find((e): e is Extract<EngineEffect, { type: "TRANSFER" }> => e.type === "TRANSFER");
  return { reply, state, ended, transferTo: transfer?.to ?? null };
}

/** Applies engine side effects. Returns a replacement reply if booking lost a race. */
async function applyEffects(ctx: TenantContext, callId: string, state: EngineState, effects: EngineEffect[], engineCtx?: EngineContext): Promise<{ reply: string; state: EngineState } | null> {
  const d = state.data;
  let override: { reply: string; state: EngineState } | null = null;
  for (const effect of effects) {
    const call = await db.call.findUniqueOrThrow({ where: { id: callId } });
    switch (effect.type) {
      case "EVENT":
        await logEvent(ctx, { leadId: call.leadId, customerId: call.customerId, type: effect.key.replace(/_\d+$/, ""), title: effect.title, detail: effect.detail, actor: "AI", metadata: { callId } });
        break;
      case "ENSURE_LEAD":
        await ensureLeadForCall(ctx, callId, state);
        break;
      case "FLAG_HUMAN_FOLLOWUP":
        if (call.leadId) await db.lead.update({ where: { id: call.leadId }, data: { needsHumanFollowUp: true } });
        await logEvent(ctx, { leadId: call.leadId, customerId: call.customerId, type: "human_followup", title: "Flagged for staff follow-up", detail: effect.reason, actor: "AI", metadata: { callId } });
        break;
      case "PAGE_ON_CALL":
        await logEvent(ctx, { leadId: call.leadId, customerId: call.customerId, type: "on_call_paged", title: "On-call technician paged", detail: `${effect.reason}${call.isSimulated ? " (simulated page — no real notification sent)" : ""}`, actor: "AI", metadata: { callId } });
        break;
      case "TRANSFER":
        await db.call.update({ where: { id: callId }, data: { transferredTo: `${effect.name} · ${effect.to}` } });
        await logEvent(ctx, { leadId: call.leadId, customerId: call.customerId, type: "transferred", title: `Warm transfer to ${effect.name}`, detail: `${effect.reason}${call.isSimulated ? " (simulated transfer)" : ""}`, actor: "AI", metadata: { callId } });
        break;
      case "BOOK": {
        const { leadId, customerId } = await ensureLeadForCall(ctx, callId, state);
        await findOrCreateCustomer(ctx, { phone: call.fromNumber, address: d.address, city: d.city, zip: d.zip });
        const service = await resolveService(ctx, d.serviceKey);
        const label = SERVICE_LABELS[d.serviceKey ?? "general"];
        try {
          const appt = await bookAppointment(ctx, {
            customerId,
            leadId,
            serviceId: service?.id ?? null,
            technicianId: effect.slot.technicianId,
            callId,
            title: `${label}${effect.slot.isEmergency ? " — Emergency" : ""}`,
            startAt: new Date(effect.slot.startAt),
            endAt: new Date(effect.slot.endAt),
            isEmergency: effect.slot.isEmergency,
            bookedBy: "AI",
            allowOutsideHours: effect.slot.isEmergency,
            address: [d.address, d.city, d.zip].filter(Boolean).join(", ") || null,
            notes: d.issue ?? null,
            estimatedValueCents: service?.startingPriceCents ?? TYPICAL_TICKET_CENTS[d.serviceKey ?? "general"],
          });
          (state as EngineState & { appointmentId?: string }).appointmentId = appt.id;
        } catch (err) {
          if (!(err instanceof ConflictError) || !engineCtx) throw err;
          const slots = engineCtx.getSlots({ emergency: d.isEmergency, serviceKey: d.serviceKey, preference: d.preference });
          override = {
            reply: `I'm sorry — that window was just taken. ${slots.length ? `I can do ${slots.map((s) => s.label).join(" or ")}. Which works?` : "Let me have our dispatcher call you right back."}`,
            state: { ...state, stage: "awaiting_slot", awaiting: "slot", offeredSlots: slots, booked: undefined, outcome: undefined },
          };
          return override;
        }
        break;
      }
      case "SEND_CONFIRMATION_SMS": {
        const fresh = await db.call.findUniqueOrThrow({ where: { id: callId }, include: { appointment: { include: { technician: true } } } });
        if (!fresh.customerId || !fresh.appointment) break;
        const { org } = await loadOrg(ctx);
        const a = fresh.appointment;
        const window = formatWindow(a.startAt, a.endAt, nowOf(ctx), org.timezone);
        const body = `${org.name}: You're confirmed for ${window} — ${a.title}${a.address ? ` at ${a.address}` : ""}. Technician: ${a.technician?.name.split(" ")[0] ?? "TBD"}.${a.isEmergency ? " They'll call ~30 min before arrival." : ""} Reply C to confirm or call ${formatPhone(org.phone)} to change. Reply STOP to opt out.`;
        const r = await sendSms(ctx, { customerId: fresh.customerId, body, sender: "AI", appointmentId: a.id });
        if (r.ok) await db.appointment.update({ where: { id: a.id }, data: { confirmationSentAt: nowOf(ctx) } });
        await logEvent(ctx, { leadId: fresh.leadId, customerId: fresh.customerId, type: "sms_confirmation", title: r.ok ? `SMS confirmation sent${r.simulated ? " (simulated)" : ""}` : "SMS confirmation blocked", detail: r.ok ? body : r.reason, actor: "AI", metadata: { callId } });
        break;
      }
      case "END":
        break;
    }
  }
  return override;
}

async function ensureLeadForCall(ctx: TenantContext, callId: string, state: EngineState) {
  const call = await db.call.findUniqueOrThrow({ where: { id: callId } });
  if (call.leadId && call.customerId) return { leadId: call.leadId, customerId: call.customerId };
  const d = state.data;
  const phone = d.phone ?? call.fromNumber;
  const customer = d.existingCustomerId
    ? await db.customer.findFirstOrThrow({ where: { id: d.existingCustomerId, organizationId: ctx.orgId } })
    : await findOrCreateCustomer(ctx, { firstName: d.firstName, lastName: d.lastName, phone, email: d.email, address: d.address, city: d.city, zip: d.zip, source: call.isAfterHours ? "AFTER_HOURS_CALL" : "PHONE" });
  const service = await resolveService(ctx, d.serviceKey);
  const recent = await db.lead.findFirst({
    where: { organizationId: ctx.orgId, customerId: customer.id, status: { notIn: ["WON", "LOST"] }, createdAt: { gte: new Date(nowOf(ctx).getTime() - 14 * DAY) } },
    orderBy: { createdAt: "desc" },
  });
  const label = d.serviceKey ? SERVICE_LABELS[d.serviceKey] : "General inquiry";
  const lead =
    recent ??
    (await db.lead.create({
      data: {
        organizationId: ctx.orgId,
        customerId: customer.id,
        status: "QUALIFIED",
        source: d.existingCustomerId ? "REPEAT_CUSTOMER" : call.isAfterHours ? "AFTER_HOURS_CALL" : "PHONE",
        urgency: d.urgency,
        serviceId: service?.id ?? null,
        requestedService: label,
        description: d.issue ?? null,
        estimatedValueCents: service?.startingPriceCents ?? TYPICAL_TICKET_CENTS[d.serviceKey ?? "general"],
        firstResponseAt: call.startedAt,
        createdAt: nowOf(ctx),
      },
    }));
  await db.call.update({ where: { id: callId }, data: { customerId: customer.id, leadId: lead.id, callerName: `${customer.firstName} ${customer.lastName}` } });
  // Attach events logged before the lead existed.
  await db.leadEvent.updateMany({ where: { organizationId: ctx.orgId, leadId: null, metadata: { path: ["callId"], equals: callId } }, data: { leadId: lead.id, customerId: customer.id } });
  await logEvent(ctx, {
    leadId: lead.id,
    customerId: customer.id,
    type: recent ? "lead_updated" : "lead_created",
    title: recent ? "Existing open lead linked to call" : "Lead created from AI call",
    detail: `${label} · ${d.urgency.toLowerCase()} urgency`,
    actor: "AI",
    metadata: { callId },
  });
  return { leadId: lead.id, customerId: customer.id };
}

async function finalizeCall(ctx: TenantContext, callId: string, state: EngineState) {
  const call = await db.call.findUniqueOrThrow({ where: { id: callId }, include: { transcripts: { orderBy: { seq: "asc" } }, appointment: true, customer: true } });
  const { org } = await loadOrg(ctx);
  const now = nowOf(ctx);
  const outcome: CallOutcome = state.outcome ?? "NO_ACTION";
  // Simulated calls get a realistic duration from transcript length (~2.6 words/sec + pauses).
  const words = call.transcripts.reduce((n, t) => n + t.text.split(/\s+/).length, 0);
  const duration = call.isSimulated ? Math.round(words / 2.6 + call.transcripts.length * 2) : Math.round((now.getTime() - call.startedAt.getTime()) / 1000);
  const d = state.data;
  if (call.customerId) await findOrCreateCustomer(ctx, { phone: call.fromNumber, address: d.address, city: d.city, zip: d.zip });
  if (outcome === "OUT_OF_AREA" && call.leadId) {
    await db.lead.update({ where: { id: call.leadId }, data: { status: "LOST", lostAt: now, lostReason: "Outside service area" } });
  }
  const summary = await getAIProvider().summarizeCall({
    transcript: call.transcripts.map((t) => ({ speaker: t.speaker, text: t.text })),
    facts: {
      name: d.firstName ? `${d.firstName} ${d.lastName ?? ""}`.trim() : null,
      phone: d.phone ?? formatPhone(call.fromNumber),
      address: [d.address, d.city, d.zip].filter(Boolean).join(", ") || null,
      service: d.serviceKey ? SERVICE_LABELS[d.serviceKey] : null,
      urgency: d.urgency,
      urgencyReasons: d.urgencyReasons,
      outcome,
      appointmentLabel: call.appointment ? formatWindow(call.appointment.startAt, call.appointment.endAt, now, org.timezone) : null,
      transferredTo: call.transferredTo,
      inServiceArea: d.inServiceArea ?? null,
    },
  });
  await db.call.update({
    where: { id: callId },
    data: {
      status: outcome === "TRANSFERRED" ? "TRANSFERRED" : "COMPLETED",
      outcome,
      endedAt: new Date(call.startedAt.getTime() + duration * 1000),
      durationSeconds: duration,
      summary: summary as unknown as Prisma.InputJsonValue,
      urgency: d.urgency,
      isEmergency: d.isEmergency,
      recordingStatus: call.isSimulated ? "NOT_RECORDED" : call.recordingStatus === "PROCESSING" ? "RECORDED" : call.recordingStatus,
    },
  });
  await db.usageRecord.create({ data: { organizationId: ctx.orgId, type: "VOICE_MINUTES", quantity: Math.max(1, Math.ceil(duration / 60)), occurredAt: now, referenceId: callId } });
  await db.usageRecord.create({ data: { organizationId: ctx.orgId, type: "AI_REQUESTS", quantity: Math.ceil(call.transcripts.length / 2), occurredAt: now, referenceId: callId } });
  await logEvent(ctx, { leadId: call.leadId, customerId: call.customerId, type: "call_completed", title: "Call summary generated", detail: summary.headline, actor: "AI", metadata: { callId } });
}
