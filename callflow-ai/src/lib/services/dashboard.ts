import { db } from "../db";
import { DAY } from "../time";
import { zonedDateKey } from "../time";
import { PLANS } from "../plans";
import { loadOrg, nowOf, type TenantContext } from "./context";

export async function getDashboard(ctx: TenantContext, days = 30) {
  const now = nowOf(ctx);
  const { org } = await loadOrg(ctx);
  const since = new Date(now.getTime() - days * DAY);
  const prevSince = new Date(since.getTime() - days * DAY);
  const O = ctx.orgId;

  const [calls, prevCalls, leads, prevLeadCount, appts, prevAppts, openEstimates, recovered, aiBookings, subscription] = await Promise.all([
    db.call.findMany({ where: { organizationId: O, startedAt: { gte: since } }, select: { status: true, answeredBy: true, isAfterHours: true, outcome: true, isEmergency: true } }),
    db.call.count({ where: { organizationId: O, startedAt: { gte: prevSince, lt: since }, status: { in: ["COMPLETED", "TRANSFERRED"] } } }),
    db.lead.findMany({ where: { organizationId: O, createdAt: { gte: since } }, select: { id: true, status: true, createdAt: true, firstResponseAt: true, _count: { select: { appointments: true } } } }),
    db.lead.count({ where: { organizationId: O, createdAt: { gte: prevSince, lt: since } } }),
    db.appointment.count({ where: { organizationId: O, createdAt: { gte: since }, status: { not: "CANCELLED" } } }),
    db.appointment.count({ where: { organizationId: O, createdAt: { gte: prevSince, lt: since }, status: { not: "CANCELLED" } } }),
    db.estimate.aggregate({ where: { organizationId: O, status: { in: ["SENT", "VIEWED"] } }, _sum: { totalCents: true }, _count: true }),
    db.estimate.findMany({ where: { organizationId: O, status: "ACCEPTED", recoveredByAutomation: true, acceptedAt: { gte: since } }, select: { totalCents: true, acceptedAt: true } }),
    // Jobs the AI booked that would otherwise have been lost: after-hours calls and missed-call recoveries
    db.appointment.findMany({
      where: {
        organizationId: O,
        createdAt: { gte: since },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        OR: [{ call: { isAfterHours: true, answeredBy: "AI" } }, { lead: { source: { in: ["MISSED_CALL", "AFTER_HOURS_CALL"] } } }],
      },
      select: { estimatedValueCents: true, createdAt: true, startAt: true, lead: { select: { source: true } }, call: { select: { startedAt: true } } },
    }),
    db.subscription.findUnique({ where: { organizationId: O } }),
  ]);

  const answered = calls.filter((c) => c.status === "COMPLETED" || c.status === "TRANSFERRED");
  const aiAnswered = answered.filter((c) => c.answeredBy === "AI");
  const missedPrevented = aiAnswered.filter((c) => c.isAfterHours).length + calls.filter((c) => c.outcome === "MISSED_RECOVERED").length;
  const converted = leads.filter((l) => l._count.appointments > 0 || ["BOOKED", "WON", "ESTIMATE_SENT"].includes(l.status)).length;
  const responseTimes = leads.filter((l) => l.firstResponseAt).map((l) => (l.firstResponseAt!.getTime() - l.createdAt.getTime()) / 1000);
  const avgResponseSec = responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

  // Daily attributed revenue, split by recovery channel (for the stacked chart)
  const series = new Map<string, { date: string; estimates: number; afterHours: number; missedCalls: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const key = zonedDateKey(new Date(now.getTime() - i * DAY), org.timezone);
    series.set(key, { date: key, estimates: 0, afterHours: 0, missedCalls: 0 });
  }
  for (const r of recovered) {
    const row = series.get(zonedDateKey(r.acceptedAt!, org.timezone));
    if (row) row.estimates += r.totalCents / 100;
  }
  for (const a of aiBookings) {
    const row = series.get(zonedDateKey(a.call?.startedAt ?? a.createdAt, org.timezone));
    if (!row) continue;
    const v = (a.estimatedValueCents ?? 0) / 100;
    if (a.lead?.source === "MISSED_CALL") row.missedCalls += v;
    else row.afterHours += v;
  }
  const recoveredCents = recovered.reduce((s, r) => s + r.totalCents, 0);
  const aiBookedCents = aiBookings.reduce((s, a) => s + (a.estimatedValueCents ?? 0), 0);

  const periodStart = subscription?.currentPeriodStart ?? new Date(now.getTime() - 30 * DAY);
  const usage = await db.usageRecord.groupBy({ by: ["type"], where: { organizationId: O, occurredAt: { gte: periodStart } }, _sum: { quantity: true } });
  const plan = PLANS[subscription?.plan ?? "GROWTH"];
  const usageOf = (t: string) => usage.find((u) => u.type === t)?._sum.quantity ?? 0;

  return {
    metrics: {
      callsAnswered: answered.length,
      callsAnsweredPrev: prevCalls,
      aiAnswered: aiAnswered.length,
      emergencies: calls.filter((c) => c.isEmergency).length,
      missedPrevented,
      newLeads: leads.length,
      newLeadsPrev: prevLeadCount,
      appointmentsBooked: appts,
      appointmentsPrev: prevAppts,
      bookingConversion: leads.length ? converted / leads.length : 0,
      outstandingEstimates: { count: openEstimates._count, cents: openEstimates._sum.totalCents ?? 0 },
      estimatesRecovered: { count: recovered.length, cents: recoveredCents },
      attributedRevenueCents: recoveredCents + aiBookedCents,
      avgResponseSec,
      usage: { voice: usageOf("VOICE_MINUTES"), voiceLimit: plan.voiceMinutes, sms: usageOf("SMS_SEGMENTS"), smsLimit: plan.smsSegments, ai: usageOf("AI_REQUESTS") },
    },
    chart: [...series.values()],
    timezone: org.timezone,
  };
}

export async function getDashboardLists(ctx: TenantContext) {
  const now = nowOf(ctx);
  const O = ctx.orgId;
  const [activity, urgent, flaggedReviews, upcoming] = await Promise.all([
    db.leadEvent.findMany({ where: { organizationId: O }, orderBy: { createdAt: "desc" }, take: 12, include: { customer: { select: { id: true, firstName: true, lastName: true } } } }),
    db.lead.findMany({
      where: { organizationId: O, OR: [{ urgency: { in: ["EMERGENCY", "HIGH"] }, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } }, { needsHumanFollowUp: true, status: { notIn: ["LOST"] } }, { status: "NEW" }] },
      orderBy: [{ urgency: "asc" }, { createdAt: "desc" }],
      take: 6,
      include: { customer: { select: { firstName: true, lastName: true, phone: true } } },
    }),
    db.review.findMany({ where: { organizationId: O, status: "NEGATIVE_FLAGGED" }, include: { customer: { select: { id: true, firstName: true, lastName: true } } }, take: 3 }),
    db.appointment.findMany({
      where: { organizationId: O, startAt: { gte: now }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
      orderBy: { startAt: "asc" },
      take: 6,
      include: { customer: { select: { firstName: true, lastName: true } }, technician: { select: { name: true, color: true } } },
    }),
  ]);
  return { activity, urgent, flaggedReviews, upcoming };
}
