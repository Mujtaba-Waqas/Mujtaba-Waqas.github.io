import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seedDemo } from "@/lib/demo/seed-demo";

// Seeding makes a few thousand queries; give it room on serverless hosts.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(secret) && given.length === secret!.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret!));
}

/**
 * Rebuilds the public demo tenant so its data stays "recent" and any edits
 * made by visitors are wiped. Vercel Cron calls this with GET and
 * `Authorization: Bearer $CRON_SECRET`. Only runs when PUBLIC_DEMO=true.
 */
async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.PUBLIC_DEMO !== "true") return NextResponse.json({ error: "Demo reset is disabled (set PUBLIC_DEMO=true)" }, { status: 403 });
  // Only one reset at a time.
  const [{ locked }] = await db.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(424242) AS locked`;
  if (!locked) return NextResponse.json({ ok: false, error: "A reset is already running" }, { status: 409 });
  try {
    const result = await seedDemo(db);
    return NextResponse.json({ ok: true, ...result });
  } finally {
    await db.$queryRaw`SELECT pg_advisory_unlock(424242)`;
  }
}

export const GET = handle;
export const POST = handle;
