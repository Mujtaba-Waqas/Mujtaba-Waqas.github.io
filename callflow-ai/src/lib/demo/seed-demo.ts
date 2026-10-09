/**
 * Seeds the Summit Peak HVAC demo tenant. Used by `prisma db seed`, the Vercel
 * build script, and the daily demo-reset cron. Idempotent: the demo org and demo
 * users are deleted and rebuilt. All timestamps are relative to "now" so the
 * dashboard always shows the last 30 days.
 */
import type { PrismaClient, AppointmentStatus, CallOutcome, CallStatus, LeadSource, LeadStatus, Prisma, Urgency } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ESTIMATE_TEMPLATES } from "../domain/followups";
import { rulesSummary } from "../providers/demo";
import { formatWindow } from "../format";
import { DEFAULT_SETTINGS } from "../validation/settings";
import { DAY, HOUR, MINUTE, zonedDayOffset, zonedParts, zonedTimeToUtc } from "../time";
import { seededRandom } from "../utils";
import { FIRST_NAMES, KNOWLEDGE, LAST_NAMES, SERVICE_AREAS, SERVICES, STREETS } from "./seed-data";

let db: PrismaClient;
const TZ = "America/Denver";
let NOW = new Date();
let rand = seededRandom(20260926);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

export const DEMO_EMAIL = "olivia@summitpeakhvac.demo";
export const DEMO_PASSWORD = "CallFlowDemo!2026";
const REVIEW_URL = "https://reviews.example.com/summit-peak-hvac";

/** Wall-clock time in Denver `days` days from today (negative = past). */
function at(days: number, hour: number, minute = 0) {
  const day = zonedDayOffset(NOW, days, TZ);
  const p = zonedParts(day, TZ);
  return zonedTimeToUtc(p.year, p.month, p.day, hour, minute, TZ);
}
/** Like `at`, but clamped so "today" timestamps are never in the future. */
function atPast(days: number, hour: number, minute = 0) {
  return new Date(Math.min(at(days, hour, minute).getTime(), NOW.getTime() - 12 * MINUTE));
}
function isWeekday(days: number) {
  const wd = zonedParts(zonedDayOffset(NOW, days, TZ), TZ).weekday;
  return wd >= 1 && wd <= 5;
}
const fmtPhone = (p: string) => `(${p.slice(2, 5)}) ${p.slice(5, 8)}-${p.slice(8)}`;

async function wipe() {
  // Remove the demo org plus any extra companies visitors created while signed in as a demo user.
  await db.organization.deleteMany({
    where: { OR: [{ slug: "summit-peak-hvac" }, { memberships: { some: { user: { email: { endsWith: "@summitpeakhvac.demo" } } } } }] },
  });
  await db.user.deleteMany({ where: { email: { endsWith: "@summitpeakhvac.demo" } } });
}

