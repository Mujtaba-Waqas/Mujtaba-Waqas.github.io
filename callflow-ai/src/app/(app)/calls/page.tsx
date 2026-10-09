import type { CallOutcome, CallStatus, Prisma } from "@prisma/client";
import { AlertTriangle, ArrowRightLeft, Mic, MicOff, Moon, PhoneCall, PhoneIncoming } from "lucide-react";
import Link from "next/link";
import { FilterBar } from "@/components/app/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DemoTag, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime, formatDuration, formatPhone } from "@/lib/format";
import { CALL_OUTCOME, CALL_STATUS } from "@/lib/labels";

export const metadata = { title: "Calls" };

export default async function CallsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAuth("calls:view");
  const sp = await searchParams;
  const where: Prisma.CallWhereInput = { organizationId: auth.orgId };
  if (sp.status && sp.status in CALL_STATUS) where.status = sp.status as CallStatus;
  if (sp.outcome && sp.outcome in CALL_OUTCOME) where.outcome = sp.outcome as CallOutcome;
  if (sp.flag === "emergency") where.isEmergency = true;
  if (sp.flag === "after_hours") where.isAfterHours = true;
  if (sp.flag === "transferred") where.transferredTo = { not: null };
  if (sp.q) {
    const digits = sp.q.replace(/\D/g, "");
    where.OR = [
      { callerName: { contains: sp.q, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ fromNumber: { contains: digits } }] : []),
      { transcripts: { some: { text: { contains: sp.q, mode: "insensitive" } } } },
    ];
  }
  const calls = await db.call.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 100,
    include: { lead: { select: { id: true, requestedService: true } }, appointment: { select: { id: true } } },
  });
  const org = await db.organization.findUniqueOrThrow({ where: { id: auth.orgId }, select: { timezone: true } });

  return (
    <>
      <PageHeader
        title="Calls"
        description="Every inbound call, answered by your AI receptionist or your team — with transcripts, structured summaries and outcomes."
        actions={
          <Button asChild variant="accent">
            <Link href="/calls/simulator">
              <PhoneCall /> Open call simulator
            </Link>
          </Button>
        }
      />
      <FilterBar
        q={sp.q}
        placeholder="Search caller, number, or transcript…"
        selects={[
          { name: "status", label: "Status", value: sp.status, options: Object.entries(CALL_STATUS).map(([value, m]) => ({ value, label: m.label })) },
          { name: "outcome", label: "Outcome", value: sp.outcome, options: Object.entries(CALL_OUTCOME).map(([value, m]) => ({ value, label: m.label })) },
          { name: "flag", label: "Flag", value: sp.flag, options: [{ value: "emergency", label: "Emergency" }, { value: "after_hours", label: "After hours" }, { value: "transferred", label: "Transferred" }] },
        ]}
      />
      <Card>
        {calls.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Caller</TH>
                <TH>When</TH>
                <TH>Status</TH>
                <TH>Outcome</TH>
                <TH className="hidden md:table-cell">Summary</TH>
                <TH className="text-right">Duration</TH>
              </tr>
            </THead>
            <tbody>
              {calls.map((c) => {
                const summary = c.summary as { headline?: string } | null;
                return (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/calls/${c.id}`} className="block font-medium text-ink hover:underline">
                        {c.callerName ?? formatPhone(c.fromNumber)}
                      </Link>
                      <span className="text-xs text-muted">{formatPhone(c.fromNumber)}</span>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {formatDateTime(c.startedAt, org.timezone)}
                      <div className="mt-0.5 flex gap-1">
                        {c.isAfterHours ? (
                          <Badge tone="violet">
                            <Moon /> After hours
                          </Badge>
                        ) : null}
                        {c.isSimulated ? <DemoTag /> : null}
                      </div>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={CALL_STATUS[c.status].tone}>{CALL_STATUS[c.status].label}</Badge>
                        {c.isEmergency ? (
                          <Badge tone="red">
                            <AlertTriangle /> Emergency
                          </Badge>
                        ) : null}
                        {c.transferredTo ? (
                          <Badge tone="violet">
                            <ArrowRightLeft /> Handoff
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                        {c.recordingStatus === "RECORDED" ? <Mic className="size-3" /> : <MicOff className="size-3" />}
                        {c.recordingStatus === "RECORDED" ? "Recorded" : c.isSimulated ? "Simulated · no audio" : c.recordingStatus.toLowerCase().replace("_", " ")}
                        {" · "}
                        {c.answeredBy === "AI" ? "AI answered" : c.answeredBy === "STAFF" ? "Staff answered" : "Unanswered"}
                      </p>
                    </TD>
                    <TD>{c.outcome ? <Badge tone={CALL_OUTCOME[c.outcome].tone}>{CALL_OUTCOME[c.outcome].label}</Badge> : <span className="text-xs text-muted">—</span>}</TD>
                    <TD className="hidden max-w-[360px] md:table-cell">
                      <p className="truncate text-sm">{summary?.headline ?? (c.status === "MISSED" ? (c.textBackSentAt ? "Missed — recovered by automatic text-back" : "Missed — no text-back yet") : "—")}</p>
                      <p className="text-xs text-muted">
                        {c.lead ? (
                          <Link className="hover:underline" href={`/leads/${c.lead.id}`}>
                            Lead: {c.lead.requestedService}
                          </Link>
                        ) : null}
                        {c.appointment ? " · Appointment booked" : ""}
                      </p>
                    </TD>
                    <TD className="text-right tabular">{formatDuration(c.durationSeconds)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={PhoneIncoming} title="No calls match these filters" description="Try clearing filters, or run a simulated call to see the AI receptionist in action." action={<Button asChild variant="outline"><Link href="/calls">Clear filters</Link></Button>} />
        )}
      </Card>
    </>
  );
}
