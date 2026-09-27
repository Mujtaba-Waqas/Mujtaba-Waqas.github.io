import { createHmac, timingSafeEqual } from "node:crypto";
import { demoVoice } from "../demo";
import type { SmsProvider, VoiceProvider } from "../types";

/**
 * Twilio adapter (REST over fetch — no SDK dependency). Active only when
 * TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER are set AND
 * SMS_LIVE_SENDING=true, so configuring keys alone never sends real texts.
 */
export function twilioConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}

export function createTwilioSms(): SmsProvider {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  return {
    name: "Twilio",
    mode: "live",
    async send({ to, from, body }) {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; status?: string };
      if (!res.ok || !json.sid) return { providerSid: "", status: "FAILED", simulated: false, error: json.message ?? `Twilio HTTP ${res.status}` };
      return { providerSid: json.sid, status: "QUEUED", simulated: false };
    },
  };
}

/** Twilio request validation: HMAC-SHA1 of URL + sorted POST params, base64. */
export function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function verifyTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | null) {
  if (!signature) return false;
  const expected = Buffer.from(computeTwilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function createTwilioVoice(): VoiceProvider {
  const token = process.env.TWILIO_AUTH_TOKEN!;
  return {
    ...demoVoice,
    name: "Twilio Voice",
    mode: "live",
    answerInboundCall(input) {
      // Recording is started via the Twilio call-recording API/console setting; see README for consent requirements.
      return demoVoice.answerInboundCall(input);
    },
    verifyWebhookSignature({ url, params, signature }) {
      return verifyTwilioSignature(token, url, params, signature);
    },
  };
}
