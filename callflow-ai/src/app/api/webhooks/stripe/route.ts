import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/providers";
import { audit } from "@/lib/services/audit";
import { systemContext } from "@/lib/services/context";
import { firstDelivery, limitOr429 } from "@/lib/webhooks";

const PRICE_TO_PLAN = () => ({
  [process.env.STRIPE_PRICE_STARTER ?? "_s"]: "STARTER",
  [process.env.STRIPE_PRICE_GROWTH ?? "_g"]: "GROWTH",
  [process.env.STRIPE_PRICE_PRO ?? "_p"]: "PRO",
}) as Record<string, "STARTER" | "GROWTH" | "PRO">;

/** Stripe → subscription lifecycle. Signature is verified before anything is parsed or trusted. */
export async function POST(req: Request) {
  const limited = limitOr429(req, "stripe", 120);
  if (limited) return limited;
  const payload = await req.text();
  const { ok, event } = getPaymentProvider().verifyWebhook(payload, req.headers.get("stripe-signature"));
  if (!ok || !event) return NextResponse.json({ error: "Invalid signature or Stripe not configured" }, { status: 400 });
  if (!(await firstDelivery("stripe", event.id))) return NextResponse.json({ received: true, duplicate: true });

  const obj = event.data.object as Record<string, unknown> & { metadata?: Record<string, string> };
  const orgId = obj.metadata?.organizationId ?? (obj.client_reference_id as string | undefined);
  if (!orgId || !(await db.organization.findUnique({ where: { id: orgId } }))) return NextResponse.json({ received: true, ignored: "unknown organization" });

  if (event.type === "checkout.session.completed") {
    await db.subscription.update({ where: { organizationId: orgId }, data: { stripeCustomerId: String(obj.customer ?? ""), stripeSubscriptionId: obj.subscription ? String(obj.subscription) : null, isDemo: false, status: "ACTIVE" } });
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const items = (obj.items as { data?: { price?: { id?: string } }[] } | undefined)?.data ?? [];
    const plan = PRICE_TO_PLAN()[items[0]?.price?.id ?? ""];
    const status = String(obj.status);
    await db.subscription.update({
      where: { organizationId: orgId },
      data: {
        ...(plan ? { plan } : {}),
        status: status === "active" ? "ACTIVE" : status === "trialing" ? "TRIALING" : status === "past_due" ? "PAST_DUE" : "CANCELED",
        currentPeriodStart: obj.current_period_start ? new Date(Number(obj.current_period_start) * 1000) : undefined,
        currentPeriodEnd: obj.current_period_end ? new Date(Number(obj.current_period_end) * 1000) : undefined,
        isDemo: false,
      },
    });
  } else if (event.type === "customer.subscription.deleted") {
    await db.subscription.update({ where: { organizationId: orgId }, data: { status: "CANCELED" } });
  }
  await audit(systemContext(orgId), `billing.stripe.${event.type}`, "Subscription", null, { eventId: event.id });
  return NextResponse.json({ received: true });
}
