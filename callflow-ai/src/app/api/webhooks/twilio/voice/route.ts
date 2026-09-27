import { NextResponse } from "next/server";
import { getVoiceProvider } from "@/lib/providers";
import { startCall } from "@/lib/services/calls";
import { systemContext } from "@/lib/services/context";
import { handleMissedCall, planLiveCall } from "@/lib/services/phone";
import { twimlDial, twimlMissed } from "@/lib/twiml";
import { firstDelivery, limitOr429, publicUrl, readTwilioRequest, resolveOrgByNumber, twiml } from "@/lib/webhooks";

/**
 * Twilio → inbound call. Behaviour depends on the company's phone mode:
 * text_back (message + voicemail + instant text), ring_then_text_back
 * (ring the office first), or ai_receptionist (AI answers and gathers speech).
 */
export async function POST(req: Request) {
  const limited = limitOr429(req, "twilio-voice", 120);
  if (limited) return limited;
  const { params, valid } = await readTwilioRequest(req);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  const org = await resolveOrgByNumber(params.To ?? null);
  if (!org) return twiml(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this number is not configured.</Say><Hangup/></Response>`);
  if (!(await firstDelivery("twilio-voice", params.CallSid))) return twiml(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
  const ctx = systemContext(org.id);
  const plan = await planLiveCall(ctx, { from: params.From ?? "", to: params.To ?? "", callSid: params.CallSid ?? null });
  const base = new URL(publicUrl(req));
  const route = (path: string, callId: string) => {
    base.pathname = path;
    base.search = `?callId=${encodeURIComponent(callId)}`;
    return base.toString();
  };
  if (plan.kind === "dial") return twiml(twimlDial(plan.officeNumber, plan.ringSeconds, route("/api/webhooks/twilio/voice/dial-status", plan.callId), params.To));
  if (plan.kind === "missed") {
    await handleMissedCall(ctx, plan.callId);
    return twiml(twimlMissed(plan.message, plan.voicemail ? route("/api/webhooks/twilio/voice/voicemail", plan.callId) : null));
  }
  const { callId, reply } = await startCall(ctx, { callerNumber: params.From ?? "", clock: "auto", simulated: false, providerCallSid: params.CallSid ?? null, toNumber: params.To ?? null });
  const action = new URL(publicUrl(req));
  action.pathname = "/api/webhooks/twilio/voice/turn";
  action.search = `?callId=${encodeURIComponent(callId)}`;
  return twiml(getVoiceProvider().answerInboundCall({ greeting: reply, gatherActionUrl: action.toString(), recordingEnabled: true }));
}
