import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseSettings } from "@/lib/validation/settings";
import { systemContext } from "@/lib/services/context";
import { completeDial, handleMissedCall } from "@/lib/services/phone";
import { twimlHangup, twimlMissed } from "@/lib/twiml";
import { limitOr429, publicUrl, readTwilioRequest, twiml } from "@/lib/webhooks";

/** Twilio → result of ringing the office (ring_then_text_back mode). */
export async function POST(req: Request) {
  const limited = limitOr429(req, "twilio-dial", 300);
  if (limited) return limited;
  const { params, valid } = await readTwilioRequest(req);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  const callId = new URL(req.url).searchParams.get("callId");
  const call = callId ? await db.call.findUnique({ where: { id: callId }, include: { organization: true } }) : null;
  if (!call || (call.providerCallSid && params.CallSid && call.providerCallSid !== params.CallSid)) return NextResponse.json({ error: "Unknown call" }, { status: 404 });
  const ctx = systemContext(call.organizationId);
  const answered = await completeDial(ctx, call.id, params.DialCallStatus ?? "", Number(params.DialCallDuration ?? 0));
  if (answered) return twiml(twimlHangup());
  await handleMissedCall(ctx, call.id);
  const settings = parseSettings(call.organization.settings);
  const vm = new URL(publicUrl(req));
  vm.pathname = "/api/webhooks/twilio/voice/voicemail";
  vm.search = `?callId=${encodeURIComponent(call.id)}`;
  return twiml(twimlMissed(settings.phone.missedCallMessage.replace(/\{business\}/g, call.organization.name), settings.phone.voicemail ? vm.toString() : null));
}
