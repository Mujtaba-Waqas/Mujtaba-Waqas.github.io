import { Check, FlaskConical, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { manualPaymentConfig } from "@/lib/marketing";
import { PLANS } from "@/lib/plans";
import { providerStatus } from "@/lib/providers";
import { cn } from "@/lib/utils";
import { CheckoutButton, PortalButton } from "./billing-client";

export const metadata = { title: "Billing" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAuth("billing:manage");
  const sp = await searchParams;
  const sub = await db.subscription.findUnique({ where: { organizationId: auth.orgId } });
  const usage = sub ? await db.usageRecord.groupBy({ by: ["type"], where: { organizationId: auth.orgId, occurredAt: { gte: sub.currentPeriodStart } }, _sum: { quantity: true } }) : [];
  const stripeLive = providerStatus().stripe.configured;
  const manual = manualPaymentConfig();
  const manualBilling = !stripeLive && manual.enabled;
  const org = manualBilling ? await db.organization.findUnique({ where: { id: auth.orgId }, select: { name: true } }) : null;
  const current = sub?.plan ?? "GROWTH";
  const plan = PLANS[current];
  const used = (t: string) => usage.find((u) => u.type === t)?._sum.quantity ?? 0;

  return (
    <>
      <PageHeader title="Billing" description="Simple monthly plans. No setup fees, cancel anytime." actions={manualBilling ? undefined : <PortalButton />} />
      {manualBilling ? (
        <Card className="mb-4 p-4">
          <div className="flex items-start gap-3">
            <Wallet className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="space-y-1 text-sm text-ink-2">
              <p className="font-semibold text-ink">How to pay</p>
              <p>
                Send <strong className="text-ink">${plan.priceMonthly}</strong> each month
                {manual.venmoHandle ? <> by Venmo to <strong className="text-ink">{manual.venmoHandle}</strong></> : null}
                {manual.venmoHandle && manual.zelle ? " or" : null}
                {manual.zelle ? <> by Zelle to <strong className="text-ink">{manual.zelle}</strong></> : null}.
              </p>
              <p>
                Put <strong className="text-ink">CallFlow – {org?.name ?? "your company name"}</strong> in the payment note. Changing plans below updates the amount; no card is stored here.
              </p>
            </div>
          </div>
        </Card>
      ) : !stripeLive ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="note">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Demo billing — non-production.</strong> Stripe keys are not configured, so choosing a plan only changes it locally. No card is collected and nothing is charged. Set the STRIPE_* variables to enable real Checkout and the Customer Portal.
          </span>
        </div>
      ) : null}
      {sp.checkout === "success" || sp.demo_plan ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Plan updated{sp.demo_plan ? " (demo)" : ""}.</div> : null}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted">Current plan</p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {plan.name} · ${plan.priceMonthly}/mo {sub?.isDemo && !manualBilling ? <Badge tone="amber">Demo</Badge> : null}
          </p>
          <p className="text-xs text-muted">{sub ? `Period ${formatDate(sub.currentPeriodStart)} – ${formatDate(sub.currentPeriodEnd)}` : "No subscription"}</p>
        </Card>
        {[
          ["Voice minutes", used("VOICE_MINUTES"), plan.voiceMinutes],
          ["SMS segments", used("SMS_SEGMENTS"), plan.smsSegments],
        ].map(([label, u, limit]) => (
          <Card key={label as string} className="p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold text-ink tabular">
              {formatNumber(u as number)} <span className="text-sm font-normal text-muted">/ {formatNumber(limit as number)}</span>
            </p>
            <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={u as number} aria-valuemax={limit as number} aria-label={`${label} used`}>
              <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, ((u as number) / (limit as number)) * 100)}%` }} />
            </div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((key) => {
          const p = PLANS[key];
          const isCurrent = key === current;
          return (
            <Card key={key} className={cn("flex flex-col", p.highlight && "border-accent ring-1 ring-accent")}>
              <CardHeader>
                <CardTitle className="text-base">{p.name}</CardTitle>
                {p.highlight ? <Badge tone="teal">Most popular</Badge> : null}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <p className="text-3xl font-semibold text-ink">
                  ${p.priceMonthly}
                  <span className="text-sm font-normal text-muted">/month</span>
                </p>
                <ul className="my-4 flex-1 space-y-2 text-sm text-ink-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" /> {f}
                    </li>
                  ))}
                </ul>
                <CheckoutButton plan={key} current={isCurrent} highlight={Boolean(p.highlight)} demo={!stripeLive && !manualBilling} manual={manualBilling} />
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted">Usage beyond plan limits is billed at published overage rates when live billing is enabled. Carrier fees for SMS/voice are passed through at cost.</p>
    </>
  );
}
