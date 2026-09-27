import { ArrowLeft, Ban, CheckCircle2, CircleDashed, Clock, Hand, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RunAutomationButton } from "@/components/app/run-automation-button";
import { Timeline } from "@/components/app/timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoTag, KeyValue, PageHeader } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { customerName, formatCents, formatDate, formatDateTime, formatPhone } from "@/lib/format";
import { ESTIMATE_STATUS, MESSAGE_STATUS } from "@/lib/labels";
import { toTenantContext } from "@/lib/services/context";
import { getLookups } from "@/lib/services/lookups";
import { SimulateReply } from "../../inbox/inbox-client";
import { AssignSelect, EstimateActions, ManualFollowup } from "./estimate-actions";

const DAY_LABEL = ["Day 1", "Day 3", "Day 7"];

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth("estimates:write");
  const { id } = await params;
  const est = await db.estimate.findFirst({
    where: { id, organizationId: auth.orgId },
    include: {
      customer: { include: { conversation: true } },
      service: true,
      lead: true,
      items: { orderBy: { sortOrder: "asc" } },
      followups: { orderBy: { stage: "asc" }, include: { message: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!est) notFound();
  const [lookups, org, automation, events, customerMessages] = await Promise.all([
    getLookups(toTenantContext(auth)),
    db.organization.findUniqueOrThrow({ where: { id: auth.orgId }, select: { timezone: true, name: true } }),
    db.automation.findUnique({ where: { organizationId_key: { organizationId: auth.orgId, key: "ESTIMATE_RECOVERY" } }, include: { runs: { orderBy: { startedAt: "desc" }, take: 20 } } }),
    db.leadEvent.findMany({
      where: { organizationId: auth.orgId, OR: [...(est.leadId ? [{ leadId: est.leadId }] : []), { customerId: est.customerId, type: { in: ["opted_out", "opted_in", "handoff", "followup_sent", "automation_stopped", "manual_followup"] } }] },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.message.findMany({ where: { organizationId: auth.orgId, customerId: est.customerId, direction: "INBOUND", createdAt: { gte: est.sentAt ?? est.createdAt } }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const tz = org.timezone;
  const runLog = (automation?.runs ?? [])
    .flatMap((r) => (r.log as { at: string; level: string; message: string }[]).map((l) => ({ ...l, runId: r.id, trigger: r.trigger })))
    .filter((l) => l.message.includes(est.number))
    .slice(0, 12);
  const open = est.status === "SENT" || est.status === "VIEWED";
  const takeover = est.customer.conversation?.humanTakeover ?? false;
  const stopBanner = est.customer.smsOptedOut
    ? { icon: Ban, tone: "bg-red-50 text-red-800 border-red-200", text: "Customer replied STOP — all automated follow-ups are stopped and SMS is blocked." }
    : takeover && open
      ? { icon: Hand, tone: "bg-amber-50 text-amber-900 border-amber-200", text: "Customer asked for a person — automation is handed off to staff." }
      : est.automationPaused
        ? { icon: Clock, tone: "bg-slate-50 text-ink-2 border-line", text: "Automation paused manually. Resume to continue the sequence." }
        : !automation?.enabled && open
          ? { icon: Clock, tone: "bg-slate-50 text-ink-2 border-line", text: "The Estimate Recovery automation is disabled for this workspace." }
          : null;
  const defaultBody = `Hi ${est.customer.firstName}, this is ${auth.user.name.split(" ")[0]} with ${org.name}. Wanted to personally check in on estimate ${est.number} — happy to walk through options or financing. Call or text ${formatPhone("8015550198")} anytime.`;

  return (
    <>
      <Link href="/estimates" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Estimates
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            {est.number} <Badge tone={ESTIMATE_STATUS[est.status].tone}>{ESTIMATE_STATUS[est.status].label}</Badge>
            {est.recoveredByAutomation ? (
              <Badge tone="teal">
                <Sparkles /> Recovered by automation
              </Badge>
            ) : null}
          </span>
        }
        title={est.title}
        description={
          <>
            <Link href={`/customers/${est.customerId}`} className="text-brand hover:underline">
              {customerName(est.customer)}
            </Link>{" "}
            · {formatCents(est.totalCents)} · {est.service?.name ?? "No service"} · {est.sentAt ? `sent ${formatDateTime(est.sentAt, tz)}` : "not sent yet"}
          </>
        }
        actions={<EstimateActions id={est.id} status={est.status} paused={est.automationPaused} />}
      />
      {stopBanner ? (
        <div className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${stopBanner.tone}`} role="status">
          <stopBanner.icon className="size-4" /> {stopBanner.text}
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Revenue recovery sequence</CardTitle>
                <CardDescription>Automated SMS follow-ups on day 1, 3 and 7. Stops on accept, decline, STOP, a request for a person, or manual pause.</CardDescription>
              </div>
              <RunAutomationButton automationKey="ESTIMATE_RECOVERY" label="Run automation now" variant="default" />
            </CardHeader>
            <CardContent>
              {est.followups.length ? (
                <ol className="grid gap-3 md:grid-cols-3">
                  {est.followups.map((f) => {
                    const Icon = f.status === "SENT" ? CheckCircle2 : f.status === "CANCELLED" ? XCircle : CircleDashed;
                    return (
                      <li key={f.id} className={`rounded-lg border p-3 ${f.status === "SENT" ? "border-emerald-200 bg-emerald-50/40" : f.status === "CANCELLED" ? "border-line bg-slate-50" : "border-blue-200 bg-blue-50/40"}`}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-ink">
                            #{f.stage} · {DAY_LABEL[f.stage - 1] ?? `Stage ${f.stage}`}
                          </p>
                          <Icon className={`size-4 ${f.status === "SENT" ? "text-emerald-600" : f.status === "CANCELLED" ? "text-slate-400" : "text-brand"}`} />
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {f.status === "SENT" ? `Sent ${formatDateTime(f.sentAt, tz)}` : f.status === "CANCELLED" ? `Cancelled — ${f.cancelledReason}` : `Scheduled ${formatDateTime(f.scheduledFor, tz)}`}
                        </p>
                        {f.message ? (
                          <p className="mt-2 line-clamp-4 rounded-md bg-white p-2 text-xs text-ink-2 ring-1 ring-line">
                            {f.message.body}
                            {f.message.status === "SIMULATED" ? (
                              <span className="ml-1">
                                <DemoTag />
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-muted">{est.status === "DRAFT" ? "Mark the estimate as sent to schedule the Day 1 / 3 / 7 follow-ups." : "No follow-ups were scheduled for this estimate."}</p>
              )}
              {runLog.length ? (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Automation activity log</p>
                  <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                    {runLog.map((l, i) => (
                      <li key={`${l.runId}-${i}`} className="flex items-start gap-2 px-3 py-2">
                        <Badge tone={l.level === "action" ? "green" : l.level === "stop" ? "red" : "neutral"}>{l.level}</Badge>
                        <span className="flex-1 text-ink-2">{l.message}</span>
                        <span className="shrink-0 text-[11px] text-muted">
                          {formatDateTime(l.at, tz)} · {l.trigger.toLowerCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <Table>
              <THead>
                <tr>
                  <TH>Description</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Unit</TH>
                  <TH className="text-right">Total</TH>
                </tr>
              </THead>
              <tbody>
                {est.items.map((i) => (
                  <TR key={i.id}>
                    <TD>{i.description}</TD>
                    <TD className="text-right tabular">{i.quantity}</TD>
                    <TD className="text-right tabular">{formatCents(i.unitPriceCents)}</TD>
                    <TD className="text-right tabular">{formatCents(i.quantity * i.unitPriceCents)}</TD>
                  </TR>
                ))}
                <TR>
                  <TD colSpan={3} className="text-right text-muted">
                    Subtotal / tax
                  </TD>
                  <TD className="text-right tabular">
                    {formatCents(est.subtotalCents)} / {formatCents(est.taxCents)}
                  </TD>
                </TR>
                <TR>
                  <TD colSpan={3} className="text-right font-semibold text-ink">
                    Total
                  </TD>
                  <TD className="text-right font-semibold text-ink tabular">{formatCents(est.totalCents)}</TD>
                </TR>
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline events={events} tz={tz} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <KeyValue label="Amount">{formatCents(est.totalCents)}</KeyValue>
                <KeyValue label="Follow-up stage">{est.followupStage}/3</KeyValue>
                <KeyValue label="Sent">{formatDate(est.sentAt, tz)}</KeyValue>
                <KeyValue label="Expires">{formatDate(est.expiresAt, tz)}</KeyValue>
                {est.acceptedAt ? <KeyValue label="Accepted">{formatDateTime(est.acceptedAt, tz)}</KeyValue> : null}
                {est.declinedAt ? <KeyValue label="Declined">{formatDateTime(est.declinedAt, tz)}</KeyValue> : null}
                <KeyValue label="Automation">{est.automationPaused ? "Paused" : est.automationStopReason ? `Stopped: ${est.automationStopReason}` : open ? "Active" : "—"}</KeyValue>
                <KeyValue label="Attribution">
                  {est.recoveredByAutomation ? <span className="text-accent">{formatCents(est.totalCents)} recovered (attributed)</span> : est.status === "ACCEPTED" ? "Won without automation" : "Not yet won"}
                </KeyValue>
              </dl>
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-ink-2">Assigned staff member</p>
                <AssignSelect id={est.id} value={est.assignedEmployeeId} employees={lookups.employees.filter((e) => e.kind !== "TECHNICIAN")} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Manual follow-up</CardTitle>
            </CardHeader>
            <CardContent>
              <ManualFollowup id={est.id} defaultBody={defaultBody} disabled={est.customer.smsOptedOut ? "Customer has opted out of SMS. Call them instead." : null} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Messages</CardTitle>
              <Link href={`/inbox?customer=${est.customerId}`} className="text-xs text-brand hover:underline">
                Open in Inbox
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...customerMessages, ...est.messages]
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                .slice(0, 6)
                .map((m) => (
                  <div key={m.id} className={`rounded-lg px-3 py-2 text-xs ${m.direction === "OUTBOUND" ? "bg-brand-50" : "border border-line"}`}>
                    <p className="line-clamp-3 text-ink">{m.body}</p>
                    <p className="mt-1 text-[10px] text-muted">
                      {m.direction === "INBOUND" ? "Customer" : m.sender.toLowerCase()} · {formatDateTime(m.createdAt, tz)} {m.direction === "OUTBOUND" ? `· ${MESSAGE_STATUS[m.status].label}` : ""}
                    </p>
                  </div>
                ))}
              {!customerMessages.length && !est.messages.length ? <p className="text-sm text-muted">No messages yet.</p> : null}
            </CardContent>
          </Card>
          <SimulateReply customerId={est.customerId} />
        </div>
      </div>
    </>
  );
}
