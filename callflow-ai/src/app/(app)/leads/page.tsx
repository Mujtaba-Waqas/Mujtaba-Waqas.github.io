import type { LeadSource, LeadStatus, Prisma, Urgency } from "@prisma/client";
import { Moon, PhoneCall } from "lucide-react";
import Link from "next/link";
import { AddLeadDialog } from "@/components/app/add-lead-dialog";
import { FilterBar } from "@/components/app/filter-bar";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { customerName, formatCents, formatRelative } from "@/lib/format";
import { LEAD_SOURCE, LEAD_STATUS, URGENCY } from "@/lib/labels";
import { toTenantContext } from "@/lib/services/context";
import { LEAD_STAGES } from "@/lib/services/leads";
import { getLookups } from "@/lib/services/lookups";
import { daysAgo } from "@/lib/time";
import { CardStageButtons } from "./lead-stage-buttons";

export const metadata = { title: "Leads" };
const PER_COLUMN = 25;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAuth("leads:write");
  const sp = await searchParams;
  const lookups = await getLookups(toTenantContext(auth));
  const days = Number(sp.range ?? "30") || 30;
  const where: Prisma.LeadWhereInput = { organizationId: auth.orgId };
  if (sp.range !== "all") where.createdAt = { gte: daysAgo(days) };
  if (sp.source && sp.source in LEAD_SOURCE) where.source = sp.source as LeadSource;
  if (sp.urgency && sp.urgency in URGENCY) where.urgency = sp.urgency as Urgency;
  if (sp.owner) where.assignedEmployeeId = sp.owner === "none" ? null : sp.owner;
  if (sp.status && sp.status in LEAD_STATUS) where.status = sp.status as LeadStatus;
  if (sp.q) where.OR = [{ customer: { firstName: { contains: sp.q, mode: "insensitive" } } }, { customer: { lastName: { contains: sp.q, mode: "insensitive" } } }, { requestedService: { contains: sp.q, mode: "insensitive" } }];

  const [grouped, leads] = await Promise.all([
    db.lead.groupBy({ by: ["status"], where, _count: true, _sum: { estimatedValueCents: true } }),
    Promise.all(
      LEAD_STAGES.map((status) =>
        db.lead.findMany({
          where: { ...where, status: where.status ? where.status : status, ...(where.status && where.status !== status ? { id: "__none__" } : {}) },
          orderBy: [{ urgency: "asc" }, { createdAt: "desc" }],
          take: PER_COLUMN,
          include: { customer: { select: { firstName: true, lastName: true } }, assignedEmployee: { select: { name: true } } },
        }),
      ),
    ),
  ]);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Your pipeline from first contact to won job. Use the arrows on a card to move it between stages."
        actions={<AddLeadDialog services={lookups.services} employees={lookups.employees} />}
      />
      <FilterBar
        q={sp.q}
        placeholder="Search name or service…"
        selects={[
          { name: "source", label: "Source", value: sp.source, options: Object.entries(LEAD_SOURCE).map(([value, label]) => ({ value, label })) },
          { name: "urgency", label: "Urgency", value: sp.urgency, options: Object.entries(URGENCY).map(([value, m]) => ({ value, label: m.label })) },
          { name: "owner", label: "Owner", value: sp.owner, options: [...lookups.employees.filter((e) => e.kind !== "TECHNICIAN").map((e) => ({ value: e.id, label: e.name })), { value: "none", label: "Unassigned" }] },
          { name: "status", label: "Status", value: sp.status, options: Object.entries(LEAD_STATUS).map(([value, m]) => ({ value, label: m.label })) },
          { name: "range", label: "Created", value: sp.range, options: [{ value: "7", label: "Last 7 days" }, { value: "90", label: "Last 90 days" }, { value: "all", label: "All time" }] },
        ]}
      />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        <div className="grid min-w-[1400px] grid-cols-7 gap-3">
          {LEAD_STAGES.map((status, i) => {
            const g = grouped.find((x) => x.status === status);
            const col = leads[i];
            return (
              <section key={status} aria-label={LEAD_STATUS[status].label} className="flex flex-col rounded-xl border border-line bg-slate-50/70">
                <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge tone={LEAD_STATUS[status].tone}>{LEAD_STATUS[status].label}</Badge>
                    <span className="text-xs font-medium text-muted tabular">{g?._count ?? 0}</span>
                  </div>
                  <span className="text-[11px] text-muted tabular">{formatCents(g?._sum.estimatedValueCents ?? 0, { compact: true })}</span>
                </header>
                <ul className="flex-1 space-y-2 p-2">
                  {col.map((l) => (
                    <li key={l.id} className="rounded-lg border border-line bg-surface p-2.5 shadow-[0_1px_1px_rgba(11,31,58,0.03)]">
                      <div className="flex items-start justify-between gap-1">
                        <Link href={`/leads/${l.id}`} className="text-sm font-medium leading-tight text-ink hover:underline">
                          {customerName(l.customer)}
                        </Link>
                        {l.urgency === "EMERGENCY" || l.urgency === "HIGH" ? <Badge tone={URGENCY[l.urgency].tone}>{URGENCY[l.urgency].label}</Badge> : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-2">{l.requestedService}</p>
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                        {l.source === "AFTER_HOURS_CALL" ? <Moon className="size-3" /> : l.source === "PHONE" ? <PhoneCall className="size-3" /> : null}
                        <span className="truncate">{LEAD_SOURCE[l.source]}</span>
                        <span>·</span>
                        <span className="shrink-0">{formatRelative(l.createdAt)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-xs font-medium text-ink tabular">{l.estimatedValueCents ? formatCents(l.estimatedValueCents) : "—"}</span>
                        <CardStageButtons id={l.id} status={l.status} />
                      </div>
                      {l.status === "LOST" && l.lostReason ? <p className="mt-1 truncate text-[11px] text-muted">{l.lostReason}</p> : null}
                    </li>
                  ))}
                  {!col.length ? <li className="px-2 py-6 text-center text-xs text-muted">No leads</li> : null}
                  {(g?._count ?? 0) > PER_COLUMN ? (
                    <li className="text-center">
                      <Link href={`/leads?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), status })}`} className="text-xs text-brand hover:underline">
                        +{(g?._count ?? 0) - PER_COLUMN} more
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
