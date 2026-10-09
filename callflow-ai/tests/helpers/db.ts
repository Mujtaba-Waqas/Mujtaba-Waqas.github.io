import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/services/context";
import { createOrganization } from "@/lib/services/organizations";
import { DEFAULT_SETTINGS } from "@/lib/validation/settings";
import { zonedDayOffset, zonedParts, zonedTimeToUtc } from "@/lib/time";

const created: { orgIds: string[]; userIds: string[] } = { orgIds: [], userIds: [] };

/** Creates an isolated tenant with techs + service area. Cleaned up by `cleanupTestOrgs`. */
export async function createTestOrg(label: string) {
  const tag = randomUUID().slice(0, 8);
  const user = await db.user.create({ data: { email: `test-${tag}@example.test`, name: `Test ${label}`, passwordHash: "x" } });
  created.userIds.push(user.id);
  const org = await createOrganization(user.id, `Test ${label} ${tag}`, { owner: { name: "Owner Test", email: user.email } });
  created.orgIds.push(org.id);
  await db.organization.update({ where: { id: org.id }, data: { phone: `+1801555${String(Math.floor(Math.random() * 9000) + 1000)}`, onboardingCompletedAt: new Date() } });
  const techs = await Promise.all(
    ["Tech One", "Tech Two"].map((name, i) => db.employee.create({ data: { organizationId: org.id, name, title: "Technician", kind: "TECHNICIAN", isOnCall: i === 0 } })),
  );
  await db.employee.create({ data: { organizationId: org.id, name: "Disp Atcher", title: "Dispatcher", kind: "DISPATCHER" } });
  await db.serviceArea.createMany({
    data: [
      { organizationId: org.id, zip: "84124", city: "Holladay", county: "Salt Lake" },
      { organizationId: org.id, zip: "84109", city: "Salt Lake City", county: "Salt Lake" },
    ],
  });
  await db.organization.update({ where: { id: org.id }, data: { settings: { ...DEFAULT_SETTINGS, emergency: { ...DEFAULT_SETTINGS.emergency, onCallEmployeeId: techs[0].id } } } });
  await db.knowledgeDocument.create({
    data: { organizationId: org.id, category: "PRICING", title: "Diagnostic fee", content: "Our standard diagnostic visit is $89, applied toward the repair.", tags: ["price", "diagnostic", "fee"] },
  });
  const ctx: TenantContext = { orgId: org.id, userId: user.id, role: "OWNER" };
  return { org, user, techs, ctx };
}

export async function cleanupTestOrgs() {
  if (created.orgIds.length) await db.organization.deleteMany({ where: { id: { in: created.orgIds } } });
  if (created.userIds.length) await db.user.deleteMany({ where: { id: { in: created.userIds } } });
  created.orgIds = [];
  created.userIds = [];
}

/** A weekday (Tue–Thu) at least 2 days out, at the given Denver wall-clock time. */
export function futureWeekdayAt(hour: number, minute = 0) {
  for (let d = 2; d < 10; d++) {
    const day = zonedDayOffset(new Date(), d);
    const p = zonedParts(day);
    if (p.weekday >= 2 && p.weekday <= 4) return zonedTimeToUtc(p.year, p.month, p.day, hour, minute);
  }
  throw new Error("unreachable");
}