async function main() {
  await wipe();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ── Organization, users, team ───────────────────────────────────────────
  const org = await db.organization.create({
    data: {
      name: "Summit Peak HVAC",
      slug: "summit-peak-hvac",
      timezone: TZ,
      phone: "+18015550198",
      email: "office@summitpeakhvac.demo",
      website: "https://summitpeakhvac.example",
      address: "2150 S 300 W",
      city: "Salt Lake City",
      state: "UT",
      googleReviewUrl: REVIEW_URL,
      onboardingStep: 10,
      onboardingCompletedAt: new Date(NOW.getTime() - 62 * DAY),
      createdAt: new Date(NOW.getTime() - 64 * DAY),
    },
  });
  const O = org.id;
  const olivia = await db.user.create({ data: { email: DEMO_EMAIL, name: "Olivia Chen", passwordHash } });
  const marcusUser = await db.user.create({ data: { email: "marcus@summitpeakhvac.demo", name: "Marcus Reed", passwordHash } });
  const jakeUser = await db.user.create({ data: { email: "jake@summitpeakhvac.demo", name: "Jake Morrison", passwordHash } });
  await db.membership.createMany({
    data: [
      { userId: olivia.id, organizationId: O, role: "OWNER" },
      { userId: marcusUser.id, organizationId: O, role: "DISPATCHER" },
      { userId: jakeUser.id, organizationId: O, role: "TECHNICIAN" },
    ],
  });
  const emp = async (name: string, title: string, kind: "OWNER" | "DISPATCHER" | "TECHNICIAN", color: string, extra: Partial<Prisma.EmployeeUncheckedCreateInput> = {}) =>
    db.employee.create({ data: { organizationId: O, name, title, kind, color, email: `${name.split(" ")[0].toLowerCase()}@summitpeakhvac.demo`, ...extra } });
  const eOlivia = await emp("Olivia Chen", "Owner", "OWNER", "#0f172a", { userId: olivia.id, phone: "+18015550101" });
  const eMarcus = await emp("Marcus Reed", "Dispatcher", "DISPATCHER", "#6366f1", { userId: marcusUser.id, phone: "+18015550102" });
  const eJake = await emp("Jake Morrison", "Senior Technician", "TECHNICIAN", "#0891b2", { userId: jakeUser.id, isOnCall: true, skills: ["AC", "Furnace", "Installs"], phone: "+18015550103" });
  const eSofia = await emp("Sofia Alvarez", "HVAC Technician", "TECHNICIAN", "#16a34a", { skills: ["AC", "Furnace", "IAQ"], phone: "+18015550104" });
  const eDev = await emp("Dev Patel", "HVAC Technician", "TECHNICIAN", "#d97706", { skills: ["Furnace", "Maintenance"], phone: "+18015550105" });
  const techs = [eJake, eSofia, eDev];

  await db.organization.update({
    where: { id: O },
    data: { settings: { ...DEFAULT_SETTINGS, emergency: { ...DEFAULT_SETTINGS.emergency, onCallEmployeeId: eJake.id } } as unknown as Prisma.InputJsonValue },
  });

  await db.serviceArea.createMany({ data: SERVICE_AREAS.map((a) => ({ ...a, organizationId: O })) });
  const services: Record<string, { id: string; name: string; durationMinutes: number }> = {};
  for (const s of SERVICES) {
    services[s.category] = await db.service.create({
      data: { organizationId: O, name: s.name, category: s.category, durationMinutes: s.durationMinutes, startingPriceCents: s.startingPriceCents, description: s.description, isEmergency: "isEmergency" in s ? s.isEmergency : false },
    });
  }
  await db.knowledgeDocument.createMany({ data: KNOWLEDGE.map((k, i) => ({ ...k, organizationId: O, createdAt: new Date(NOW.getTime() - (60 - i) * DAY) })) });

  // ── Customers ───────────────────────────────────────────────────────────
  type Cust = { id: string; firstName: string; lastName: string; phone: string; address: string; city: string; zip: string };
  const customers: Cust[] = [];
  const usedPhones = new Set(["+18015550142", "+18015550163", "+13855550177", "+18015550188", "+18015550198"]);
  const mkCustomer = async (c: { firstName: string; lastName: string; phone: string; address: string; zip: string; plan?: boolean; tags?: string[]; notes?: string; createdDaysAgo?: number; email?: string }) => {
    const area = SERVICE_AREAS.find((a) => a.zip === c.zip)!;
    usedPhones.add(c.phone);
    const row = await db.customer.create({
      data: {
        organizationId: O,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email ?? `${c.firstName.toLowerCase()}.${c.lastName.toLowerCase()}@example.com`,
        address: c.address,
        city: area.city,
        zip: c.zip,
        hasMaintenancePlan: c.plan ?? false,
        tags: c.tags ?? [],
        notes: c.notes ?? null,
        smsConsentAt: new Date(NOW.getTime() - (c.createdDaysAgo ?? 40) * DAY),
        createdAt: new Date(NOW.getTime() - (c.createdDaysAgo ?? 40) * DAY),
      },
    });
    const cust = { id: row.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, address: c.address, city: area.city, zip: c.zip };
    customers.push(cust);
    return cust;
  };

  // Hero customers referenced by simulator scenarios and demo flows
  const linda = await mkCustomer({ firstName: "Linda", lastName: "Morales", phone: "+18015550117", address: "1420 E Browning Ave", zip: "84105", plan: true, tags: ["comfort-club", "repeat"], notes: "Comfort Club member since 2023. Prefers morning visits.", createdDaysAgo: 400 });
  const derek = await mkCustomer({ firstName: "Derek", lastName: "Hansen", phone: "+18015550124", address: "8842 S Tamarack Dr", zip: "84093", tags: ["install-prospect"], createdDaysAgo: 12 });
  const gary = await mkCustomer({ firstName: "Gary", lastName: "Whitaker", phone: "+18015550131", address: "2715 E Bengal Blvd", zip: "84121", createdDaysAgo: 20 });
  const maria = await mkCustomer({ firstName: "Maria", lastName: "Castillo", phone: "+18015550135", address: "455 N 400 E", zip: "84010", createdDaysAgo: 30 });
  const ben = await mkCustomer({ firstName: "Benjamin", lastName: "Okafor", phone: "+13855550139", address: "1190 W Crestwood Rd", zip: "84041", createdDaysAgo: 25 });
  const priyaK = await mkCustomer({ firstName: "Karen", lastName: "Sorensen", phone: "+18015550146", address: "3321 S 2300 E", zip: "84109", createdDaysAgo: 18 });
  const steve = await mkCustomer({ firstName: "Steve", lastName: "Rasmussen", phone: "+18015550151", address: "620 E 800 N", zip: "84057", createdDaysAgo: 16 });
  const tanya = await mkCustomer({ firstName: "Tanya", lastName: "Brooks", phone: "+18015550155", address: "10442 S Redwood Rd", zip: "84095", createdDaysAgo: 9 });
  const aaron = await mkCustomer({ firstName: "Aaron", lastName: "Pratt", phone: "+18015550158", address: "77 W Center St", zip: "84003", createdDaysAgo: 22 });
  const nora = await mkCustomer({ firstName: "Nora", lastName: "Fifita", phone: "+13855550161", address: "5480 W 10400 S", zip: "84096", createdDaysAgo: 34 });
  const will = await mkCustomer({ firstName: "Will", lastName: "Bingham", phone: "+18015550166", address: "1834 E Kensington Ave", zip: "84108", createdDaysAgo: 28 });
  const holly = await mkCustomer({ firstName: "Holly", lastName: "Madsen", phone: "+18015550169", address: "910 S Orchard Dr", zip: "84011", createdDaysAgo: 14 });

  let phoneSeq = 200;
  const nextPhone = () => {
    let p: string;
    do {
      const area = rand() < 0.75 ? "801" : "385";
      p = `+1${area}555${String(phoneSeq++ % 10000).padStart(4, "0")}`;
    } while (usedPhones.has(p));
    return p;
  };
  const inAreaZips = SERVICE_AREAS.map((a) => a.zip);
  for (let i = 0; i < 110; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 7 + Math.floor(i / FIRST_NAMES.length)) % LAST_NAMES.length];
    await mkCustomer({
      firstName: first,
      lastName: last,
      phone: nextPhone(),
      address: `${int(100, 9800)} ${pick(STREETS)}`,
      zip: pick(inAreaZips),
      plan: rand() < 0.25,
      tags: rand() < 0.25 ? ["comfort-club"] : [],
      createdDaysAgo: int(3, 200),
    });
  }
  const pool = customers.slice(12);

  // ── Leads ───────────────────────────────────────────────────────────────
  type LeadRow = { id: string; customer: Cust; status: LeadStatus; source: LeadSource; urgency: Urgency; service: string; createdAt: Date };
  const leads: LeadRow[] = [];
  const serviceLabel: Record<string, string> = { ac_repair: "AC Repair", ac_install: "AC Installation", furnace_repair: "Furnace Repair", furnace_install: "Furnace Installation", maintenance: "Maintenance Plan Tune-Up", iaq: "Indoor Air Quality", general: "HVAC Diagnostic" };
  const typical: Record<string, number> = { ac_repair: 48_500, furnace_repair: 42_000, ac_install: 890_000, furnace_install: 640_000, maintenance: 14_900, iaq: 120_000, general: 35_000 };
  const DESCRIPTIONS: Record<string, string[]> = {
    ac_repair: ["AC running but blowing warm air", "Outdoor unit making a buzzing sound", "AC won't turn on after storm", "Ice forming on the refrigerant line"],
    furnace_repair: ["Furnace short cycling", "Loud bang when furnace starts", "Pilot light keeps going out", "Burning smell on first startup of the season"],
    ac_install: ["15-year-old AC, wants replacement options", "Adding central air to older home", "Interested in heat pump replacement"],
    furnace_install: ["Furnace is 22 years old, wants high-efficiency quote", "Replacing furnace before winter"],
    maintenance: ["Fall furnace tune-up", "Spring AC tune-up", "Comfort Club seasonal maintenance"],
    iaq: ["Allergies — interested in whole-home filtration", "Dry air in winter, wants a humidifier"],
    general: ["Thermostat not responding", "Uneven temperatures upstairs"],
  };

  const mkLead = async (l: { customer: Cust; status: LeadStatus; source: LeadSource; urgency?: Urgency; service: string; daysAgo: number; hour?: number; assigned?: string | null; lostReason?: string; needsHuman?: boolean; value?: number; responseSec?: number | null; description?: string }) => {
    const createdAt = new Date(at(-l.daysAgo, l.hour ?? int(8, 19), int(0, 59)).getTime());
    const responded = l.responseSec === null ? null : new Date(createdAt.getTime() + (l.responseSec ?? int(4, 40)) * 1000);
    const row = await db.lead.create({
      data: {
        organizationId: O,
        customerId: l.customer.id,
        status: l.status,
        source: l.source,
        urgency: l.urgency ?? "NORMAL",
        serviceId: services[l.service].id,
        requestedService: serviceLabel[l.service],
        description: l.description ?? pick(DESCRIPTIONS[l.service]),
        estimatedValueCents: l.value ?? typical[l.service],
        assignedEmployeeId: l.assigned === undefined ? pick([eMarcus.id, eMarcus.id, eOlivia.id]) : l.assigned,
        lostReason: l.status === "LOST" ? (l.lostReason ?? "Went with another company") : null,
        needsHumanFollowUp: l.needsHuman ?? false,
        firstResponseAt: l.status === "NEW" ? null : responded,
        wonAt: l.status === "WON" ? new Date(createdAt.getTime() + int(1, 5) * DAY) : null,
        lostAt: l.status === "LOST" ? new Date(createdAt.getTime() + int(1, 6) * DAY) : null,
        createdAt,
      },
    });
    const lead = { id: row.id, customer: l.customer, status: l.status, source: l.source, urgency: l.urgency ?? "NORMAL", service: l.service, createdAt };
    leads.push(lead);
    await db.leadEvent.create({ data: { organizationId: O, leadId: row.id, customerId: l.customer.id, type: "lead_created", title: "Lead created", detail: `${serviceLabel[l.service]} · via ${l.source.replace(/_/g, " ").toLowerCase()}`, actor: l.source.includes("CALL") || l.source === "PHONE" ? "AI" : "SYSTEM", createdAt } });
    if (responded && l.status !== "NEW")
      await db.leadEvent.create({ data: { organizationId: O, leadId: row.id, customerId: l.customer.id, type: "lead_contacted", title: l.source === "WEB_FORM" ? "Instant lead response sent" : "Caller answered by AI", detail: `First response in ${Math.round((responded.getTime() - createdAt.getTime()) / 1000)}s`, actor: "AI", createdAt: responded } });
    return lead;
  };

  // ── Calls with transcripts ──────────────────────────────────────────────
  const transcriptFor = (kind: string, c: Cust, svc: string, extra: { window?: string; tech?: string; temp?: number } = {}): [string, string][] => {
    const greet: [string, string] = ["AI", "Thanks for calling Summit Peak HVAC. This call may be recorded and transcribed for quality and scheduling. How can I help you today?"];
    const desc = pick(DESCRIPTIONS[svc] ?? DESCRIPTIONS.general);
    switch (kind) {
      case "emergency":
        return [
          ["AI", "Thanks for calling Summit Peak HVAC. This call may be recorded and transcribed for quality and scheduling. Our office is closed right now, but I can help — including emergency service. What's going on?"],
          ["CALLER", `Our ${svc.startsWith("furnace") ? "furnace quit and it's " + (extra.temp ?? 52) + " degrees in the house" : "AC died and it's " + (extra.temp ?? 91) + " degrees inside"}. My mom lives with us and she's 84.`],
          ["AI", `I'm sorry you're dealing with that — with it ${extra.temp ?? 91} degrees inside, I'm treating this as an emergency and prioritizing our on-call technician, Jake. Can I get your first and last name?`],
          ["CALLER", `${c.firstName} ${c.lastName}.`],
          ["AI", `Thanks, ${c.firstName}. Is ${fmtPhone(c.phone)} the best number to reach you?`],
          ["CALLER", "Yes."],
          ["AI", "What's the service address, including the ZIP code?"],
          ["CALLER", `${c.address}, ${c.city} ${c.zip}.`],
          ["AI", `Thanks — ${c.city} is in our service area. Jake, our on-call technician, can be there ${extra.window ?? "tonight"}. After-hours emergency visits include a $149 dispatch fee in addition to the diagnostic. Does that work?`],
          ["CALLER", "Yes, please send him."],
          ["AI", `You're all set with ${extra.tech ?? "Jake"}. He'll call about 30 minutes before arriving. I've texted a confirmation to ${fmtPhone(c.phone)}.`],
        ];
      case "booked":
        return [
          greet,
          ["CALLER", `Hi, ${desc.toLowerCase()}.`],
          ["AI", `Got it — that sounds like a ${serviceLabel[svc].toLowerCase()} visit. I can get that scheduled for you. Can I get your first and last name?`],
          ["CALLER", `${c.firstName} ${c.lastName}.`],
          ["AI", `Thanks, ${c.firstName}. Is ${fmtPhone(c.phone)} the best number to reach you?`],
          ["CALLER", "Yep."],
          ["AI", "What's the service address, including the ZIP code?"],
          ["CALLER", `${c.address}, ${c.city} ${c.zip}`],
          ["AI", `Thanks, ${c.firstName} — ${c.city} is in our service area. Do you have a preferred day or time of day?`],
          ["CALLER", pick(["Mornings are best.", "Anytime after noon.", "As soon as possible.", "Thursday if you have it."])],
          ["AI", `I have ${extra.window ?? "an opening"} with ${extra.tech ?? "one of our technicians"}. Does that work?`],
          ["CALLER", "Perfect."],
          ["AI", `You're all set. I've texted a confirmation to ${fmtPhone(c.phone)}. Is there anything else I can help with?`],
          ["CALLER", "No, thanks!"],
        ];
      case "info":
        return [
          greet,
          ["CALLER", pick(["How much do you charge for a service call?", "Do you guys work on Lennox systems?", "What are your hours on Friday?", "Do you offer financing on new furnaces?"])],
          ["AI", pick([
            "Our standard diagnostic visit is $89, and it is applied toward the repair if you approve the work during the same visit.",
            "We service and repair all major residential HVAC brands, including Carrier, Trane, Lennox, Goodman, Rheem, and York.",
            "Office hours are Monday through Friday, 8:00 AM to 6:00 PM Mountain Time. Emergency service is available 24/7.",
            "Financing is available for new system installations through our third-party lending partner, subject to credit approval.",
          ])],
          ["CALLER", "Great, that's all I needed. Thanks."],
          ["AI", "Thanks for calling Summit Peak HVAC. Have a great day!"],
        ];
      case "transfer":
        return [greet, ["CALLER", "I have a question about my bill from last week. Can I talk to someone?"], ["AI", "Of course. I'm connecting you with Marcus now — I'll pass along what you've shared so you don't have to repeat yourself."]];
      case "lead":
        return [
          greet,
          ["CALLER", `I'm thinking about replacing my ${svc === "furnace_install" ? "furnace" : "air conditioner"}. Can someone come give me a quote?`],
          ["AI", "Absolutely — in-home estimates for new systems are free. Can I get your first and last name?"],
          ["CALLER", `${c.firstName} ${c.lastName}.`],
          ["AI", `Thanks, ${c.firstName}. Our comfort advisor will call you today to set up a time. Is ${fmtPhone(c.phone)} the best number?`],
          ["CALLER", "Yes, thank you."],
        ];
      case "out_of_area":
        return [
          greet,
          ["CALLER", "My furnace won't turn on. I'm up in Ogden."],
          ["AI", "I'm sorry to hear that. Unfortunately Ogden is outside our service area — we cover Salt Lake, Davis, and Utah counties. I'd recommend reaching out to a licensed HVAC contractor closer to you."],
          ["CALLER", "Oh okay, thanks anyway."],
        ];
      default:
        return [];
    }
  };

  let callCount = 0;
  const mkCall = async (o: {
    kind: "emergency" | "booked" | "info" | "transfer" | "lead" | "out_of_area" | "missed" | "voicemail";
    startedAt: Date;
    customer: Cust | null;
    fromNumber?: string;
    lead?: LeadRow | null;
    svc?: string;
    window?: string;
    tech?: string;
    temp?: number;
    textBack?: boolean;
  }) => {
    const c = o.customer;
    const svc = o.svc ?? "ac_repair";
    const turns = c || o.kind === "info" || o.kind === "out_of_area" || o.kind === "transfer" ? transcriptFor(o.kind, c ?? { firstName: "", lastName: "", phone: o.fromNumber ?? "", address: "", city: "", zip: "", id: "" }, svc, o) : [];
    const missed = o.kind === "missed" || o.kind === "voicemail";
    const status: CallStatus = missed ? (o.kind === "voicemail" ? "VOICEMAIL" : "MISSED") : o.kind === "transfer" ? "TRANSFERRED" : "COMPLETED";
    const outcome: CallOutcome | null = missed
      ? o.textBack
        ? "MISSED_RECOVERED"
        : null
      : ({ emergency: "BOOKED", booked: "BOOKED", info: "INFO_PROVIDED", transfer: "TRANSFERRED", lead: "LEAD_CAPTURED", out_of_area: "OUT_OF_AREA" } as Record<string, CallOutcome>)[o.kind] ?? null;
    const words = turns.reduce((n, t) => n + t[1].split(/\s+/).length, 0);
    const duration = missed ? (o.kind === "voicemail" ? int(20, 45) : 0) : Math.round(words / 2.6 + turns.length * 2);
    const p = zonedParts(o.startedAt, TZ);
    const afterHours = p.weekday === 0 || p.weekday === 6 || p.hour < 8 || p.hour >= 18;
    const urgency: Urgency = o.kind === "emergency" ? "EMERGENCY" : o.lead?.urgency ?? "NORMAL";
    const summary =
      turns.length && outcome
        ? rulesSummary({
            transcript: turns.map(([speaker, text]) => ({ speaker, text })),
            facts: {
              name: c ? `${c.firstName} ${c.lastName}` : null,
              phone: c ? fmtPhone(c.phone) : null,
              address: c && c.address ? `${c.address}, ${c.city} ${c.zip}` : null,
              service: serviceLabel[svc] ?? null,
              urgency,
              urgencyReasons: o.kind === "emergency" ? [`No ${svc.startsWith("furnace") ? "heat" : "cooling"} with indoor temperature of ${o.temp ?? 91}°F`, "System down with a vulnerable occupant in the home"] : [],
              outcome,
              appointmentLabel: o.window ?? null,
              transferredTo: o.kind === "transfer" ? "Marcus" : null,
              inServiceArea: o.kind === "out_of_area" ? false : c ? true : null,
            },
          })
        : null;
    // Human staff answered some business-hours calls before the AI was needed.
    const answeredBy = missed ? "NONE" : afterHours || rand() < 0.7 ? "AI" : "STAFF";
    const call = await db.call.create({
      data: {
        organizationId: O,
        customerId: c?.id ?? null,
        leadId: o.lead?.id ?? null,
        status,
        outcome,
        fromNumber: c?.phone ?? o.fromNumber ?? nextPhone(),
        toNumber: "+18015550198",
        callerName: c ? `${c.firstName} ${c.lastName}` : null,
        startedAt: o.startedAt,
        endedAt: new Date(o.startedAt.getTime() + duration * 1000),
        durationSeconds: duration,
        isAfterHours: afterHours,
        isEmergency: o.kind === "emergency",
        urgency,
        answeredBy,
        transferredTo: o.kind === "transfer" ? "Marcus · (801) 555-0198" : null,
        recordingStatus: missed ? "NOT_RECORDED" : "RECORDED",
        summary: (summary ?? undefined) as Prisma.InputJsonValue | undefined,
        textBackSentAt: o.textBack ? new Date(o.startedAt.getTime() + 45_000) : null,
        createdAt: o.startedAt,
      },
    });
    if (turns.length)
      await db.callTranscript.createMany({ data: turns.map(([speaker, text], i) => ({ organizationId: O, callId: call.id, seq: i, speaker: speaker as "AI" | "CALLER", text, createdAt: new Date(o.startedAt.getTime() + i * 9000) })) });
    if (duration) await db.usageRecord.create({ data: { organizationId: O, type: "VOICE_MINUTES", quantity: Math.max(1, Math.ceil(duration / 60)), occurredAt: o.startedAt, referenceId: call.id } });
    if (answeredBy === "AI" && turns.length) await db.usageRecord.create({ data: { organizationId: O, type: "AI_REQUESTS", quantity: Math.ceil(turns.length / 2), occurredAt: o.startedAt, referenceId: call.id } });
    callCount++;
    return call;
  };

  // ── Appointments ────────────────────────────────────────────────────────
  const techBusy = new Map<string, { s: number; e: number }[]>();
  const free = (techId: string, s: Date, e: Date) => !(techBusy.get(techId) ?? []).some((b) => s.getTime() < b.e + 30 * MINUTE && b.s < e.getTime() + 30 * MINUTE);
  const reserve = (techId: string, s: Date, e: Date) => techBusy.set(techId, [...(techBusy.get(techId) ?? []), { s: s.getTime(), e: e.getTime() }]);
  const mkAppt = async (o: { customer: Cust; lead?: LeadRow | null; svc: string; start: Date; tech: { id: string; name: string }; status: AppointmentStatus; emergency?: boolean; bookedBy?: "AI" | "STAFF"; callId?: string | null; value?: number; reminder?: boolean }) => {
    const dur = o.emergency ? 120 : services[o.svc].durationMinutes;
    const end = new Date(o.start.getTime() + dur * MINUTE);
    reserve(o.tech.id, o.start, end);
    return db.appointment.create({
      data: {
        organizationId: O,
        customerId: o.customer.id,
        leadId: o.lead?.id ?? null,
        serviceId: services[o.emergency ? "emergency" : o.svc].id,
        technicianId: o.tech.id,
        callId: o.callId ?? null,
        title: `${serviceLabel[o.svc] ?? "Emergency HVAC Service"}${o.emergency ? " — Emergency" : ""}`,
        startAt: o.start,
        endAt: end,
        bufferMinutes: 30,
        status: o.status,
        isEmergency: o.emergency ?? false,
        bookedBy: o.bookedBy ?? "AI",
        address: `${o.customer.address}, ${o.customer.city} ${o.customer.zip}`,
        estimatedValueCents: o.value ?? typical[o.svc],
        confirmationSentAt: new Date(o.start.getTime() - 2 * DAY),
        reminderSentAt: o.reminder === false ? null : o.start.getTime() < NOW.getTime() ? new Date(o.start.getTime() - DAY) : null,
        completedAt: o.status === "COMPLETED" ? end : null,
        cancelledAt: o.status === "CANCELLED" ? new Date(o.start.getTime() - DAY) : null,
        cancelReason: o.status === "CANCELLED" ? "Customer resolved issue (breaker reset)" : null,
        createdAt: new Date(Math.min(o.start.getTime() - int(1, 4) * DAY, NOW.getTime() - int(1, 48) * HOUR)),
      },
    });
  };
  const slotTimes = [[8, 0], [10, 30], [13, 0], [15, 30]] as const;
  const findSlot = (day: number, preferTech?: { id: string; name: string }) => {
    for (const [h, m] of [...slotTimes].sort(() => rand() - 0.5)) {
      const s = at(day, h, m);
      for (const t of preferTech ? [preferTech, ...techs] : [...techs].sort(() => rand() - 0.5)) {
        if (free(t.id, s, new Date(s.getTime() + 120 * MINUTE))) return { start: s, tech: t };
      }
    }
    return null;
  };

  // Historical AI-handled pipeline over the last 30 days
  const sources: LeadSource[] = ["PHONE", "PHONE", "PHONE", "AFTER_HOURS_CALL", "WEB_FORM", "WEB_FORM", "GOOGLE_LSA", "REFERRAL", "REPEAT_CUSTOMER", "MISSED_CALL", "SMS"];
  const repairSvcs = ["ac_repair", "ac_repair", "furnace_repair", "furnace_repair", "maintenance", "iaq", "general"];
  let poolIdx = 0;
  const nextCust = () => pool[poolIdx++ % pool.length];

  /** First weekday slot on or after `fromDay` (relative days), searching forward. */
  const slotOnOrAfter = (fromDay: number, maxDay: number) => {
    for (let d = fromDay; d <= maxDay; d++) {
      if (!isWeekday(d)) continue;
      const s = findSlot(d);
      if (s) return s;
    }
    return null;
  };

  const slotOnOrAfterFor = (fromDay: number, maxDay: number, tech: { id: string; name: string }) => {
    for (let d = fromDay; d <= maxDay; d++) {
      if (!isWeekday(d)) continue;
      const s = findSlot(d, tech);
      if (s) return s;
    }
    return null;
  };

  for (let d = 59; d >= 1; d--) {
    const n = isWeekday(-d) ? int(3, 6) : int(1, 2);
    for (let i = 0; i < n; i++) {
      const cust = d <= 30 || rand() < 0.5 ? nextCust() : pick(pool);
      const svc = pick(repairSvcs);
      const source = !isWeekday(-d) && rand() < 0.6 ? "AFTER_HOURS_CALL" : pick(sources);
      const isCall = ["PHONE", "AFTER_HOURS_CALL", "REPEAT_CUSTOMER", "MISSED_CALL"].includes(source);
      const hour = source === "AFTER_HOURS_CALL" ? pick([19, 20, 21, 6]) : int(8, 17);
      const roll = rand();
      const status: LeadStatus = d > 3 ? (roll < 0.62 ? "WON" : roll < 0.8 ? "LOST" : roll < 0.9 ? "BOOKED" : "CONTACTED") : roll < 0.5 ? "BOOKED" : roll < 0.75 ? "QUALIFIED" : "CONTACTED";
      const lead = await mkLead({ customer: cust, status, source, service: svc, daysAgo: d, hour, urgency: rand() < 0.2 ? "HIGH" : svc === "maintenance" ? "LOW" : "NORMAL", responseSec: source === "WEB_FORM" ? int(25, 90) : int(2, 12) });
      const wantsAppt = status === "WON" || status === "BOOKED";
      const slot = wantsAppt ? slotOnOrAfter(-d + 1, status === "BOOKED" ? 6 : -1) : null;
      const window = slot ? formatWindow(slot.start, new Date(slot.start.getTime() + 90 * MINUTE), at(-d, hour), TZ) : undefined;
      let callId: string | null = null;
      if (isCall) {
        const call = await mkCall({ kind: wantsAppt ? "booked" : "lead", startedAt: lead.createdAt, customer: cust, lead, svc, window, tech: slot?.tech.name.split(" ")[0] });
        callId = call.id;
      }
      if (slot) {
        const past = slot.start.getTime() < NOW.getTime();
        await mkAppt({ customer: cust, lead, svc, start: slot.start, tech: slot.tech, status: past ? (rand() < 0.94 ? "COMPLETED" : "NO_SHOW") : "CONFIRMED", callId, bookedBy: isCall ? "AI" : "STAFF", value: status === "WON" ? typical[svc] + int(-8000, 12000) : undefined });
        await db.appointment.updateMany({ where: { callId: callId ?? "__none__" }, data: { createdAt: lead.createdAt } });
      }
    }
  }

  // Current open pipeline (recent, unworked)
  const openSpecs: [LeadStatus, LeadSource, string, Urgency, number][] = [
    ["NEW", "WEB_FORM", "ac_install", "LOW", 0],
    ["NEW", "WEB_FORM", "iaq", "NORMAL", 0],
    ["NEW", "GOOGLE_LSA", "furnace_repair", "HIGH", 0],
    ["NEW", "REFERRAL", "furnace_install", "LOW", 1],
    ["NEW", "WEB_FORM", "maintenance", "LOW", 1],
    ["CONTACTED", "SMS", "ac_repair", "NORMAL", 1],
    ["QUALIFIED", "PHONE", "ac_install", "NORMAL", 2],
    ["QUALIFIED", "WEB_FORM", "furnace_install", "NORMAL", 2],
  ];
  for (const [status, source, svc, urgency, daysAgo] of openSpecs) {
    const lead = await mkLead({ customer: nextCust(), status, source, service: svc, urgency, daysAgo, responseSec: status === "NEW" ? null : undefined });
    if (daysAgo === 0) {
      // Keep "today" leads in the recent past, never the future.
      const createdAt = new Date(NOW.getTime() - int(8, 150) * MINUTE);
      await db.lead.update({ where: { id: lead.id }, data: { createdAt } });
      await db.leadEvent.updateMany({ where: { leadId: lead.id }, data: { createdAt } });
    }
  }

  // Missed calls: one recovered by text-back, one still open (so "Run now" has work)
  const missedRecoveredCust = pool[3];
  const mcLead = await mkLead({ customer: missedRecoveredCust, status: "BOOKED", source: "MISSED_CALL", service: "ac_repair", urgency: "HIGH", daysAgo: 2, hour: 12 });
  await mkCall({ kind: "missed", startedAt: at(-2, 12, 14), customer: missedRecoveredCust, lead: mcLead, textBack: true });
  const mcSlot = slotOnOrAfter(1, 5);
  if (mcSlot) await mkAppt({ customer: missedRecoveredCust, lead: mcLead, svc: "ac_repair", start: mcSlot.start, tech: mcSlot.tech, status: "CONFIRMED", bookedBy: "AI", value: 48_500 });
  await mkCall({ kind: "voicemail", startedAt: new Date(NOW.getTime() - 3 * HOUR), customer: null, fromNumber: "+13855550193" });

  // Info / transfer / out-of-area calls (no lead)
  for (let d = 28; d >= 1; d -= 3) {
    await mkCall({ kind: "info", startedAt: at(-d, int(8, 17), int(0, 59)), customer: null, fromNumber: nextPhone() });
    if (d % 2 === 0) await mkCall({ kind: "transfer", startedAt: at(-d, int(9, 16), int(0, 59)), customer: pick(pool), svc: "general" });
  }
  await mkCall({ kind: "out_of_area", startedAt: at(-6, 19, 42), customer: null, fromNumber: "+18015550211" });
  await mkCall({ kind: "out_of_area", startedAt: at(-17, 10, 5), customer: null, fromNumber: "+13855550212" });

  // ── Hero stories ────────────────────────────────────────────────────────
  // 1) After-hours AC emergency last night — booked by AI, completed
  const emLead = await mkLead({ customer: will, status: "WON", source: "AFTER_HOURS_CALL", service: "ac_repair", urgency: "EMERGENCY", daysAgo: 1, hour: 21, value: 68_500, description: "AC failed, 91°F inside, elderly parent in home" });
  const emStart = at(-1, 22, 30);
  const emCall = await mkCall({ kind: "emergency", startedAt: at(-1, 21, 38), customer: will, lead: emLead, svc: "ac_repair", window: "tonight 10:30 PM – 12:30 AM", tech: "Jake", temp: 91 });
  await mkAppt({ customer: will, lead: emLead, svc: "ac_repair", start: emStart, tech: eJake, status: "COMPLETED", emergency: true, callId: emCall.id, value: 68_500 });
  await db.leadEvent.createMany({
    data: [
      { organizationId: O, leadId: emLead.id, customerId: will.id, type: "emergency", title: "Emergency detected", detail: "No cooling with indoor temperature of 91°F; System down with a vulnerable occupant in the home", actor: "AI", createdAt: at(-1, 21, 39) },
      { organizationId: O, leadId: emLead.id, customerId: will.id, type: "service_area_ok", title: "Service area confirmed", detail: "ZIP 84108 is in Salt Lake County", actor: "AI", createdAt: at(-1, 21, 40) },
      { organizationId: O, leadId: emLead.id, customerId: will.id, type: "appointment_booked", title: "Emergency appointment booked", detail: "Jake Morrison · 10:30 PM", actor: "AI", createdAt: at(-1, 21, 41) },
      { organizationId: O, leadId: emLead.id, customerId: will.id, type: "sms_confirmation", title: "SMS confirmation sent", detail: "Confirmation with technician name and arrival window", actor: "AI", createdAt: at(-1, 21, 41) },
      { organizationId: O, leadId: emLead.id, customerId: will.id, type: "stage_changed", title: "Moved to won", detail: "Capacitor + contactor replaced — $685", actor: "STAFF", createdAt: atPast(0, 8, 5) },
    ],
  });
  // 2) Second emergency (furnace, 8 days ago)
  const em2Lead = await mkLead({ customer: nora, status: "WON", source: "AFTER_HOURS_CALL", service: "furnace_repair", urgency: "EMERGENCY", daysAgo: 8, hour: 5, value: 52_000, description: "No heat, 52°F inside" });
  const em2Call = await mkCall({ kind: "emergency", startedAt: at(-8, 4, 50), customer: nora, lead: em2Lead, svc: "furnace_repair", window: "today 5:30 AM – 7:30 AM", tech: "Jake", temp: 52 });
  await mkAppt({ customer: nora, lead: em2Lead, svc: "furnace_repair", start: at(-8, 5, 30), tech: eJake, status: "COMPLETED", emergency: true, callId: em2Call.id, value: 52_000 });

  // 3) Linda — Comfort Club customer with an upcoming tune-up
  const lindaLead = await mkLead({ customer: linda, status: "BOOKED", source: "REPEAT_CUSTOMER", service: "maintenance", urgency: "LOW", daysAgo: 3, hour: 9 });
  const lindaSlot = slotOnOrAfterFor(2, 8, eDev);
  if (lindaSlot) await mkAppt({ customer: linda, lead: lindaLead, svc: "maintenance", start: lindaSlot.start, tech: lindaSlot.tech, status: "CONFIRMED", bookedBy: "AI", value: 14_900 });

  // ── Estimates ───────────────────────────────────────────────────────────
  const mkEstimate = async (o: {
    n: number;
    customer: Cust;
    svc: string;
    title: string;
    items: [string, number, number][];
    status: "DRAFT" | "SENT" | "VIEWED" | "ACCEPTED" | "DECLINED" | "EXPIRED";
    sentDaysAgo?: number;
    stageSent?: number;
    closedDaysAgo?: number;
    recovered?: boolean;
    paused?: boolean;
    stopReason?: string;
    assigned?: string;
    leadStatus?: LeadStatus;
  }) => {
    const subtotal = o.items.reduce((s, [, q, p]) => s + q * p, 0);
    const sentAt = o.sentDaysAgo !== undefined ? at(-o.sentDaysAgo, 15, 20) : null;
    const lead = await mkLead({ customer: o.customer, status: o.leadStatus ?? (o.status === "ACCEPTED" ? "WON" : o.status === "DECLINED" || o.status === "EXPIRED" ? "LOST" : o.status === "DRAFT" ? "QUALIFIED" : "ESTIMATE_SENT"), source: pick(["PHONE", "WEB_FORM", "AFTER_HOURS_CALL", "REFERRAL"]), service: o.svc, daysAgo: (o.sentDaysAgo ?? 1) + 2, value: subtotal, lostReason: o.status === "DECLINED" ? "Chose a lower bid" : o.status === "EXPIRED" ? "No response — estimate expired" : undefined, assigned: o.assigned ?? eOlivia.id });
    const est = await db.estimate.create({
      data: {
        organizationId: O,
        number: `EST-${o.n}`,
        customerId: o.customer.id,
        leadId: lead.id,
        serviceId: services[o.svc].id,
        assignedEmployeeId: o.assigned ?? eOlivia.id,
        title: o.title,
        status: o.status,
        subtotalCents: subtotal,
        taxCents: 0,
        totalCents: subtotal,
        sentAt,
        viewedAt: o.status === "VIEWED" && sentAt ? new Date(sentAt.getTime() + 20 * HOUR) : null,
        acceptedAt: o.status === "ACCEPTED" ? at(-(o.closedDaysAgo ?? 0), 11, 10) : null,
        declinedAt: o.status === "DECLINED" ? at(-(o.closedDaysAgo ?? 0), 16, 45) : null,
        expiresAt: sentAt ? new Date(sentAt.getTime() + 30 * DAY) : null,
        followupStage: o.stageSent ?? 0,
        automationPaused: o.paused ?? false,
        automationStopReason: o.stopReason ?? null,
        recoveredByAutomation: o.recovered ?? false,
        createdAt: sentAt ? new Date(sentAt.getTime() - 3 * HOUR) : new Date(NOW.getTime() - DAY),
        items: { create: o.items.map(([description, quantity, unitPriceCents], i) => ({ organizationId: O, description, quantity, unitPriceCents, sortOrder: i })) },
      },
    });
    if (sentAt) {
      const delays = [24, 72, 168];
      for (let s = 1; s <= 3; s++) {
        const scheduledFor = new Date(sentAt.getTime() + delays[s - 1] * HOUR);
        const sent = s <= (o.stageSent ?? 0);
        const closed = ["ACCEPTED", "DECLINED", "EXPIRED"].includes(o.status) || o.paused || o.stopReason;
        await db.followup.create({
          data: {
            organizationId: O,
            estimateId: est.id,
            customerId: o.customer.id,
            stage: s,
            scheduledFor,
            status: sent ? "SENT" : closed ? "CANCELLED" : "SCHEDULED",
            sentAt: sent ? scheduledFor : null,
            cancelledReason: !sent && closed ? (o.stopReason ?? (o.paused ? "Automation paused manually" : `Estimate ${o.status.toLowerCase()}`)) : null,
            createdAt: sentAt,
          },
        });
      }
      await db.leadEvent.create({ data: { organizationId: O, leadId: lead.id, customerId: o.customer.id, type: "estimate_sent", title: `Estimate EST-${o.n} sent`, detail: "Recovery follow-ups scheduled for day 1, 3 and 7", actor: "STAFF", createdAt: sentAt } });
    }
    return { est, lead, sentAt };
  };

  const eDerek = await mkEstimate({ n: 1001, customer: derek, svc: "ac_install", title: "3-ton 16 SEER2 AC replacement", items: [["Carrier 3-ton 16 SEER2 condenser", 1, 520_000], ["Matching evaporator coil", 1, 185_000], ["Line set, pad, disconnect & permit", 1, 95_000], ["Installation labor", 1, 90_000]], status: "SENT", sentDaysAgo: 2, stageSent: 1, assigned: eOlivia.id });
  const eMaria = await mkEstimate({ n: 1002, customer: maria, svc: "furnace_install", title: "96% AFUE furnace replacement", items: [["Lennox 96% AFUE 80k BTU furnace", 1, 420_000], ["Venting, gas line & permit", 1, 85_000], ["Installation labor", 1, 135_000]], status: "ACCEPTED", sentDaysAgo: 14, stageSent: 2, closedDaysAgo: 10, recovered: true });
  const eBen = await mkEstimate({ n: 1003, customer: ben, svc: "ac_install", title: "Heat pump + air handler system", items: [["Trane 3-ton variable-speed heat pump", 1, 780_000], ["Air handler with 10kW heat strip", 1, 310_000], ["Installation, permit & startup", 1, 155_000]], status: "ACCEPTED", sentDaysAgo: 11, stageSent: 3, closedDaysAgo: 4, recovered: true });
  await mkEstimate({ n: 1004, customer: holly, svc: "iaq", title: "Whole-home air filtration + UV", items: [["Aprilaire 2410 media filter cabinet", 1, 78_000], ["UV-C coil sterilization light", 1, 64_000], ["Installation", 1, 43_000]], status: "ACCEPTED", sentDaysAgo: 22, stageSent: 1, closedDaysAgo: 18, recovered: true });
  await mkEstimate({ n: 1005, customer: aaron, svc: "ac_repair", title: "Compressor contactor & capacitor replacement", items: [["Dual run capacitor", 1, 18_500], ["Contactor", 1, 14_000], ["Labor", 1, 21_500]], status: "ACCEPTED", sentDaysAgo: 6, stageSent: 0, closedDaysAgo: 6 });
  await mkEstimate({ n: 1006, customer: pool[5], svc: "furnace_install", title: "80% furnace replacement", items: [["Goodman 80% AFUE furnace", 1, 360_000], ["Installation & permit", 1, 360_000]], status: "DECLINED", sentDaysAgo: 19, stageSent: 2, closedDaysAgo: 15, stopReason: "Estimate declined" });
  await mkEstimate({ n: 1007, customer: pool[6], svc: "ac_install", title: "2.5-ton AC replacement", items: [["2.5-ton 15 SEER2 condenser & coil", 1, 610_000], ["Installation", 1, 120_000]], status: "EXPIRED", sentDaysAgo: 40, stageSent: 3, stopReason: "Estimate expired" });
  const ePending = await mkEstimate({ n: 1008, customer: steve, svc: "furnace_install", title: "Furnace + smart thermostat", items: [["Rheem 95% AFUE furnace", 1, 455_000], ["Ecobee smart thermostat", 1, 32_000], ["Installation & permit", 1, 128_000]], status: "SENT", sentDaysAgo: 8, stageSent: 3 });
  await mkEstimate({ n: 1009, customer: tanya, svc: "ac_repair", title: "Refrigerant leak repair & recharge", items: [["Leak search & evaporator coil repair", 1, 64_000], ["R-410A refrigerant (4 lb)", 4, 9_500], ["Labor", 1, 38_000]], status: "SENT", sentDaysAgo: 1, stageSent: 0, assigned: eMarcus.id });
  await mkEstimate({ n: 1010, customer: priyaK, svc: "iaq", title: "Whole-home humidifier", items: [["Aprilaire 700 fan-powered humidifier", 1, 118_000], ["Installation", 1, 42_000]], status: "VIEWED", sentDaysAgo: 4, stageSent: 2 });
  await mkEstimate({ n: 1011, customer: pool[8], svc: "ac_install", title: "Ductless mini-split — bonus room", items: [["Mitsubishi 18k BTU mini-split", 1, 420_000], ["Installation", 1, 160_000]], status: "DRAFT", assigned: eMarcus.id, leadStatus: "QUALIFIED" });
  const eOpt = await mkEstimate({ n: 1012, customer: pool[9], svc: "furnace_repair", title: "Heat exchanger inspection & inducer motor", items: [["Inducer motor assembly", 1, 46_000], ["Labor", 1, 28_000]], status: "SENT", sentDaysAgo: 5, stageSent: 1, stopReason: "Customer opted out of SMS (STOP)" });
  await db.customer.update({ where: { id: pool[9].id }, data: { smsOptedOut: true, smsOptedOutAt: at(-4, 10, 12) } });
  await mkEstimate({ n: 1013, customer: pool[10], svc: "ac_install", title: "AC replacement — customer traveling", items: [["3-ton 14.3 SEER2 AC & coil", 1, 540_000], ["Installation", 1, 110_000]], status: "SENT", sentDaysAgo: 3, stageSent: 1, paused: true, stopReason: "Automation paused manually" });
  await mkEstimate({ n: 1014, customer: pool[11], svc: "maintenance", title: "Comfort Club enrollment + first tune-up", items: [["Comfort Club annual plan", 1, 22_800]], status: "ACCEPTED", sentDaysAgo: 9, stageSent: 0, closedDaysAgo: 9 });

  // Recovered estimates become installs on the calendar
  const mariaSlot = slotOnOrAfterFor(-9, -6, eJake);
  if (mariaSlot) await mkAppt({ customer: maria, lead: eMaria.lead, svc: "furnace_install", start: mariaSlot.start, tech: mariaSlot.tech, status: "COMPLETED", bookedBy: "STAFF", value: eMaria.est.totalCents });
  const benSlot = slotOnOrAfterFor(2, 8, eJake);
  if (benSlot) await mkAppt({ customer: ben, lead: eBen.lead, svc: "ac_install", start: benSlot.start, tech: benSlot.tech, status: "CONFIRMED", bookedBy: "STAFF", value: eBen.est.totalCents });

  // ── Conversations & messages ────────────────────────────────────────────
  const convo = async (c: Cust, msgs: { dir: "IN" | "OUT"; sender?: "AI" | "STAFF" | "AUTOMATION" | "SYSTEM"; body: string; at: Date; status?: "SIMULATED" | "BLOCKED" | "DELIVERED"; key?: "ESTIMATE_RECOVERY" | "APPOINTMENT_REMINDERS" | "REVIEW_REQUESTS" | "MISSED_CALL_RECOVERY" | "NEW_LEAD_FOLLOWUP"; estimateId?: string }[], extra: { takeover?: string; unread?: number } = {}) => {
    const conv = await db.conversation.create({
      data: { organizationId: O, customerId: c.id, humanTakeover: Boolean(extra.takeover), takeoverReason: extra.takeover ?? null, unreadCount: extra.unread ?? 0, lastMessageAt: msgs.at(-1)!.at, createdAt: msgs[0].at },
    });
    for (const m of msgs) {
      const row = await db.message.create({
        data: {
          organizationId: O,
          conversationId: conv.id,
          customerId: c.id,
          direction: m.dir === "IN" ? "INBOUND" : "OUTBOUND",
          sender: m.dir === "IN" ? "CUSTOMER" : (m.sender ?? "AI"),
          body: m.body,
          status: m.dir === "IN" ? "RECEIVED" : (m.status ?? "SIMULATED"),
          isSimulated: m.dir === "OUT" && (m.status ?? "SIMULATED") === "SIMULATED",
          errorReason: m.status === "BLOCKED" ? "Recipient opted out (STOP) — not sent" : null,
          automationKey: m.key ?? null,
          estimateId: m.estimateId ?? null,
          createdAt: m.at,
        },
      });
      if (m.dir === "OUT" && m.status !== "BLOCKED") await db.usageRecord.create({ data: { organizationId: O, type: "SMS_SEGMENTS", quantity: Math.ceil(m.body.length / 153), occurredAt: m.at, referenceId: row.id } });
      if (m.key === "ESTIMATE_RECOVERY" && m.estimateId) {
        await db.followup.updateMany({ where: { estimateId: m.estimateId, status: "SENT", messageId: null, sentAt: { lte: new Date(m.at.getTime() + HOUR), gte: new Date(m.at.getTime() - HOUR) } }, data: { messageId: row.id } });
      }
    }
    return conv;
  };
  const fu = (i: number, c: Cust, n: string, svc: string, amt: string) =>
    DEFAULT_ESTIMATE_TEMPLATES[i].replace("{{firstName}}", c.firstName).replace("{{business}}", "Summit Peak HVAC").replace("{{estimateNumber}}", n).replace("{{service}}", svc).replace("{{amount}}", amt).replace("{{phone}}", "(801) 555-0198");

  await convo(will, [
    { dir: "OUT", body: "Summit Peak HVAC: You're confirmed for tonight, 10:30 PM – 12:30 AM — AC Repair — Emergency at 1834 E Kensington Ave, Salt Lake City 84108. Technician: Jake. They'll call ~30 min before arrival. Reply STOP to opt out.", at: at(-1, 21, 41) },
    { dir: "IN", body: "Thank you so much!! My mom is really struggling with the heat.", at: at(-1, 21, 44) },
    { dir: "OUT", sender: "STAFF", body: "Jake is on his way — about 25 minutes out. Try to keep her in the coolest room with a fan. — Summit Peak", at: at(-1, 22, 2) },
  ]);
  await convo(derek, [
    { dir: "OUT", sender: "AUTOMATION", key: "ESTIMATE_RECOVERY", estimateId: eDerek.est.id, body: fu(0, derek, "EST-1001", "AC Installation", "$8,900"), at: new Date(eDerek.sentAt!.getTime() + 24 * HOUR) },
  ]);
  await convo(maria, [
    { dir: "OUT", sender: "AUTOMATION", key: "ESTIMATE_RECOVERY", estimateId: eMaria.est.id, body: fu(0, maria, "EST-1002", "Furnace Installation", "$6,400"), at: new Date(eMaria.sentAt!.getTime() + 24 * HOUR) },
    { dir: "OUT", sender: "AUTOMATION", key: "ESTIMATE_RECOVERY", estimateId: eMaria.est.id, body: fu(1, maria, "EST-1002", "Furnace Installation", "$6,400"), at: new Date(eMaria.sentAt!.getTime() + 72 * HOUR) },
    { dir: "IN", body: "Yes — financing would help. Let's do it.", at: at(-10, 11, 4) },
    { dir: "OUT", body: "Wonderful, Maria! Our dispatcher will reach out today to schedule your installation.", at: at(-10, 11, 4) },
  ]);
  await convo(ben, [
    { dir: "OUT", sender: "AUTOMATION", key: "ESTIMATE_RECOVERY", estimateId: eBen.est.id, body: fu(0, ben, "EST-1003", "AC Installation", "$12,450"), at: new Date(eBen.sentAt!.getTime() + 24 * HOUR) },
    { dir: "OUT", sender: "AUTOMATION", key: "ESTIMATE_RECOVERY", estimateId: eBen.est.id, body: fu(1, ben, "EST-1003", "AC Installation", "$12,450"), at: new Date(eBen.sentAt!.getTime() + 72 * HOUR) },
    { dir: "OUT", sender: "AUTOMATION", key: "ESTIMATE_RECOVERY", estimateId: eBen.est.id, body: fu(2, ben, "EST-1003", "AC Installation", "$12,450"), at: new Date(eBen.sentAt!.getTime() + 168 * HOUR) },
    { dir: "IN", body: "Sorry for the delay, we were comparing quotes. Yes, we'd like to go ahead with the heat pump.", at: at(-4, 11, 9) },
    { dir: "OUT", body: "Wonderful, Benjamin! Our dispatcher will reach out today to schedule your installation.", at: at(-4, 11, 9) },
  ]);
  await convo(steve, [1, 2, 3].map((s, i) => ({ dir: "OUT" as const, sender: "AUTOMATION" as const, key: "ESTIMATE_RECOVERY" as const, estimateId: ePending.est.id, body: fu(i, steve, "EST-1008", "Furnace Installation", "$6,150"), at: new Date(ePending.sentAt!.getTime() + [24, 72, 168][s - 1] * HOUR) })));
  await convo(pool[9], [
    { dir: "OUT", sender: "AUTOMATION", key: "ESTIMATE_RECOVERY", estimateId: eOpt.est.id, body: fu(0, pool[9], "EST-1012", "Furnace Repair", "$740"), at: new Date(eOpt.sentAt!.getTime() + 24 * HOUR) },
    { dir: "IN", body: "STOP", at: at(-4, 10, 12) },
    { dir: "OUT", sender: "SYSTEM", body: "Summit Peak HVAC: You're unsubscribed and won't receive more texts. Reply START to resubscribe.", at: at(-4, 10, 12) },
  ]);
  await convo(gary, [
    { dir: "OUT", sender: "AUTOMATION", key: "REVIEW_REQUESTS", body: "Hi Gary, thanks for choosing Summit Peak HVAC! How did Dev do? Reply with a number from 1 (poor) to 5 (great).", at: at(-3, 17, 30) },
    { dir: "IN", body: "2. Tech was two hours late and the furnace is still making the rattling noise.", at: at(-3, 19, 2) },
    { dir: "OUT", body: "Gary, I'm sorry we fell short. Olivia will call you personally to make it right.", at: at(-3, 19, 2) },
  ], { takeover: "Negative feedback — owner follow-up", unread: 1 });
  await convo(linda, [
    { dir: "OUT", body: "Summit Peak HVAC: You're confirmed for your Comfort Club tune-up. Technician: Dev. Reply C to confirm or call (801) 555-0198 to change.", at: at(-3, 9, 6) },
    { dir: "IN", body: "C", at: at(-3, 9, 20) },
    { dir: "IN", body: "Can Dev also look at the upstairs bedroom that runs warm?", at: at(-1, 14, 3) },
  ], { unread: 1 });
  await convo(tanya, [
    { dir: "IN", body: "Hi, is there any way to do the refrigerant repair this week? We have family visiting.", at: atPast(0, Math.max(8, zonedParts(NOW, TZ).hour - 2), 10) },
  ], { unread: 1 });
  await convo(missedRecoveredCust, [
    { dir: "OUT", sender: "AUTOMATION", key: "MISSED_CALL_RECOVERY", body: "Sorry we missed your call! This is Summit Peak HVAC — how can we help? Reply here or call (801) 555-0198. Emergency service is available 24/7.", at: new Date(at(-2, 12, 14).getTime() + 45_000) },
    { dir: "IN", body: "AC is running but not cooling. Can someone come tomorrow?", at: at(-2, 12, 20) },
    { dir: "OUT", sender: "STAFF", body: "Absolutely — we have you down for tomorrow with one of our technicians. You'll get a confirmation text shortly.", at: at(-2, 12, 31) },
  ]);
  await convo(aaron, [
    { dir: "IN", body: "Can I speak to someone about the invoice? I think I was charged twice.", at: at(-2, 16, 40) },
    { dir: "OUT", body: "Thanks Aaron! A member of our team will call you shortly.", at: at(-2, 16, 40) },
    { dir: "OUT", sender: "STAFF", body: "Hi Aaron, Marcus here — you're right, the duplicate charge has been refunded. Sorry about that!", at: at(-2, 17, 5) },
    { dir: "IN", body: "Appreciate it, thanks Marcus.", at: at(-2, 17, 9) },
  ], { takeover: "Customer asked to speak with someone" });
  for (const [c, rating, d] of [[pool[0], 5, 6], [pool[1], 5, 9], [pool[2], 4, 13], [nora, 5, 7]] as [Cust, number, number][]) {
    await convo(c, [
      { dir: "OUT", sender: "AUTOMATION", key: "REVIEW_REQUESTS", body: `Hi ${c.firstName}, thanks for choosing Summit Peak HVAC! How did we do? Reply with a number from 1 (poor) to 5 (great).`, at: at(-d, 17, 0) },
      { dir: "IN", body: rating === 5 ? `${rating}! Super professional and explained everything.` : `${rating} - good work, a little late but great tech.`, at: at(-d, 18, 12) },
      { dir: "OUT", sender: "AUTOMATION", key: "REVIEW_REQUESTS", body: `Thank you, ${c.firstName}! If you have a moment, would you share your experience on Google? It really helps a local business: ${REVIEW_URL}`, at: at(-d, 18, 12) },
    ]);
  }
  await convo(pool[4], [
    { dir: "OUT", sender: "AUTOMATION", key: "NEW_LEAD_FOLLOWUP", body: `Hi ${pool[4].firstName}, thanks for reaching out to Summit Peak HVAC about furnace repair! What's a good time for a quick call? You can also reply here.`, at: at(-5, 10, 2) },
    { dir: "IN", body: "Anytime this afternoon works.", at: at(-5, 10, 30) },
  ]);
  await convo(priyaK, [
    { dir: "OUT", sender: "AUTOMATION", key: "ESTIMATE_RECOVERY", body: fu(0, priyaK, "EST-1010", "Indoor Air Quality", "$1,600"), at: at(-3, 15, 20) },
    { dir: "OUT", sender: "AUTOMATION", key: "ESTIMATE_RECOVERY", body: fu(1, priyaK, "EST-1010", "Indoor Air Quality", "$1,600"), at: at(-1, 15, 20) },
    { dir: "IN", body: "Does the humidifier need a separate water line?", at: at(-1, 18, 45) },
  ], { unread: 1 });
  await convo(holly, [
    { dir: "OUT", sender: "AUTOMATION", key: "ESTIMATE_RECOVERY", body: fu(0, holly, "EST-1004", "Indoor Air Quality", "$1,850"), at: at(-21, 15, 20) },
    { dir: "IN", body: "Yes please, let's schedule it.", at: at(-18, 9, 12) },
    { dir: "OUT", body: "Wonderful, Holly! Our dispatcher will reach out today to schedule your installation.", at: at(-18, 9, 12) },
  ]);

  // ── Reviews ─────────────────────────────────────────────────────────────
  const completedAppts = await db.appointment.findMany({ where: { organizationId: O, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, include: { customer: true } });
  const apptFor = (cid: string) => completedAppts.find((a) => a.customerId === cid) ?? null;
  const usedAppts = new Set<string>();
  const mkReview = async (c: Cust, status: "REVIEW_REQUESTED" | "NEGATIVE_FLAGGED" | "SATISFACTION_SENT" | "NO_RESPONSE" | "RESOLVED" | "POSITIVE", d: number, rating: number | null, response: string | null) => {
    const appt = apptFor(c.id) ?? completedAppts.find((a) => !usedAppts.has(a.id) && !a.customerId);
    const apptId = appt && !usedAppts.has(appt.id) ? appt.id : null;
    if (apptId) usedAppts.add(apptId);
    await db.review.create({
      data: {
        organizationId: O,
        customerId: c.id,
        appointmentId: apptId,
        status,
        rating,
        response,
        satisfactionSentAt: at(-d, 17, 0),
        respondedAt: response ? at(-d, 18, 12) : null,
        reviewRequestedAt: status === "REVIEW_REQUESTED" ? at(-d, 18, 12) : null,
        flaggedAt: status === "NEGATIVE_FLAGGED" || status === "RESOLVED" ? at(-d, 19, 2) : null,
        resolvedAt: status === "RESOLVED" ? at(-d + 1, 10, 0) : null,
        assignedEmployeeId: status === "NEGATIVE_FLAGGED" || status === "RESOLVED" ? eOlivia.id : null,
        notes: status === "RESOLVED" ? "Olivia called, sent Dev back to re-seat the blower wheel at no charge. Customer satisfied." : null,
        createdAt: at(-d, 17, 0),
      },
    });
  };
  await mkReview(pool[0], "REVIEW_REQUESTED", 6, 5, "5! Super professional and explained everything.");
  await mkReview(pool[1], "REVIEW_REQUESTED", 9, 5, "5! Super professional and explained everything.");
  await mkReview(pool[2], "REVIEW_REQUESTED", 13, 4, "4 - good work, a little late but great tech.");
  await mkReview(nora, "REVIEW_REQUESTED", 7, 5, "5! Super professional and explained everything.");
  await mkReview(gary, "NEGATIVE_FLAGGED", 3, 2, "2. Tech was two hours late and the furnace is still making the rattling noise.");
  await mkReview(pool[13], "RESOLVED", 16, 3, "3 — blower is still noisy");
  await mkReview(pool[14], "NO_RESPONSE", 12, null, null);
  // Awaiting a response — reply "5" or "2" from the Inbox simulator to see both paths
  await mkReview(will, "SATISFACTION_SENT", 0, null, null);
  await db.message.create({
    data: {
      organizationId: O,
      conversationId: (await db.conversation.findUniqueOrThrow({ where: { customerId: will.id } })).id,
      customerId: will.id,
      direction: "OUTBOUND",
      sender: "AUTOMATION",
      automationKey: "REVIEW_REQUESTS",
      body: "Hi Will, thanks for choosing Summit Peak HVAC! How did Jake do? Reply with a number from 1 (poor) to 5 (great).",
      status: "SIMULATED",
      isSimulated: true,
      createdAt: atPast(0, 9, 0),
    },
  });

  // Gary's completed job (the negative review) + lead
  const garyLead = await mkLead({ customer: gary, status: "WON", source: "PHONE", service: "furnace_repair", daysAgo: 5, needsHuman: true, value: 38_000 });
  await db.leadEvent.create({ data: { organizationId: O, leadId: garyLead.id, customerId: gary.id, type: "review_negative", title: "Negative feedback (2/5) — routed to Olivia Chen", detail: "Tech was two hours late and the furnace is still making the rattling noise.", actor: "CUSTOMER", createdAt: at(-3, 19, 2) } });

  // ── Automations & run history ───────────────────────────────────────────
  const automations = [
    { key: "ESTIMATE_RECOVERY", name: "Estimate Recovery", description: "Follows up on sent estimates on day 1, 3 and 7 until the customer decides.", triggerDescription: "Estimate marked as Sent", template: DEFAULT_ESTIMATE_TEMPLATES.join("\n---\n"), delaysHours: [24, 72, 168], stopConditions: ["Estimate accepted", "Estimate declined", "Estimate expired", "Customer replied STOP", "Customer asked for a person", "Paused manually"] },
    { key: "APPOINTMENT_REMINDERS", name: "Appointment Reminders", description: "Texts customers 24 hours before their appointment.", triggerDescription: "Appointment starts within 24 hours", template: "Hi {{firstName}}, reminder from {{business}}: {{service}} is scheduled for {{time}} with {{technician}}. Reply C to confirm or call {{phone}} to reschedule.", delaysHours: [24], stopConditions: ["Appointment cancelled", "Customer replied STOP"] },
    { key: "REVIEW_REQUESTS", name: "Review Requests", description: "Asks for feedback after completed jobs. Happy customers get the Google review link; unhappy customers are routed to the owner.", triggerDescription: "Appointment marked Completed (after delay)", template: "Hi {{firstName}}, thanks for choosing {{business}}! How did {{technician}} do? Reply with a number from 1 (poor) to 5 (great).\n---\nThank you, {{firstName}}! If you have a moment, would you share your experience on Google? It really helps a local business: {{reviewLink}}", delaysHours: [2], stopConditions: ["Customer replied STOP", "Negative feedback (routed to owner)", "No response after 5 days"] },
    { key: "MISSED_CALL_RECOVERY", name: "Missed Call Recovery", description: "Instantly texts callers the team couldn't answer and opens a lead.", triggerDescription: "Inbound call missed, abandoned or sent to voicemail", template: "Sorry we missed your call! This is {{business}} — how can we help? Reply here or call {{phone}}. Emergency service is available 24/7.", delaysHours: [0], stopConditions: ["Caller already reached by staff", "Customer replied STOP"] },
    { key: "NEW_LEAD_FOLLOWUP", name: "New Lead Follow-Up", description: "Responds to web-form, Google LSA and referral leads within minutes.", triggerDescription: "New lead created with no response after 5 minutes", template: "Hi {{firstName}}, thanks for reaching out to {{business}} about {{service}}! What's a good time for a quick call? You can also reply here.", delaysHours: [0], stopConditions: ["Lead contacted by staff", "Customer replied STOP"] },
  ] as const;
  const autoIds: Record<string, string> = {};
  for (const a of automations) {
    const row = await db.automation.create({ data: { organizationId: O, ...a, delaysHours: [...a.delaysHours], stopConditions: [...a.stopConditions], lastRunAt: new Date(NOW.getTime() - 55 * MINUTE) } });
    autoIds[a.key] = row.id;
  }
  const runs: [string, number, "SUCCESS" | "NOOP" | "PARTIAL", number, number, number, { level: string; message: string }[]][] = [
    ["ESTIMATE_RECOVERY", 21, "SUCCESS", 1, 1, 0, [{ level: "action", message: "EST-1004: sent follow-up #1 (day 1) to Holly Madsen — simulated SMS" }]],
    ["ESTIMATE_RECOVERY", 13, "SUCCESS", 1, 1, 0, [{ level: "action", message: "EST-1002: sent follow-up #1 (day 1) to Maria Castillo — simulated SMS" }]],
    ["ESTIMATE_RECOVERY", 11, "SUCCESS", 2, 1, 1, [{ level: "action", message: "EST-1002: sent follow-up #2 (day 3) to Maria Castillo — simulated SMS" }, { level: "stop", message: "EST-1006: stopped — Estimate declined (1 pending follow-up cancelled)" }]],
    ["ESTIMATE_RECOVERY", 4, "SUCCESS", 2, 1, 1, [{ level: "action", message: "EST-1003: sent follow-up #3 (day 7) to Benjamin Okafor — simulated SMS" }, { level: "stop", message: "EST-1012: stopped — Customer opted out of SMS (STOP) (2 pending follow-ups cancelled)" }]],
    ["ESTIMATE_RECOVERY", 1, "SUCCESS", 2, 2, 0, [{ level: "action", message: "EST-1001: sent follow-up #1 (day 1) to Derek Hansen — simulated SMS" }, { level: "action", message: "EST-1008: sent follow-up #3 (day 7) to Steve Rasmussen — simulated SMS" }]],
    ["APPOINTMENT_REMINDERS", 1, "SUCCESS", 5, 5, 0, [{ level: "action", message: "5 appointment reminders sent for tomorrow" }]],
    ["REVIEW_REQUESTS", 3, "SUCCESS", 2, 2, 0, [{ level: "action", message: "Satisfaction check sent to Gary Whitaker" }, { level: "action", message: `Satisfaction check sent to ${pool[0].firstName} ${pool[0].lastName}` }]],
    ["MISSED_CALL_RECOVERY", 2, "SUCCESS", 1, 1, 0, [{ level: "action", message: `Text-back sent to ${fmtPhone(missedRecoveredCust.phone)}` }]],
    ["NEW_LEAD_FOLLOWUP", 5, "SUCCESS", 3, 3, 0, [{ level: "action", message: "Intro texts sent to 3 web-form leads" }]],
    ["NEW_LEAD_FOLLOWUP", 1, "NOOP", 0, 0, 0, [{ level: "info", message: "Every new lead has already been contacted." }]],
  ];
  for (const [key, d, status, processed, actions, skipped, log] of runs) {
    const startedAt = at(-d, 15, 25);
    await db.automationRun.create({ data: { organizationId: O, automationId: autoIds[key], trigger: "SCHEDULED", status, processed, actionsTaken: actions, skipped, log: log.map((l) => ({ ...l, at: startedAt.toISOString() })), startedAt, finishedAt: new Date(startedAt.getTime() + 2400) } });
  }

  // ── Integrations, billing, usage, audit ─────────────────────────────────
  const integrations = [
    ["TWILIO", "DEMO", { phoneNumber: "+18015550198", note: "Demo number — simulated calls & SMS" }],
    ["GOOGLE_CALENDAR", "DEMO", { calendar: "CallFlow internal calendar" }],
    ["STRIPE", "DEMO", {}],
    ["OPENAI", "DEMO", { engine: "Deterministic rules + knowledge-base retrieval" }],
    ["JOBBER", "COMING_SOON", {}],
    ["HOUSECALL_PRO", "COMING_SOON", {}],
    ["QUICKBOOKS", "COMING_SOON", {}],
    ["SERVICETITAN", "COMING_SOON", {}],
    ["HUBSPOT", "COMING_SOON", {}],
  ] as const;
  for (const [provider, status, config] of integrations)
    await db.integration.create({ data: { organizationId: O, provider, status, config, connectedAt: status === "DEMO" ? new Date(NOW.getTime() - 62 * DAY) : null } });

  const periodStart = at(-zonedParts(NOW, TZ).day + 1, 0, 0);
  await db.subscription.create({ data: { organizationId: O, plan: "GROWTH", status: "DEMO", isDemo: true, currentPeriodStart: periodStart, currentPeriodEnd: new Date(periodStart.getTime() + 31 * DAY) } });

  await db.auditLog.createMany({
    data: [
      { organizationId: O, userId: olivia.id, action: "organization.onboarding_completed", entityType: "Organization", entityId: O, createdAt: new Date(NOW.getTime() - 62 * DAY) },
      { organizationId: O, userId: olivia.id, action: "knowledge.updated", entityType: "KnowledgeDocument", entityId: null, createdAt: new Date(NOW.getTime() - 9 * DAY) },
      { organizationId: O, userId: marcusUser.id, action: "estimate.sent", entityType: "Estimate", entityId: eDerek.est.id, createdAt: eDerek.sentAt! },
      { organizationId: O, userId: null, action: "sms.opted_out", entityType: "Customer", entityId: pool[9].id, createdAt: at(-4, 10, 12) },
      { organizationId: O, userId: null, action: "review.negative_flagged", entityType: "Review", entityId: null, createdAt: at(-3, 19, 2) },
    ],
  });

  const counts = {
    customers: await db.customer.count({ where: { organizationId: O } }),
    leads: await db.lead.count({ where: { organizationId: O } }),
    calls: callCount,
    appointments: await db.appointment.count({ where: { organizationId: O } }),
    estimates: await db.estimate.count({ where: { organizationId: O } }),
    conversations: await db.conversation.count({ where: { organizationId: O } }),
    messages: await db.message.count({ where: { organizationId: O } }),
    automationRuns: await db.automationRun.count({ where: { organizationId: O } }),
    knowledge: await db.knowledgeDocument.count({ where: { organizationId: O } }),
    reviews: await db.review.count({ where: { organizationId: O } }),
  };
  return counts;
}

export interface SeedResult {
  counts: Record<string, number>;
  ms: number;
}

/** Rebuilds the demo tenant (deleting only the demo org and demo users). Timestamps are relative to `now`. */
export async function seedDemo(client: PrismaClient, now = new Date()): Promise<SeedResult> {
  const started = Date.now();
  db = client;
  NOW = now;
  rand = seededRandom(20260926);
  const counts = await main();
  return { counts, ms: Date.now() - started };
}
