import type { Actor, AppointmentStatus } from "@prisma/client";
import { db } from "../db";
import { findConflict, generateEmergencySlots, generateSlots, isWithinBusinessHours, type BusyBlock, type SlotOption, type TechnicianRef } from "../domain/availability";
import type { ServiceKey, TimePreference } from "../domain/intents";
import { formatDateTime } from "../format";
import { getCalendarProvider } from "../providers";
import { DAY, MINUTE } from "../time";
import { audit } from "./audit";
import { ConflictError, loadOrg, NotFoundError, nowOf, ValidationError, type TenantContext } from "./context";
import { logEvent } from "./events";

const ACTIVE_STATUSES: AppointmentStatus[] = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"];

export async function getTechnicians(ctx: TenantContext): Promise<TechnicianRef[]> {
  const techs = await db.employee.findMany({ where: { organizationId: ctx.orgId, kind: "TECHNICIAN", active: true }, orderBy: { name: "asc" } });
  return techs.map((t) => ({ id: t.id, name: t.name, isOnCall: t.isOnCall }));
}

export async function getBusyBlocks(ctx: TenantContext, from: Date, to: Date): Promise<BusyBlock[]> {
  const appts = await db.appointment.findMany({
    where: { organizationId: ctx.orgId, status: { in: ACTIVE_STATUSES }, startAt: { lt: to }, endAt: { gt: new Date(from.getTime() - 2 * 60 * MINUTE) } },
    select: { id: true, technicianId: true, startAt: true, endAt: true, bufferMinutes: true },
  });
  return appts;
}

export async function resolveService(ctx: TenantContext, key: ServiceKey | null | undefined) {
  if (!key) return null;
  return db.service.findFirst({ where: { organizationId: ctx.orgId, category: key, active: true } });
}

export async function getAvailableSlots(
  ctx: TenantContext,
  opts: { emergency: boolean; serviceKey?: ServiceKey | null; serviceId?: string | null; preference?: TimePreference | null; offset?: number; count?: number; now?: Date },
): Promise<SlotOption[]> {
  const now = opts.now ?? nowOf(ctx);
  const { org, settings } = await loadOrg(ctx);
  const service = opts.serviceId
    ? await db.service.findFirst({ where: { id: opts.serviceId, organizationId: ctx.orgId } })
    : await resolveService(ctx, opts.serviceKey);
  const technicians = await getTechnicians(ctx);
  const busy = await getBusyBlocks(ctx, now, new Date(now.getTime() + (settings.scheduling.bookingHorizonDays + 1) * DAY));
  const onCallId = settings.emergency.onCallEmployeeId;
  const techs = technicians.map((t) => ({ ...t, isOnCall: onCallId ? t.id === onCallId : t.isOnCall }));
  if (opts.emergency) {
    return generateEmergencySlots({ now, tz: org.timezone, durationMinutes: 120, bufferMinutes: settings.scheduling.bufferMinutes, technicians: techs, busy, count: opts.count ?? 2 });
  }
  return generateSlots({
    now,
    tz: org.timezone,
    businessHours: settings.businessHours,
    durationMinutes: service?.durationMinutes ?? 90,
    bufferMinutes: settings.scheduling.bufferMinutes,
    slotIntervalMinutes: settings.scheduling.slotIntervalMinutes,
    minLeadTimeMinutes: settings.scheduling.minLeadTimeMinutes,
    horizonDays: settings.scheduling.bookingHorizonDays,
    technicians: techs,
    busy,
    preference: opts.preference,
    offset: opts.offset,
    count: opts.count ?? 3,
  });
}

export interface BookInput {
  customerId: string;
  leadId?: string | null;
  serviceId?: string | null;
  technicianId: string | null;
  callId?: string | null;
  title: string;
  startAt: Date;
  endAt: Date;
  isEmergency?: boolean;
  bookedBy?: Actor;
  address?: string | null;
  notes?: string | null;
  estimatedValueCents?: number | null;
  allowOutsideHours?: boolean;
}

/**
 * Books an appointment with conflict prevention. A per-technician Postgres
 * advisory lock serializes concurrent bookings so two requests can't both
 * pass the overlap check and double-book the same technician.
 */
