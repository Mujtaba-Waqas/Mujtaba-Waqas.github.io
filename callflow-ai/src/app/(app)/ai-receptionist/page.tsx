import { AlertTriangle, ArrowRightLeft, Clock, PhoneCall, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { providerStatus } from "@/lib/providers";
import { loadOrg, toTenantContext } from "@/lib/services/context";
import { ReceptionistForm, TestPanel } from "./receptionist-client";

export const metadata = { title: "AI Receptionist" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ReceptionistPage() {
  const auth = await requireAuth("receptionist:manage");
  const { org, settings } = await loadOrg(toTenantContext(auth));
  const kbCounts = await db.knowledgeDocument.groupBy({ by: ["category"], where: { organizationId: auth.orgId, isActive: true }, _count: true });
  const ps = providerStatus();
  const hours = settings.businessHours.map((h) => `${DAYS[h.day]} ${h.open}–${h.close}`).join(", ");

  return (
    <>
      <PageHeader
        title="AI Receptionist"
        description="How your virtual front office greets callers, what it's allowed to say, and when it hands off to a person."
        actions={
          <Button asChild variant="accent">
            <Link href="/calls/simulator">
              <PhoneCall /> Test with a call
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ReceptionistForm initial={settings.receptionist} businessName={org.name} kbCounts={Object.fromEntries(kbCounts.map((k) => [k.category, k._count]))} />
        </div>
        <div className="space-y-4">
          <TestPanel engine={ps.openai.configured ? "OpenAI (grounded in your knowledge base)" : "Deterministic rules + knowledge-base retrieval (demo)"} />
          <Card>
            <CardHeader>
              <CardTitle>Built-in rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-ink-2">
              <p className="flex gap-2">
                <Clock className="mt-0.5 size-4 shrink-0 text-muted" />
                <span>
                  <strong className="text-ink">Business hours:</strong> {hours}. After hours the AI uses the after-hours greeting, books emergencies with the on-call tech, and flags other callers for an 8:00 AM callback.{" "}
                  <Link href="/settings#hours" className="text-brand hover:underline">
                    Edit hours
                  </Link>
                </span>
              </p>
              <p className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" />
                <span>
                  <strong className="text-ink">Emergencies:</strong> {settings.emergency.policy}
                </span>
              </p>
              <p className="flex gap-2">
                <ArrowRightLeft className="mt-0.5 size-4 shrink-0 text-muted" />
                <span>
                  <strong className="text-ink">Transfers:</strong> any caller who asks for a person is warm-transferred to {settings.receptionist.transferNumber}
                  {settings.receptionist.transferDuringHoursOnly ? " during business hours" : ""}. Gas odors and CO alarms always get safety instructions first.
                </span>
              </p>
              <p className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>
                  <strong className="text-ink">Pricing:</strong> the AI only quotes prices that exist in a Pricing or Financing knowledge-base entry. Otherwise it explains that pricing is confirmed on site.
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
