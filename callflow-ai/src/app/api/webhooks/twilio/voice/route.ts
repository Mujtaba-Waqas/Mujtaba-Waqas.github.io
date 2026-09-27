import { NextResponse } from "next/server";
import { getVoiceProvider } from "@/lib/providers";
import { startCall } from "@/lib/services/calls";
import { systemContext } from "@/lib/services/context";
import { firstDelivery, limitOr429, publicUrl, readTwilioRequest, resolveOrgByNumber, twiml } from "@/lib/webhooks";

/** Twilio → inbound call. Answers with the AI greeting and gathers speech. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "twilio-voice", 120);
  if (limited) return limited;
  const { params, valid } = await readTwilioRequest(req);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  const org = await resolveOrgByNumber(params.To ?? null);
  if (!org) return twiml(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this number is not configured.</Say><Hangup/></Response>`);
  if (!(await firstDelivery("twilio-voice", params.CallSid))) return twiml(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
  const { callId, reply } = await startCall(systemContext(org.id), { callerNumber: params.From ?? "", clock: "auto", simulated: false, providerCallSid: params.CallSid ?? null, toNumber: params.To ?? null });
  const action = new URL(publicUrl(req));
  action.pathname = "/api/webhooks/twilio/voice/turn";
  action.search = `?callId=${encodeURIComponent(callId)}`;
  return twiml(getVoiceProvider().answerInboundCall({ greeting: reply, gatherActionUrl: action.toString(), recordingEnabled: true }));
}
