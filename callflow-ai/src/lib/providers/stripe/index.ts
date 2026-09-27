import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider } from "../types";

/**
 * Stripe adapter using the REST API directly. Active only when
 * STRIPE_SECRET_KEY and the three STRIPE_PRICE_* ids are configured.
 */
export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_STARTER && process.env.STRIPE_PRICE_GROWTH && process.env.STRIPE_PRICE_PRO);
}

async function stripePost(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !json.url) throw new Error(json.error?.message ?? `Stripe HTTP ${res.status}`);
  return json.url;
}

/** Stripe-Signature: t=timestamp,v1=hex(HMAC_SHA256(secret, `${t}.${payload}`)); 5-minute tolerance. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  const v1s = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (!t || !v1s.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"));
  return v1s.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export function createStripePayments(): PaymentProvider {
  const priceFor = { STARTER: process.env.STRIPE_PRICE_STARTER!, GROWTH: process.env.STRIPE_PRICE_GROWTH!, PRO: process.env.STRIPE_PRICE_PRO! };
  return {
    name: "Stripe",
    mode: "live",
    async createCheckoutSession({ organizationId, plan, customerEmail, stripeCustomerId, successUrl, cancelUrl }) {
      const params: Record<string, string> = {
        mode: "subscription",
        "line_items[0][price]": priceFor[plan],
        "line_items[0][quantity]": "1",
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: organizationId,
        "metadata[organizationId]": organizationId,
        "subscription_data[metadata][organizationId]": organizationId,
      };
      if (stripeCustomerId) params.customer = stripeCustomerId;
      else if (customerEmail) params.customer_email = customerEmail;
      return { url: await stripePost("checkout/sessions", params), simulated: false };
    },
    async createPortalSession({ stripeCustomerId, returnUrl }) {
      if (!stripeCustomerId) throw new Error("No Stripe customer on file yet — start a subscription first.");
      return { url: await stripePost("billing_portal/sessions", { customer: stripeCustomerId, return_url: returnUrl }), simulated: false };
    },
    verifyWebhook(payload, signature) {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret || !verifyStripeSignature(payload, signature, secret)) return { ok: false };
      try {
        return { ok: true, event: JSON.parse(payload) };
      } catch {
        return { ok: false };
      }
    },
  };
}
