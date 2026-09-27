import { ArrowLeft, CalendarPlus, FilePlus2, MessageSquare, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/app/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValue, PageHeader } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { customerName, formatCents, formatDate, formatDateTime, formatDuration, formatPhone } from "@/lib/format";
import { APPT_STATUS, CALL_OUTCOME, ESTIMATE_STATUS, LEAD_STATUS, REVIEW_STATUS } from "@/lib/labels";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("customers:write");
  const { id } = await params;
  const c = await db.customer.findFirst({
    where: { id, organizationId: auth.orgId },
    include: {
      leads: { orderBy: { createdAt: "desc" } },
      appointments: { orderBy: { startAt: "desc" }, include: { technician: true } },
      estimates: { orderBy: { createdAt: "desc" } },
      calls: { orderBy: { startedAt: "desc" }, take: 20 },
      reviews: { orderBy: { createdAt: "desc" } },
      conversation: { include: { messages: { orderBy: { createdAt: "desc" }, take: 5 } } },
      leadEvents: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!c) notFound();
  const org = await db.organization.findUniqueOrThrow({ where: { id: auth.orgId }, select: { timezone: true } });
  const tz = org.timezone;
  const lifetime = c.appointments.filter((a) => a.status === "COMPLETED").reduce((s, a) => s + (a.estimatedValueCents ?? 0), 0) + c.estimates.filter((e) => e.status === "ACCEPTED").reduce((s, e) => s + e.totalCents, 0);

  return (
    <>
      <Link href="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Customers
      </Link>
      <PageHeader
        title={customerName(c)}
        eyebrow={
          <span className="flex gap-1.5">
            {c.hasMaintenancePlan ? <Badge tone="teal">Comfort Club</Badge> : null}
            {c.smsOptedOut ? <Badge tone="red">SMS opted out</Badge> : <Badge tone="green">SMS subscribed</Badge>}
          </span>
        }
        description={`${formatPhone(c.phone)} · ${c.address ? `${c.address}, ${c.city ?? ""} ${c.zip ?? ""}` : "No address"} · customer since ${formatDate(c.createdAt, tz)}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${c.phone}`}>
                <Phone /> Call
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/inbox?customer=${c.id}`}>
                <MessageSquare /> Message
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/calendar?new=1&customer=${c.id}`}>
                <CalendarPlus /> Schedule
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/estimates/new?customer=${c.id}`}>
                <FilePlus2 /> Estimate
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Lifetime value", formatCents(lifetime)],
          ["Jobs completed", String(c.appointments.filter((a) => a.status === "COMPLETED").length)],
          ["Calls", String(c.calls.length)],
          ["Open estimates", String(c.estimates.filter((e) => ["SENT", "VIEWED"].includes(e.status)).length)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold text-ink tabular">{value}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Service history</CardTitle>
            </CardHeader>
            {c.appointments.length ? (
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Job</TH>
                    <TH>Technician</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Value</TH>
                  </tr>
                </THead>
                <tbody>
                  {c.appointments.map((a) => (
                    <TR key={a.id}>
                      <TD className="whitespace-nowrap">{formatDateTime(a.startAt, tz)}</TD>
                      <TD>
                        {a.title} {a.isEmergency ? <Badge tone="red">Emergency</Badge> : null}
                      </TD>
                      <TD>{a.technician?.name ?? "—"}</TD>
                      <TD>
                        <Badge tone={APPT_STATUS[a.status].tone}>{APPT_STATUS[a.status].label}</Badge>
                      </TD>
                      <TD className="text-right tabular">{a.estimatedValueCents ? formatCents(a.estimatedValueCents) : "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            ) : (
              <CardContent className="text-sm text-muted">No appointments yet.</CardContent>
            )}
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Estimates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {c.estimates.map((e) => (
                  <Link key={e.id} href={`/estimates/${e.id}`} className="flex items-center justify-between rounded-lg border border-line p-2.5 hover:bg-slate-50">
                    <span>
                      {e.number} · {formatCents(e.totalCents)}
                      <span className="block text-xs text-muted">{e.title}</span>
                    </span>
                    <Badge tone={ESTIMATE_STATUS[e.status].tone}>{ESTIMATE_STATUS[e.status].label}</Badge>
                  </Link>
                ))}
                {!c.estimates.length ? <p className="text-muted">No estimates.</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Leads</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {c.leads.map((l) => (
                  <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center justify-between rounded-lg border border-line p-2.5 hover:bg-slate-50">
                    <span>
                      {l.requestedService}
                      <span className="block text-xs text-muted">{formatDate(l.createdAt, tz)}</span>
                    </span>
                    <Badge tone={LEAD_STATUS[l.status].tone}>{LEAD_STATUS[l.status].label}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Calls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {c.calls.map((call) => (
                <Link key={call.id} href={`/calls/${call.id}`} className="flex items-center justify-between rounded-lg border border-line p-2.5 hover:bg-slate-50">
                  <span>
                    {formatDateTime(call.startedAt, tz)} · {formatDuration(call.durationSeconds)}
                    <span className="block text-xs text-muted">{(call.summary as { headline?: string } | null)?.headline ?? call.status.toLowerCase()}</span>
                  </span>
                  {call.outcome ? <Badge tone={CALL_OUTCOME[call.outcome].tone}>{CALL_OUTCOME[call.outcome].label}</Badge> : null}
                </Link>
              ))}
              {!c.calls.length ? <p className="text-muted">No calls.</p> : null}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <KeyValue label="Phone">{formatPhone(c.phone)}</KeyValue>
                <KeyValue label="Email">{c.email ?? "—"}</KeyValue>
                <KeyValue label="SMS consent">{c.smsConsentAt ? formatDate(c.smsConsentAt, tz) : "—"}</KeyValue>
                {c.smsOptedOutAt ? <KeyValue label="Opted out">{formatDateTime(c.smsOptedOutAt, tz)}</KeyValue> : null}
                <KeyValue label="Review status">{c.reviews[0] ? <Badge tone={REVIEW_STATUS[c.reviews[0].status].tone}>{REVIEW_STATUS[c.reviews[0].status].label}</Badge> : "—"}</KeyValue>
              </dl>
              {c.notes ? <p className="mt-3 rounded-md bg-slate-50 p-2.5 text-xs text-ink-2">{c.notes}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent messages</CardTitle>
              <Link href={`/inbox?customer=${c.id}`} className="text-xs text-brand hover:underline">
                Open inbox
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {c.conversation?.messages.map((m) => (
                <div key={m.id} className={`rounded-lg px-3 py-2 text-xs ${m.direction === "OUTBOUND" ? "bg-brand-50 text-ink" : "border border-line"}`}>
                  <p className="line-clamp-3">{m.body}</p>
                  <p className="mt-1 text-[10px] text-muted">{formatDateTime(m.createdAt, tz)}</p>
                </div>
              )) ?? <p className="text-sm text-muted">No messages.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline events={c.leadEvents} tz={tz} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
