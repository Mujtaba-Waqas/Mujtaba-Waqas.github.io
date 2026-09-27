import { NextResponse } from "next/server";
import { ForbiddenError } from "@/lib/auth/rbac";
import { getApiAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * Streams a call's voicemail/recording to signed-in staff of the owning
 * company. Fetches from Twilio server-side with the account credentials, so
 * recordings work even when Twilio "HTTP auth on media URLs" is enabled.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ callId: string }> }) {
  let auth;
  try {
    auth = await getApiAuth("calls:view");
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw e;
  }
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { callId } = await params;
  const call = await db.call.findFirst({ where: { id: callId, organizationId: auth.orgId }, select: { recordingUrl: true } });
  if (!call?.recordingUrl || !/^https:\/\/api\.twilio\.com\//.test(call.recordingUrl)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return NextResponse.json({ error: "Twilio is not configured on this deployment" }, { status: 503 });
  const upstream = await fetch(`${call.recordingUrl}.mp3`, { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` } });
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "Recording unavailable" }, { status: 502 });
  return new NextResponse(upstream.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" } });
}
