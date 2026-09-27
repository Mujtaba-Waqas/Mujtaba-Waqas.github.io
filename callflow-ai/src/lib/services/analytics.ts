import type { LeadSource } from "@prisma/client";
import { db } from "../db";
import { DAY, zonedDateKey } from "../time";
import { loadOrg, nowOf, type TenantContext } from "./context";

export async function getAnalytics(ctx: TenantContext, days: number) {
  const now = nowOf(ctx);
  const since = new Date(now.getTime() - days * DAY);
  const { org } = await loadOrg(ctx);
  const tz = org.timezone;
  const O = ctx.orgId;
  const [calls, leads, appts, estimates, usage, employees, reviews] = await Promise.all([
    db.call.findMany({ where: { organizationId: O, startedAt: { gte: since } }, select: { startedAt: true, status: true, outcome: true, answeredBy: true, isAfterHours: true, durationSeconds: true } }),
    db.lead.findMany({ where: { organizationId: O, createdAt: { gte: since } }, select: { source: true, status: true, createdAt: true, firstResponseAt: true, estimatedValueCents: true, assignedEmployeeId: true, _count: { select: { appointments: true } } } }),
    db.appointment.findMany({ where: { organizationId: O, createdAt: { gte: since } }, select: { createdAt: true, startAt: true, status: true, bookedBy: true, technicianId: true, isEmergency: true, estimatedValueCents: true } }),
    db.estimate.findMany({ where: { organizationId: O, OR: [{ sentAt: { gte: since } }, { acceptedAt: { gte: since } }, { declinedAt: { gte: since } }] }, select: { sentAt: true, acceptedAt: true, declinedAt: true, status: true, totalCents: true, recoveredByAutomation: true } }),
    db.usageRecord.findMany({ where: { organizationId: O, occurredAt: { gte: since } }, select: { type: true, quantity: true, occurredAt: true } }),
    db.employee.findMany({ where: { organizationId: O, active: true }, orderBy: { name: "asc" } }),
    db.review.findMany({ where: { organizationId: O, createdAt: { gte: since } }, select: { rating: true, appointment: { select: { technicianId: true } } } }),
  ]);

  const dayKeys = Array.from({ length: days }, (_, i) => zonedDateKey(new Date(now.getTime() - (days - 1 - i) * DAY), tz));
  const blank = <T extends Record<string, number>>(init: T) => new Map(dayKeys.map((d) => [d, { date: d, ...init }]));

  const callDays = blank({ booked: 0, captured: 0, handled: 0, missed: 0 });
  for (const c of calls) {
    const row = callDays.get(zonedDateKey(c.startedAt, tz));
    if (!row) continue;
    if (c.outcome === "BOOKED") row.booked++;
    else if (c.outcome === "LEAD_CAPTURED" || c.outcome === "MISSED_RECOVERED") row.captured++;
    else if (c.status === "MISSED" || c.status === "VOICEMAIL" || c.status === "ABANDONED") row.missed++;
    else row.handled++;
  }
  const outcomeCounts = new Map<string, number>();
  for (const c of calls) outcomeCounts.set(c.outcome ?? (c.status === "MISSED" || c.status === "VOICEMAIL" ? "MISSED" : "NO_ACTION"), (outcomeCounts.get(c.outcome ?? (c.status === "MISSED" || c.status === "VOICEMAIL" ? "MISSED" : "NO_ACTION")) ?? 0) + 1);

  const bySource = new Map<LeadSource, { leads: number; converted: number; won: number; valueCents: number; responseSum: number; responseN: number }>();
  for (const l of leads) {
    const s = bySource.get(l.source) ?? { leads: 0, converted: 0, won: 0, valueCents: 0, responseSum: 0, responseN: 0 };
    s.leads++;
    if (l._count.appointments > 0 || ["BOOKED", "WON", "ESTIMATE_SENT"].includes(l.status)) s.converted++;
    if (l.status === "WON") {
      s.won++;
      s.valueCents += l.estimatedValueCents ?? 0;
    }
    if (l.firstResponseAt) {
      s.responseSum += (l.firstResponseAt.getTime() - l.createdAt.getTime()) / 1000;
      s.responseN++;
    }
    bySource.set(l.source, s);
  }

  const bookingDays = blank({ ai: 0, staff: 0 });
  for (const a of appts) {
    const row = bookingDays.get(zonedDateKey(a.createdAt, tz));
    if (!row || a.status === "CANCELLED") continue;
    if (a.bookedBy === "AI") row.ai++;
    else row.staff++;
  }

  // Estimates by week
  const weeks = Math.max(1, Math.ceil(days / 7));
  const weekRows = Array.from({ length: weeks }, (_, i) => {
    const endT = now.getTime() - (weeks - 1 - i) * 7 * DAY;
    return { label: zonedDateKey(new Date(endT - 6 * DAY), tz).slice(5).replace("-", "/"), start: endT - 7 * DAY, end: endT, sent: 0, won: 0, lost: 0 };
  });
  for (const e of estimates) {
    const bucket = (d: Date | null) => (d ? weekRows.find((w) => d.getTime() > w.start && d.getTime() <= w.end) : undefined);
    const s = bucket(e.sentAt);
    if (s) s.sent++;
    const w = bucket(e.acceptedAt);
    if (w) w.won++;
    const l = bucket(e.declinedAt);
    if (l) l.lost++;
  }
  const recoveredCents = estimates.filter((e) => e.status === "ACCEPTED" && e.recoveredByAutomation && e.acceptedAt && e.acceptedAt >= since).reduce((s, e) => s + e.totalCents, 0);
  const wonCents = estimates.filter((e) => e.status === "ACCEPTED" && e.acceptedAt && e.acceptedAt >= since).reduce((s, e) => s + e.totalCents, 0);

  const usageDays = blank({ voice: 0, sms: 0, ai: 0 });
  for (const u of usage) {
    const row = usageDays.get(zonedDateKey(u.occurredAt, tz));
    if (!row) continue;
    if (u.type === "VOICE_MINUTES") row.voice += u.quantity;
    if (u.type === "SMS_SEGMENTS") row.sms += u.quantity;
    if (u.type === "AI_REQUESTS") row.ai += u.quantity;
  }

  const techs = employees
    .filter((e) => e.kind === "TECHNICIAN")
    .map((t) => {
      const mine = appts.filter((a) => a.technicianId === t.id);
      const done = mine.filter((a) => a.status === "COMPLETED");
      const rated = reviews.filter((r) => r.appointment?.technicianId === t.id && r.rating);
      const revenue = done.reduce((s, a) => s + (a.estimatedValueCents ?? 0), 0);
      return {
        id: t.id,
        name: t.name,
        scheduled: mine.filter((a) => a.status !== "CANCELLED").length,
        completed: done.length,
        emergencies: mine.filter((a) => a.isEmergency).length,
        noShows: mine.filter((a) => a.status === "NO_SHOW").length,
        revenueCents: revenue,
        avgTicketCents: done.length ? Math.round(revenue / done.length) : 0,
        avgRating: rated.length ? rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length : null,
      };
    });
  const office = employees
    .filter((e) => e.kind !== "TECHNICIAN")
    .map((e) => {
      const mine = leads.filter((l) => l.assignedEmployeeId === e.id);
      return { id: e.id, name: e.name, title: e.title, leads: mine.length, won: mine.filter((l) => l.status === "WON").length, open: mine.filter((l) => !["WON", "LOST"].includes(l.status)).length };
    });

  const aiCalls = calls.filter((c) => c.answeredBy === "AI");
  const responseAll = leads.filter((l) => l.firstResponseAt).map((l) => (l.firstResponseAt!.getTime() - l.createdAt.getTime()) / 1000);

  return {
    tz,
    totals: {
      calls: calls.length,
      aiAnswered: aiCalls.length,
      afterHours: calls.filter((c) => c.isAfterHours).length,
      leads: leads.length,
      bookings: appts.filter((a) => a.status !== "CANCELLED").length,
      aiBookings: appts.filter((a) => a.bookedBy === "AI" && a.status !== "CANCELLED").length,
      estimatesSent: estimates.filter((e) => e.sentAt && e.sentAt >= since).length,
      wonCents,
      recoveredCents,
      avgResponseSec: responseAll.length ? responseAll.reduce((a, b) => a + b, 0) / responseAll.length : 0,
      voiceMinutes: usage.filter((u) => u.type === "VOICE_MINUTES").reduce((s, u) => s + u.quantity, 0),
      smsSegments: usage.filter((u) => u.type === "SMS_SEGMENTS").reduce((s, u) => s + u.quantity, 0),
      aiRequests: usage.filter((u) => u.type === "AI_REQUESTS").reduce((s, u) => s + u.quantity, 0),
    },
    callDays: [...callDays.values()],
    outcomes: [...outcomeCounts.entries()].sort((a, b) => b[1] - a[1]),
    sources: [...bySource.entries()].sort((a, b) => b[1].leads - a[1].leads),
    bookingDays: [...bookingDays.values()],
    estimateWeeks: weekRows.map(({ label, sent, won, lost }) => ({ label, sent, won, lost })),
    usageDays: [...usageDays.values()],
    techs,
    office,
  };
}
