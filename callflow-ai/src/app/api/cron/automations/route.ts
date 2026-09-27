import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAllDueAutomations } from "@/lib/services/automations";
import { systemContext } from "@/lib/services/context";

/** Scheduler entry point (e.g. Vercel Cron / GitHub Actions every 5 minutes). Requires `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgs = await db.organization.findMany({ where: { onboardingCompletedAt: { not: null } }, select: { id: true } });
  const results = [];
  for (const org of orgs) {
    const runs = await runAllDueAutomations(systemContext(org.id));
    results.push({ organizationId: org.id, runs: runs.map((r) => ({ id: r.id, status: r.status, actions: r.actionsTaken })) });
  }
  return NextResponse.json({ ok: true, results });
}
