import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getVoiceProvider } from "@/lib/providers";
import { processCallTurn } from "@/lib/services/calls";
import { systemContext } from "@/lib/services/context";
import { limitOr429, publicUrl, readTwilioRequest, twiml } from "@/lib/webhooks";

/** Twilio → one caller utterance (SpeechResult). Returns the AI reply, a transfer, or a hang-up. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "twilio-turn", 300);
  if (limited) return limited;
  const { params, valid } = await readTwilioRequest(req);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  const callId = new URL(req.url).searchParams.get("callId");
  // The call must exist and match the Twilio CallSid that created it.
  const call = callId ? await db.call.findUnique({ where: { id: callId } }) : null;
  if (!call || (call.providerCallSid && params.CallSid && call.providerCallSid !== params.CallSid)) return NextResponse.json({ error: "Unknown call" }, { status: 404 });
  const speech = (params.SpeechResult ?? "").slice(0, 500);
  const voice = getVoiceProvider();
  const action = publicUrl(req);
  if (!speech.trim()) return twiml(voice.respondToTurn({ reply: "Sorry, I didn't catch that. Could you say that again?", gatherActionUrl: action }));
  const r = await processCallTurn(systemContext(call.organizationId), call.id, speech);
  return twiml(voice.respondToTurn({ reply: r.reply, gatherActionUrl: action, transferTo: r.transferTo, hangUp: r.ended && !r.transferTo }));
}
