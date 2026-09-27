import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { systemContext } from "@/lib/services/context";
import { saveVoicemail } from "@/lib/services/phone";
import { twimlHangup } from "@/lib/twiml";
import { limitOr429, readTwilioRequest, twiml } from "@/lib/webhooks";

/** Twilio → <Record> finished after a missed call. Stores the voicemail and alerts staff. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "twilio-voicemail", 300);
  if (limited) return limited;
  const { params, valid } = await readTwilioRequest(req);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  const callId = new URL(req.url).searchParams.get("callId");
  const call = callId ? await db.call.findUnique({ where: { id: callId } }) : null;
  if (!call || (call.providerCallSid && params.CallSid && call.providerCallSid !== params.CallSid)) return NextResponse.json({ error: "Unknown call" }, { status: 404 });
  const url = params.RecordingUrl && /^https:\/\/api\.twilio\.com\//.test(params.RecordingUrl) ? params.RecordingUrl : null;
  await saveVoicemail(systemContext(call.organizationId), call.id, url, Number(params.RecordingDuration ?? 0));
  return twiml(twimlHangup("Thanks, we'll be in touch shortly. Goodbye."));
}
