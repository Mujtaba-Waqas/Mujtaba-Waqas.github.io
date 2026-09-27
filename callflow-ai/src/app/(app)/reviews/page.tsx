import { AlertTriangle, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";
import { RunAutomationButton } from "@/components/app/run-automation-button";
import { StatCard } from "@/components/app/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { customerName, formatDateTime } from "@/lib/format";
import { REVIEW_STATUS } from "@/lib/labels";
import { loadOrg, toTenantContext } from "@/lib/services/context";
import { ResolveReview, SendReviewLink } from "./review-actions";

export const metadata = { title: "Reviews" };

export default async function ReviewsPage() {
  const auth = await requireAuth("reviews:manage");
  const { org, settings } = await loadOrg(toTenantContext(auth));
  const reviews = await db.review.findMany({
    where: { organizationId: auth.orgId },
    orderBy: [{ createdAt: "desc" }],
    include: { customer: true, appointment: { include: { technician: true } }, assignedEmployee: true },
  });
  const responded = reviews.filter((r) => r.respondedAt);
  const rated = reviews.filter((r) => r.rating);
  const avg = rated.length ? rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length : 0;
  const flagged = reviews.filter((r) => r.status === "NEGATIVE_FLAGGED");

  return (
    <>
      <PageHeader
        title="Reviews"
        description="After each completed job, CallFlow checks in with the customer. Happy customers get your Google review link; unhappy customers go straight to the owner."
        actions={<RunAutomationButton automationKey="REVIEW_REQUESTS" label="Send satisfaction checks now" size="md" />}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Satisfaction checks sent" value={String(reviews.length)} icon={Star} hint="Completed jobs" />
        <StatCard label="Response rate" value={`${reviews.length ? Math.round((responded.length / reviews.length) * 100) : 0}%`} icon={Star} hint={`${responded.length} replied`} />
        <StatCard label="Average rating" value={avg ? avg.toFixed(1) : "—"} icon={Star} hint="Private 1–5 replies" />
        <StatCard label="Needs owner follow-up" value={String(flagged.length)} icon={AlertTriangle} hint="Negative feedback" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Feedback & review requests</CardTitle>
          </CardHeader>
          {reviews.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>Customer</TH>
                  <TH>Job</TH>
                  <TH>Status</TH>
                  <TH>Response</TH>
                  <TH className="text-right">Action</TH>
                </tr>
              </THead>
              <tbody>
                {reviews.map((r) => (
                  <TR key={r.id} className={r.status === "NEGATIVE_FLAGGED" ? "bg-red-50/40" : undefined}>
                    <TD>
                      <Link href={`/inbox?customer=${r.customerId}`} className="font-medium text-ink hover:underline">
                        {customerName(r.customer)}
                      </Link>
                      <p className="text-xs text-muted">{formatDateTime(r.satisfactionSentAt, org.timezone)}</p>
                    </TD>
                    <TD className="text-xs">
                      {r.appointment ? (
                        <>
                          {r.appointment.title}
                          <span className="block text-muted">{r.appointment.technician?.name}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      <Badge tone={REVIEW_STATUS[r.status].tone}>{REVIEW_STATUS[r.status].label}</Badge>
                      {r.assignedEmployee && r.status === "NEGATIVE_FLAGGED" ? <p className="mt-1 text-[11px] text-muted">Assigned: {r.assignedEmployee.name}</p> : null}
                    </TD>
                    <TD className="max-w-[280px]">
                      {r.rating ? <span className="mr-1 font-semibold text-ink">{r.rating}/5</span> : null}
                      <span className="text-xs">{r.response ?? <span className="text-muted">No reply yet</span>}</span>
                      {r.notes ? <p className="mt-1 text-[11px] text-emerald-700">Resolution: {r.notes}</p> : null}
                    </TD>
                    <TD className="text-right">
                      {r.status === "NEGATIVE_FLAGGED" ? <ResolveReview id={r.id} customer={customerName(r.customer)} /> : null}
                      {r.status === "POSITIVE" || (r.status === "RESOLVED" && !r.reviewRequestedAt) ? <SendReviewLink id={r.id} /> : null}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={Star} title="No review activity yet" description="Complete an appointment and run the Review Requests automation." />
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-accent" /> Review compliance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-ink-2">
              <p>CallFlow never writes, submits, or incentivizes reviews. It only sends your public review link — customers post in their own words.</p>
              <p>Review templates that mention discounts, gift cards or rewards are rejected automatically (FTC rule on consumer reviews, 16 CFR Part 465).</p>
              <p className="rounded-md bg-amber-50 p-2.5 text-xs text-amber-900">
                Current policy: <strong>{settings.reviews.policy === "positive_only" ? "review link sent after positive feedback" : "review link offered to every customer"}</strong>. Google&apos;s policies discourage selectively soliciting only positive reviews (“review gating”). For the most conservative setup, switch to “all customers” in Settings.
              </p>
              <p className="text-xs text-muted">Review link: {org.googleReviewUrl ?? "not configured"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>How to demo</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-ink-2">
              <ol className="list-decimal space-y-1 pl-5">
                <li>Find the “Awaiting reply” row (Will Bingham).</li>
                <li>Open the Inbox and use “Simulate customer reply”.</li>
                <li>Reply “5” → the review link is sent. Reply “2 — still broken” → routed to Olivia and the conversation switches to human takeover.</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
