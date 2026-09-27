import { NextResponse } from "next/server";
import { systemContext } from "@/lib/services/context";
import { handleInboundSms } from "@/lib/services/inbound-sms";
import { firstDelivery, limitOr429, readTwilioRequest, resolveOrgByNumber, twiml } from "@/lib/webhooks";

/** Twilio → inbound SMS. Replies are sent via the SMS provider, so the TwiML response is empty. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "twilio-sms", 120);
  if (limited) return limited;
  const { params, valid } = await readTwilioRequest(req);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  const org = await resolveOrgByNumber(params.To ?? null);
  if (!org || !params.From || !params.Body) return twiml(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
  if (await firstDelivery("twilio-sms", params.MessageSid)) {
    try {
      await handleInboundSms(systemContext(org.id), { from: params.From, body: params.Body, simulated: false, providerSid: params.MessageSid ?? null });
    } catch (err) {
      console.error("[twilio-sms] processing failed", err instanceof Error ? err.message : err);
    }
  }
  return twiml(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
}
