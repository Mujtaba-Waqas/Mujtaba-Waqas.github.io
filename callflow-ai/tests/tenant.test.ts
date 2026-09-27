import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { can, ROLE_PERMISSIONS } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/services/context";
import { createEstimate, markEstimateSent } from "@/lib/services/estimates";
import { handleInboundSms } from "@/lib/services/inbound-sms";
import { createLead, getLeadScoped, updateLeadStatus } from "@/lib/services/leads";
import { sendSms } from "@/lib/services/messaging";
import { bookAppointment } from "@/lib/services/scheduling";
import { cleanupTestOrgs, createTestOrg, futureWeekdayAt } from "./helpers/db";

describe("organization / tenant access checks", () => {
  let A: Awaited<ReturnType<typeof createTestOrg>>;
  let B: Awaited<ReturnType<typeof createTestOrg>>;
  let leadA: { id: string; customerId: string };

  beforeAll(async () => {
    A = await createTestOrg("tenant-a");
    B = await createTestOrg("tenant-b");
    leadA = await createLead(A.ctx, { firstName: "Alice", lastName: "Arnold", phone: "8015550401", source: "WEB_FORM", urgency: "NORMAL", requestedService: "AC Repair" });
  });
  afterAll(cleanupTestOrgs);

  it("lets the owning tenant read its lead", async () => {
    await expect(getLeadScoped(A.ctx, leadA.id)).resolves.toMatchObject({ id: leadA.id });
  });

  it("hides another tenant's lead as not found", async () => {
    await expect(getLeadScoped(B.ctx, leadA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateLeadStatus(B.ctx, leadA.id, "WON")).rejects.toBeInstanceOf(NotFoundError);
    expect((await db.lead.findUnique({ where: { id: leadA.id } }))?.status).toBe("NEW");
  });

  it("blocks cross-tenant messaging, booking and estimates", async () => {
    await expect(sendSms(B.ctx, { customerId: leadA.customerId, body: "hi", sender: "STAFF" })).rejects.toBeInstanceOf(NotFoundError);
    const start = futureWeekdayAt(10);
    await expect(bookAppointment(B.ctx, { customerId: leadA.customerId, technicianId: B.techs[0].id, title: "x", startAt: start, endAt: new Date(start.getTime() + 3_600_000) })).rejects.toBeInstanceOf(NotFoundError);
    // A's technician can't be used by A's booking from B's context, and B can't use A's technician in its own org
    const custB = await db.customer.create({ data: { organizationId: B.org.id, firstName: "Bob", lastName: "B", phone: "+18015550402" } });
    await expect(bookAppointment(B.ctx, { customerId: custB.id, technicianId: A.techs[0].id, title: "x", startAt: start, endAt: new Date(start.getTime() + 3_600_000) })).rejects.toBeInstanceOf(NotFoundError);
    await expect(createEstimate(B.ctx, { customerId: leadA.customerId, title: "x", items: [{ description: "a", quantity: 1, unitPriceCents: 100 }] })).rejects.toBeInstanceOf(NotFoundError);
    const estA = await createEstimate(A.ctx, { customerId: leadA.customerId, title: "Mine", items: [{ description: "a", quantity: 1, unitPriceCents: 100 }] });
    await expect(markEstimateSent(B.ctx, estA.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps the same phone number as separate customers per tenant", async () => {
    await handleInboundSms(B.ctx, { from: "8015550401", body: "Hello", simulated: true });
    const rows = await db.customer.findMany({ where: { phone: "+18015550401", organizationId: { in: [A.org.id, B.org.id] } } });
    expect(rows).toHaveLength(2);
    // A's customer is untouched by B's inbound message
    expect(await db.message.count({ where: { organizationId: A.org.id, customerId: leadA.customerId } })).toBe(0);
  });

  it("enforces role permissions", () => {
    expect(can("OWNER", "billing:manage")).toBe(true);
    expect(can("ADMIN", "billing:manage")).toBe(false);
    expect(can("DISPATCHER", "estimates:write")).toBe(true);
    expect(can("DISPATCHER", "settings:manage")).toBe(false);
    expect(can("TECHNICIAN", "leads:write")).toBe(false);
    expect(ROLE_PERMISSIONS.TECHNICIAN).toContain("calendar:write");
  });
});
