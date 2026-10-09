import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { blocksOverlap, findConflict, generateSlots } from "@/lib/domain/availability";
import { ConflictError, ValidationError } from "@/lib/services/context";
import { findOrCreateCustomer } from "@/lib/services/customers";
import { bookAppointment } from "@/lib/services/scheduling";
import { DEFAULT_SETTINGS } from "@/lib/validation/settings";
import { zonedTimeToUtc } from "@/lib/time";
import { cleanupTestOrgs, createTestOrg, futureWeekdayAt } from "./helpers/db";

const at = (h: number, m = 0) => zonedTimeToUtc(2026, 9, 30, h, m);

describe("availability (pure)", () => {
  it("treats the travel buffer as part of the busy window", () => {
    const a = { technicianId: "t", startAt: at(8), endAt: at(9, 30), bufferMinutes: 30 };
    expect(blocksOverlap(a, { technicianId: "t", startAt: at(9, 45), endAt: at(11), bufferMinutes: 30 })).toBe(true);
    expect(blocksOverlap(a, { technicianId: "t", startAt: at(10), endAt: at(11), bufferMinutes: 30 })).toBe(false);
  });
  it("only conflicts for the same technician", () => {
    const busy = [{ id: "x", technicianId: "t1", startAt: at(8), endAt: at(10), bufferMinutes: 30 }];
    expect(findConflict({ technicianId: "t2", startAt: at(8), endAt: at(10), bufferMinutes: 30 }, busy)).toBeNull();
    expect(findConflict({ technicianId: "t1", startAt: at(9), endAt: at(10), bufferMinutes: 30 }, busy)?.id).toBe("x");
  });
  it("never offers a slot that collides with an existing booking", () => {
    const techs = [{ id: "t1", name: "Solo Tech", isOnCall: false }];
    const busy = [{ technicianId: "t1", startAt: at(8), endAt: at(12), bufferMinutes: 30 }];
    const slots = generateSlots({ now: zonedTimeToUtc(2026, 9, 29, 18, 0), businessHours: DEFAULT_SETTINGS.businessHours, durationMinutes: 90, bufferMinutes: 30, slotIntervalMinutes: 60, minLeadTimeMinutes: 120, horizonDays: 3, technicians: techs, busy, count: 3 });
    expect(slots.length).toBe(3);
    for (const s of slots) expect(findConflict({ technicianId: "t1", startAt: new Date(s.startAt), endAt: new Date(s.endAt), bufferMinutes: 30 }, busy)).toBeNull();
    expect(new Date(slots[0].startAt).getTime()).toBeGreaterThanOrEqual(at(12, 30).getTime());
  });
});

describe("appointment booking conflict prevention (database)", () => {
  afterAll(cleanupTestOrgs);

  it("rejects an overlapping booking for the same technician and allows another technician", async () => {
    const { ctx, techs } = await createTestOrg("booking");
    const c = await findOrCreateCustomer(ctx, { firstName: "Ann", lastName: "Lee", phone: "8015550301" });
    const start = futureWeekdayAt(10);
    const end = new Date(start.getTime() + 90 * 60_000);
    await bookAppointment(ctx, { customerId: c.id, technicianId: techs[0].id, title: "Repair", startAt: start, endAt: end });
    // Starts inside the 30-minute buffer after the first job
    const overlapStart = new Date(end.getTime() + 15 * 60_000);
    await expect(bookAppointment(ctx, { customerId: c.id, technicianId: techs[0].id, title: "Repair 2", startAt: overlapStart, endAt: new Date(overlapStart.getTime() + 60 * 60_000) })).rejects.toBeInstanceOf(ConflictError);
    await expect(bookAppointment(ctx, { customerId: c.id, technicianId: techs[1].id, title: "Repair 3", startAt: start, endAt: end })).resolves.toBeTruthy();
  });

  it("serializes concurrent bookings so only one wins", async () => {
    const { ctx, techs } = await createTestOrg("race");
    const c = await findOrCreateCustomer(ctx, { firstName: "Bo", lastName: "Ray", phone: "8015550302" });
    const start = futureWeekdayAt(13);
    const input = { customerId: c.id, technicianId: techs[0].id, title: "Race", startAt: start, endAt: new Date(start.getTime() + 90 * 60_000) };
    const results = await Promise.allSettled([bookAppointment(ctx, input), bookAppointment(ctx, input), bookAppointment(ctx, input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.appointment.count({ where: { organizationId: ctx.orgId, technicianId: techs[0].id } })).toBe(1);
  });

  it("refuses standard bookings outside business hours but allows emergencies", async () => {
    const { ctx, techs } = await createTestOrg("hours");
    const c = await findOrCreateCustomer(ctx, { firstName: "Cy", lastName: "Dee", phone: "8015550303" });
    const late = futureWeekdayAt(21);
    const end = new Date(late.getTime() + 120 * 60_000);
    await expect(bookAppointment(ctx, { customerId: c.id, technicianId: techs[0].id, title: "Late", startAt: late, endAt: end })).rejects.toBeInstanceOf(ValidationError);
    await expect(bookAppointment(ctx, { customerId: c.id, technicianId: techs[0].id, title: "Emergency", startAt: late, endAt: end, isEmergency: true })).resolves.toBeTruthy();
  });
});
