import { CheckCircle2, CircleDashed, FlaskConical, KeyRound, Plug, Webhook } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { INTEGRATIONS } from "@/lib/integrations-catalog";
import { providerStatus } from "@/lib/providers";

export const metadata = { title: "Integrations" };

const WEBHOOKS = [
  ["POST", "/api/webhooks/twilio/voice", "Twilio → inbound call (returns TwiML)"],
  ["POST", "/api/webhooks/twilio/voice/turn", "Twilio → speech result for each caller turn"],
  ["POST", "/api/webhooks/twilio/sms", "Twilio → inbound SMS (STOP/START/HELP, replies)"],
  ["POST", "/api/webhooks/stripe", "Stripe → subscription lifecycle events"],
  ["POST", "/api/public/leads", "Website form → new lead (rate-limited, consent required)"],
  ["POST", "/api/cron/automations", "Scheduler → run due automations (Bearer CRON_SECRET)"],
];

export default async function IntegrationsPage() {
  const auth = await requireAuth("integrations:manage");
  const rows = await db.integration.findMany({ where: { organizationId: auth.orgId } });
  const ps = providerStatus();
  const live: Record<string, boolean> = { TWILIO: ps.twilio.configured, OPENAI: ps.openai.configured, GOOGLE_CALENDAR: ps.google.configured, STRIPE: ps.stripe.configured };
  const base = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <>
      <PageHeader title="Integrations" description="Connect the tools you already use. Credentials are read from server environment variables only — never stored in the browser or the database." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {INTEGRATIONS.map((i) => {
          const row = rows.find((r) => r.provider === i.provider);
          const isLive = live[i.provider];
          const config = (row?.config ?? {}) as Record<string, string>;
          return (
            <Card key={i.provider} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-ink-2">
                    <Plug className="size-4" />
                  </span>
                  <div>
                    <CardTitle>{i.name}</CardTitle>
                    <p className="text-xs text-muted">{i.category}</p>
                  </div>
                </div>
                {!i.adapter ? (
                  <Badge>Coming soon</Badge>
                ) : isLive ? (
                  <Badge tone="green">
                    <CheckCircle2 /> Live
                  </Badge>
                ) : (
                  <Badge tone="amber">
                    <FlaskConical /> Demo mode
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 text-sm">
                <p className="text-ink-2">{i.description}</p>
                {i.adapter ? (
                  <>
                    <p className="text-xs text-muted">
                      {isLive
                        ? i.provider === "TWILIO" && !ps.twilio.liveSms
                          ? "Credentials found. Outbound SMS stays simulated until SMS_LIVE_SENDING=true."
                          : "Credentials found in the server environment."
                        : i.provider === "TWILIO"
                          ? `Using a simulated number (${config.phoneNumber ?? "(801) 555-0198"}). No real calls or texts are placed.`
                          : i.provider === "OPENAI"
                            ? "Using the deterministic rules engine + knowledge-base retrieval."
                            : i.provider === "GOOGLE_CALENDAR"
                              ? "Using the internal CallFlow calendar."
                              : "Using demo billing — plan changes are local and non-production."}
                    </p>
                    <div className="mt-auto rounded-lg bg-slate-50 p-2.5">
                      <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        <KeyRound className="size-3" /> Environment variables
                      </p>
                      <ul className="space-y-0.5 font-mono text-[11px] text-ink-2">
                        {i.env.map((e) => (
                          <li key={e} className="flex items-center gap-1">
                            {isLive ? <CheckCircle2 className="size-3 text-emerald-600" /> : <CircleDashed className="size-3 text-slate-400" />} {e}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <p className="mt-auto text-xs text-muted">On the roadmap (Phase 3). The provider registry and integration table are ready for a new adapter.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="size-4" /> Webhook endpoints
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-line text-sm">
            {WEBHOOKS.map(([m, path, desc]) => (
              <li key={path} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3">
                <Badge tone="blue">{m}</Badge>
                <code className="font-mono text-xs text-ink">
                  {base}
                  {path}
                </code>
                <span className="text-xs text-muted sm:ml-auto">{desc}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Twilio requests are verified with X-Twilio-Signature and Stripe with Stripe-Signature whenever those credentials are configured. All public endpoints are rate-limited.</p>
        </CardContent>
      </Card>
    </>
  );
}