export async function bookAppointment(ctx: TenantContext, input: BookInput) {
  if (input.endAt <= input.startAt) throw new ValidationError("Appointment must end after it starts");
  const { org, settings } = await loadOrg(ctx);
  const customer = await db.customer.findFirst({ where: { id: input.customerId, organizationId: ctx.orgId } });
  if (!customer) throw new NotFoundError("Customer");
  if (input.technicianId) {
    const tech = await db.employee.findFirst({ where: { id: input.technicianId, organizationId: ctx.orgId, active: true } });
    if (!tech) throw new NotFoundError("Technician");
  }
  if (!input.isEmergency && !input.allowOutsideHours && !isWithinBusinessHours(input.startAt, settings.businessHours, org.timezone)) {
    throw new ValidationError("Standard appointments must start within business hours. Mark it as an emergency to book after hours.");
  }
  const buffer = settings.scheduling.bufferMinutes;

  const appointment = await db.$transaction(async (tx) => {
    if (input.technicianId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.technicianId}))`;
      const nearby = await tx.appointment.findMany({
        where: {
          organizationId: ctx.orgId,
          technicianId: input.technicianId,
          status: { in: ACTIVE_STATUSES },
          startAt: { lt: new Date(input.endAt.getTime() + 4 * 60 * MINUTE) },
          endAt: { gt: new Date(input.startAt.getTime() - 4 * 60 * MINUTE) },
        },
        select: { id: true, technicianId: true, startAt: true, endAt: true, bufferMinutes: true },
      });
      const conflict = findConflict({ technicianId: input.technicianId, startAt: input.startAt, endAt: input.endAt, bufferMinutes: buffer }, nearby);
      if (conflict) {
        throw new ConflictError(`Technician is already booked ${formatDateTime(conflict.startAt, org.timezone)} (including ${conflict.bufferMinutes}-minute travel buffer).`);
      }
    }
    return tx.appointment.create({
      data: {
        organizationId: ctx.orgId,
        customerId: customer.id,
        leadId: input.leadId ?? null,
        serviceId: input.serviceId ?? null,
        technicianId: input.technicianId,
        callId: input.callId ?? null,
        title: input.title,
        startAt: input.startAt,
        endAt: input.endAt,
        bufferMinutes: buffer,
        status: "CONFIRMED",
        isEmergency: input.isEmergency ?? false,
        bookedBy: input.bookedBy ?? "STAFF",
        address: input.address ?? ([customer.address, customer.city].filter(Boolean).join(", ") || null),
        notes: input.notes ?? null,
        estimatedValueCents: input.estimatedValueCents ?? null,
      },
    });
  });

  try {
    const ext = await getCalendarProvider().createEvent({ title: appointment.title, startAt: appointment.startAt, endAt: appointment.endAt, location: appointment.address ?? undefined });
    await db.appointment.update({ where: { id: appointment.id }, data: { externalCalendarId: ext.externalId } });
  } catch {
    // External calendar sync failures never block the internal booking.
  }
  if (input.leadId) {
    await db.lead.updateMany({ where: { id: input.leadId, organizationId: ctx.orgId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } }, data: { status: "BOOKED" } });
  }
  await logEvent(ctx, {
    leadId: input.leadId,
    customerId: customer.id,
    type: "appointment_booked",
    title: `${input.isEmergency ? "Emergency appointment" : "Appointment"} booked`,
    detail: `${appointment.title} · ${formatDateTime(appointment.startAt, org.timezone)}`,
    actor: input.bookedBy ?? "STAFF",
    metadata: { appointmentId: appointment.id },
  });
  await audit(ctx, "appointment.booked", "Appointment", appointment.id, { technicianId: input.technicianId, startAt: input.startAt.toISOString() });
  return appointment;
}

export async function rescheduleAppointment(ctx: TenantContext, id: string, input: { startAt: Date; technicianId: string | null }) {
  const appt = await db.appointment.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!appt) throw new NotFoundError("Appointment");
  if (!ACTIVE_STATUSES.includes(appt.status)) throw new ValidationError("Only active appointments can be rescheduled");
  const duration = appt.endAt.getTime() - appt.startAt.getTime();
  const endAt = new Date(input.startAt.getTime() + duration);
  const { org, settings } = await loadOrg(ctx);
  if (!appt.isEmergency && !isWithinBusinessHours(input.startAt, settings.businessHours, org.timezone)) {
    throw new ValidationError("Standard appointments must start within business hours.");
  }
  await db.$transaction(async (tx) => {
    if (input.technicianId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.technicianId}))`;
      const nearby = await tx.appointment.findMany({
        where: { organizationId: ctx.orgId, technicianId: input.technicianId, status: { in: ACTIVE_STATUSES }, id: { not: id }, startAt: { lt: new Date(endAt.getTime() + 4 * 60 * MINUTE) }, endAt: { gt: new Date(input.startAt.getTime() - 4 * 60 * MINUTE) } },
        select: { id: true, technicianId: true, startAt: true, endAt: true, bufferMinutes: true },
      });
      const conflict = findConflict({ id, technicianId: input.technicianId, startAt: input.startAt, endAt, bufferMinutes: appt.bufferMinutes }, nearby);
      if (conflict) throw new ConflictError(`Technician is already booked ${formatDateTime(conflict.startAt, org.timezone)}.`);
    }
    await tx.appointment.update({ where: { id }, data: { startAt: input.startAt, endAt, technicianId: input.technicianId, reminderSentAt: null } });
  });
  await logEvent(ctx, { leadId: appt.leadId, customerId: appt.customerId, type: "appointment_rescheduled", title: "Appointment rescheduled", detail: `New time ${formatDateTime(input.startAt, org.timezone)}`, actor: "STAFF" });
  await audit(ctx, "appointment.rescheduled", "Appointment", id, { from: appt.startAt.toISOString(), to: input.startAt.toISOString() });
}

export async function setAppointmentStatus(ctx: TenantContext, id: string, status: "CANCELLED" | "COMPLETED" | "NO_SHOW" | "IN_PROGRESS", reason?: string) {
  const appt = await db.appointment.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!appt) throw new NotFoundError("Appointment");
  const now = nowOf(ctx);
  await db.appointment.update({
    where: { id },
    data: {
      status,
      cancelledAt: status === "CANCELLED" ? now : appt.cancelledAt,
      cancelReason: status === "CANCELLED" ? (reason ?? "Cancelled by staff") : appt.cancelReason,
      completedAt: status === "COMPLETED" ? now : appt.completedAt,
    },
  });
  if (status === "CANCELLED" && appt.externalCalendarId) await getCalendarProvider().cancelEvent({ externalId: appt.externalCalendarId }).catch(() => undefined);
  await logEvent(ctx, { leadId: appt.leadId, customerId: appt.customerId, type: `appointment_${status.toLowerCase()}`, title: `Appointment ${status.toLowerCase().replace("_", " ")}`, detail: reason ?? null, actor: "STAFF" });
  await audit(ctx, `appointment.${status.toLowerCase()}`, "Appointment", id, { reason: reason ?? null });
}
