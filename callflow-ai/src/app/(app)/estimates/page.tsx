import type { EstimateStatus, Prisma } from "@prisma/client";
import { FileText, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { FilterBar } from "@/components/app/filter-bar";
import { RunAutomationButton } from "@/components/app/run-automation-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { customerName, formatCents, formatDate } from "@/lib/format";
import { ESTIMATE_STATUS } from "@/lib/labels";

export const metadata = { title: "Estimates" };

export default async function EstimatesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAuth("estimates:write");
  const sp = await searchParams;
  const where: Prisma.EstimateWhereInput = { organizationId: auth.orgId };
  if (sp.status && sp.status in ESTIMATE_STATUS) where.status = sp.status as EstimateStatus;
  if (sp.status === "open") where.status = { in: ["SENT", "VIEWED"] };
  if (sp.q) where.OR = [{ number: { contains: sp.q, mode: "insensitive" } }, { title: { contains: sp.q, mode: "insensitive" } }, { customer: { lastName: { contains: sp.q, mode: "insensitive" } } }, { customer: { firstName: { contains: sp.q, mode: "insensitive" } } }];
  const [estimates, all] = await Promise.all([
    db.estimate.findMany({ where, orderBy: { createdAt: "desc" }, include: { customer: true, service: true, assignedEmployee: true, followups: { select: { status: true, stage: true } } } }),
    db.estimate.findMany({ where: { organizationId: auth.orgId }, select: { status: true, totalCents: true, recoveredByAutomation: true } }),
  ]);
  const sumOf = (f: (e: (typeof all)[number]) => boolean) => all.filter(f).reduce((s, e) => s + e.totalCents, 0);
  const open = sumOf((e) => e.status === "SENT" || e.status === "VIEWED");
  const won = sumOf((e) => e.status === "ACCEPTED");
  const recovered = sumOf((e) => e.status === "ACCEPTED" && e.recoveredByAutomation);
  const decided = all.filter((e) => ["ACCEPTED", "DECLINED", "EXPIRED"].includes(e.status));
  const closeRate = decided.length ? all.filter((e) => e.status === "ACCEPTED").length / decided.length : 0;

  return (
    <>
      <PageHeader
        title="Estimates"
        description="Track every quote and let CallFlow follow up on day 1, 3 and 7 until the customer decides."
        actions={
          <>
            <RunAutomationButton automationKey="ESTIMATE_RECOVERY" label="Run automation now" size="md" />
            <Button asChild>
              <Link href="/estimates/new">
                <Plus /> New estimate
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Outstanding", formatCents(open), "Sent or viewed, awaiting decision"],
          ["Won", formatCents(won), "All accepted estimates"],
          ["Recovered by automation", formatCents(recovered), "Accepted after ≥1 automated follow-up (attributed)"],
          ["Close rate", `${Math.round(closeRate * 100)}%`, `${decided.length} decided estimates`],
        ].map(([label, value, hint], i) => (
          <Card key={label} className={i === 2 ? "border-teal-200 bg-accent-50 p-4" : "p-4"}>
            <p className="flex items-center gap-1 text-xs text-muted">
              {i === 2 ? <Sparkles className="size-3.5 text-accent" /> : null}
              {label}
            </p>
            <p className="mt-1 text-xl font-semibold text-ink tabular">{value}</p>
            <p className="text-[11px] text-muted">{hint}</p>
          </Card>
        ))}
      </div>
      <FilterBar
        q={sp.q}
        placeholder="Search estimate #, title, customer…"
        selects={[{ name: "status", label: "Status", value: sp.status, options: [{ value: "open", label: "Open (sent/viewed)" }, ...Object.entries(ESTIMATE_STATUS).map(([value, m]) => ({ value, label: m.label }))] }]}
      />
      <Card>
        {estimates.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Estimate</TH>
                <TH>Customer</TH>
                <TH className="hidden lg:table-cell">Service</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH className="hidden md:table-cell">Sent</TH>
                <TH>Follow-up</TH>
                <TH className="hidden xl:table-cell">Assigned</TH>
                <TH className="hidden xl:table-cell">Attribution</TH>
              </tr>
            </THead>
            <tbody>
              {estimates.map((e) => {
                const sent = e.followups.filter((f) => f.status === "SENT").length;
                const scheduled = e.followups.filter((f) => f.status === "SCHEDULED").length;
                return (
                  <TR key={e.id}>
                    <TD>
                      <Link href={`/estimates/${e.id}`} className="font-medium text-ink hover:underline">
                        {e.number}
                      </Link>
                      <p className="max-w-[220px] truncate text-xs text-muted">{e.title}</p>
                    </TD>
                    <TD>{customerName(e.customer)}</TD>
                    <TD className="hidden lg:table-cell">{e.service?.name ?? "—"}</TD>
                    <TD className="text-right font-medium text-ink tabular">{formatCents(e.totalCents)}</TD>
                    <TD>
                      <Badge tone={ESTIMATE_STATUS[e.status].tone}>{ESTIMATE_STATUS[e.status].label}</Badge>
                    </TD>
                    <TD className="hidden whitespace-nowrap md:table-cell">{formatDate(e.sentAt)}</TD>
                    <TD className="whitespace-nowrap text-xs">
                      {e.followups.length ? (
                        <>
                          <span className="font-medium text-ink">Stage {e.followupStage}/3</span>
                          <span className="block text-muted">{e.automationPaused ? "Paused" : e.automationStopReason ? `Stopped · ${e.automationStopReason}` : scheduled ? `${scheduled} scheduled` : `${sent} sent`}</span>
                        </>
                      ) : (
                        <span className="text-muted">{e.status === "DRAFT" ? "Starts when sent" : "—"}</span>
                      )}
                    </TD>
                    <TD className="hidden xl:table-cell">{e.assignedEmployee?.name ?? "—"}</TD>
                    <TD className="hidden xl:table-cell">{e.recoveredByAutomation ? <Badge tone="teal">Recovered · {formatCents(e.totalCents, { compact: true })}</Badge> : e.status === "ACCEPTED" ? <span className="text-xs text-muted">Won directly</span> : <span className="text-xs text-muted">—</span>}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={FileText} title="No estimates yet" description="Create an estimate and CallFlow will follow up automatically." action={<Button asChild><Link href="/estimates/new">New estimate</Link></Button>} />
        )}
      </Card>
    </>
  );
}
