import "server-only";
import { NextResponse } from "next/server";
import { appUrl } from "./app-url";
import { db } from "./db";
import { toE164 } from "./format";
import { getVoiceProvider } from "./providers";
import { twilioConfigured } from "./providers/twilio";
import { clientIp, rateLimit } from "./rate-limit";

/** Resolve the tenant that owns a phone number. Falls back to DEFAULT_ORG_SLUG for single-tenant setups. */
export async function resolveOrgByNumber(to: string | null) {
  const e164 = toE164(to);
  if (e164) {
    const org = await db.organization.findFirst({ where: { phone: e164 } });
    if (org) return org;
  }
  const slug = process.env.DEFAULT_ORG_SLUG;
  return slug ? db.organization.findUnique({ where: { slug } }) : null;
}

export function publicUrl(req: Request) {
  const u = new URL(req.url);
  const base = (process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL) ? appUrl() : `${u.protocol}//${u.host}`;
  return `${base.replace(/\/$/, "")}${u.pathname}${u.search}`;
}

export function limitOr429(req: Request, bucket: string, limit = 60, windowMs = 60_000) {
  const r = rateLimit(`${bucket}:${clientIp(req.headers)}`, limit, windowMs);
  return r.ok ? null : NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(Math.ceil((r.resetAt - Date.now()) / 1000)) } });
}

/** Parse a Twilio form POST and verify its signature when Twilio is configured. */
export async function readTwilioRequest(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));
  const valid = twilioConfigured()
    ? getVoiceProvider().verifyWebhookSignature({ url: publicUrl(req), params, signature: req.headers.get("x-twilio-signature") })
    : process.env.NODE_ENV !== "production" || process.env.ALLOW_UNSIGNED_WEBHOOKS === "true";
  return { params, valid };
}

export function twiml(xml: string, status = 200) {
  return new NextResponse(xml, { status, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

/** Record a provider event id; returns false when it was already processed (idempotency). */
export async function firstDelivery(provider: string, externalId: string | undefined | null) {
  if (!externalId) return true;
  try {
    await db.webhookEvent.create({ data: { provider, externalId } });
    return true;
  } catch {
    return false;
  }
}
