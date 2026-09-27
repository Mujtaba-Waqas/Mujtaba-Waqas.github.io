import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { customerName } from "@/lib/format";
import { loadOrg, toTenantContext } from "@/lib/services/context";
import { getLookups } from "@/lib/services/lookups";
import { minutesOfDay, zonedDateKey, zonedDayOffset, zonedParts, zonedTimeToUtc } from "@/lib/time";
import { CalendarView, type CalAppt } from "./calendar-view";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAuth("calendar:write");
  const sp = await searchParams;
  const ctx = toTenantContext(auth);
  const { org, settings } = await loadOrg(ctx);
  const tz = org.timezone;
  const view = sp.view === "day" ? "day" : "week";
  const today = zonedDateKey(new Date(), tz);
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const [y, m, d] = dateKey.split("-").map(Number);
  const anchor = zonedTimeToUtc(y, m, d, 12, 0, tz);
  const weekday = zonedParts(anchor, tz).weekday;
  const start = view === "week" ? zonedDayOffset(anchor, -weekday, tz) : zonedDayOffset(anchor, 0, tz);
  const dayCount = view === "week" ? 7 : 1;
  const end = zonedDayOffset(start, dayCount, tz);
  const days = Array.from({ length: dayCount }, (_, i) => zonedDateKey(new Date(zonedDayOffset(start, i, tz).getTime() + 12 * 3_600_000), tz));

  const [appts, lookups, customers] = await Promise.all([
    db.appointment.findMany({
      where: { organizationId: auth.orgId, startAt: { gte: start, lt: end } },
      include: { customer: true, technician: true, service: true },
      orderBy: { startAt: "asc" },
    }),
    getLookups(ctx),
    db.customer.findMany({ where: { organizationId: auth.orgId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, address: true, city: true } }),
  ]);

  const calAppts: CalAppt[] = appts.map((a) => ({
    id: a.id,
    title: a.title,
    customer: customerName(a.customer),
    customerId: a.customerId,
    address: a.address,
    phone: a.customer.phone,
    technicianId: a.technicianId,
    technician: a.technician?.name ?? null,
    color: a.technician?.color ?? "#64748b",
    dayKey: zonedDateKey(a.startAt, tz),
    startMin: minutesOfDay(a.startAt, tz),
    endMin: minutesOfDay(a.endAt, tz) < minutesOfDay(a.startAt, tz) ? 24 * 60 : minutesOfDay(a.endAt, tz),
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    bufferMinutes: a.bufferMinutes,
    status: a.status,
    isEmergency: a.isEmergency,
    bookedBy: a.bookedBy,
    notes: a.notes,
    serviceId: a.serviceId,
    confirmationSentAt: a.confirmationSentAt?.toISOString() ?? null,
    reminderSentAt: a.reminderSentAt?.toISOString() ?? null,
    leadId: a.leadId,
  }));

  return (
    <CalendarView
      view={view}
      dateKey={dateKey}
      today={today}
      days={days}
      tz={tz}
      appts={calAppts}
      technicians={lookups.technicians.map((t) => ({ id: t.id, name: t.name, color: t.color, isOnCall: t.id === settings.emergency.onCallEmployeeId || t.isOnCall }))}
      services={lookups.services}
      customers={customers.map((c) => ({ id: c.id, label: `${customerName(c)}${c.city ? ` — ${c.city}` : ""}` }))}
      businessHours={settings.businessHours}
      bufferMinutes={settings.scheduling.bufferMinutes}
      openNew={sp.new === "1" ? { customerId: sp.customer ?? "", leadId: sp.lead ?? "" } : null}
      openApptId={sp.appt ?? null}
    />
  );
}
