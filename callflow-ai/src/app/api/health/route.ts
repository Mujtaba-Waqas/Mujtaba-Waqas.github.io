import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providerStatus } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }
  const p = providerStatus();
  return NextResponse.json(
    { status: database === "ok" ? "ok" : "degraded", database, mode: { sms: p.twilio.liveSms ? "live" : "simulated", voice: p.twilio.configured ? "live" : "simulated", ai: p.openai.configured ? "openai" : "rules", calendar: p.google.configured ? "google" : "internal", billing: p.stripe.configured ? "stripe" : "demo" } },
    { status: database === "ok" ? 200 : 503 },
  );
}
