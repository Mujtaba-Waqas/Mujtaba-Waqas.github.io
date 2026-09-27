import { ArrowLeft, CalendarPlus, FilePlus2, MessageSquare, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/app/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValue, PageHeader } from "@/components/ui/misc";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { customerName, formatCents, formatDateTime, formatPhone } from "@/lib/format";
import { APPT_STATUS, CALL_OUTCOME, ESTIMATE_STATUS, LEAD_SOURCE, LEAD_STATUS, URGENCY } from "@/lib/labels";
import { toTenantContext } from "@/lib/services/context";
import { getLookups } from "@/lib/services/lookups";
import { StageStepper } from "../lead-stage-buttons";
import { LeadEditForm, NoteForm } from "./lead-forms";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("leads:write");
  const { id } = await params;
  const lead = await db.lead.findFirst({
    where: { id, organizationId: auth.orgId },
    include: {
      customer: true,
      assignedEmployee: true,
      events: { orderBy: { createdAt: "desc" } },
      calls: { orderBy: { startedAt: "desc" } },
      appointments: { orderBy: { startAt: "desc" }, include: { technician: true } },
      estimates: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead) notFound();
  const [lookups, org] = await Promise.all([getLookups(toTenantContext(auth)), db.organization.findUniqueOrThrow({ where: { id: auth.orgId }, select: { timezone: true } })]);
  const tz = org.timezone;
  const c = lead.customer;

  return (
    <>
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Pipeline
      </Link>
      <PageHeader
        title={customerName(c)}
        eyebrow={
          <span className="flex flex-wrap gap-1.5">
            <Badge tone={LEAD_STATUS[lead.status].tone}>{LEAD_STATUS[lead.status].label}</Badge>
            <Badge tone={URGENCY[lead.urgency].tone}>{URGENCY[lead.urgency].label} urgency</Badge>
            {lead.needsHumanFollowUp ? <Badge tone="amber">Needs a person</Badge> : null}
          </span>
        }
        description={`${lead.requestedService} · ${LEAD_SOURCE[lead.source]} · created ${formatDateTime(lead.createdAt, tz)}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/calendar?new=1&customer=${c.id}&lead=${lead.id}`}>
                <CalendarPlus /> Schedule
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/estimates/new?customer=${c.id}&lead=${lead.id}`}>
                <FilePlus2 /> Create estimate
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/inbox?customer=${c.id}`}>
                <MessageSquare /> Message
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <StageStepper id={lead.id} status={lead.status} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Request</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-ink">{lead.description ?? "No description provided."}</p>
              <dl className="mt-3 grid gap-x-8 sm:grid-cols-2">
                <KeyValue label="Service">{lead.requestedService}</KeyValue>
                <KeyValue label="Estimated value">{lead.estimatedValueCents ? formatCents(lead.estimatedValueCents) : "—"}</KeyValue>
                <KeyValue label="Source">{LEAD_SOURCE[lead.source]}</KeyValue>
                <KeyValue label="First response">{lead.firstResponseAt ? `${Math.max(1, Math.round((lead.firstResponseAt.getTime() - lead.createdAt.getTime()) / 1000))}s after creation` : "Not yet"}</KeyValue>
                {lead.lostReason ? <KeyValue label="Lost reason">{lead.lostReason}</KeyValue> : null}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <NoteForm id={lead.id} />
              <Timeline events={lead.events} tz={tz} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
              <Link href={`/customers/${c.id}`} className="text-xs text-brand hover:underline">
                Profile
              </Link>
            </CardHeader>
            <CardContent>
              <dl>
                <KeyValue label="Phone">
                  <a className="inline-flex items-center gap-1 text-brand hover:underline" href={`tel:${c.phone}`}>
                    <Phone className="size-3" /> {formatPhone(c.phone)}
                  </a>
                </KeyValue>
                <KeyValue label="Email">{c.email ?? "—"}</KeyValue>
                <KeyValue label="Address">{c.address ? `${c.address}, ${c.city ?? ""} ${c.zip ?? ""}` : "—"}</KeyValue>
                <KeyValue label="SMS">{c.smsOptedOut ? <Badge tone="red">Opted out</Badge> : <Badge tone="green">Subscribed</Badge>}</KeyValue>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadEditForm lead={lead} employees={lookups.employees.filter((e) => e.kind !== "TECHNICIAN")} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Related</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lead.appointments.map((a) => (
                <Link key={a.id} href={`/calendar?date=${a.startAt.toISOString().slice(0, 10)}&appt=${a.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2.5 hover:bg-slate-50">
                  <span className="truncate">
                    {a.title}
                    <span className="block text-xs text-muted">{formatDateTime(a.startAt, tz)} · {a.technician?.name ?? "Unassigned"}</span>
                  </span>
                  <Badge tone={APPT_STATUS[a.status].tone}>{APPT_STATUS[a.status].label}</Badge>
                </Link>
              ))}
              {lead.estimates.map((e) => (
                <Link key={e.id} href={`/estimates/${e.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2.5 hover:bg-slate-50">
                  <span className="truncate">
                    {e.number} · {formatCents(e.totalCents)}
                    <span className="block text-xs text-muted">{e.title}</span>
                  </span>
                  <Badge tone={ESTIMATE_STATUS[e.status].tone}>{ESTIMATE_STATUS[e.status].label}</Badge>
                </Link>
              ))}
              {lead.calls.map((call) => (
                <Link key={call.id} href={`/calls/${call.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-line p-2.5 hover:bg-slate-50">
                  <span>
                    Call · {formatDateTime(call.startedAt, tz)}
                    <span className="block text-xs text-muted">{call.isAfterHours ? "After hours · " : ""}{call.answeredBy === "AI" ? "AI answered" : "Staff"}</span>
                  </span>
                  {call.outcome ? <Badge tone={CALL_OUTCOME[call.outcome].tone}>{CALL_OUTCOME[call.outcome].label}</Badge> : null}
                </Link>
              ))}
              {!lead.appointments.length && !lead.estimates.length && !lead.calls.length ? <p className="text-muted">No calls, appointments, or estimates yet.</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
