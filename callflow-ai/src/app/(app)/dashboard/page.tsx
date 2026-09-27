import { AlertTriangle, CalendarCheck, Clock, DollarSign, FileText, Headphones, MessageSquare, PhoneCall, PhoneIncoming, PhoneMissed, Plus, Sparkles, Target, UserPlus } from "lucide-react";
import Link from "next/link";
import { AddLeadDialog } from "@/components/app/add-lead-dialog";
import { RunAutomationButton } from "@/components/app/run-automation-button";
import { StatCard } from "@/components/app/stat-card";
import { StackedBars } from "@/components/charts/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { requireAuth } from "@/lib/auth/session";
import { customerName, formatCents, formatDateTime, formatNumber, formatPercent, formatPhone, formatRelative } from "@/lib/format";
import { LEAD_STATUS, URGENCY } from "@/lib/labels";
import { toTenantContext } from "@/lib/services/context";
import { getDashboard, getDashboardLists } from "@/lib/services/dashboard";
import { getLookups } from "@/lib/services/lookups";

export const metadata = { title: "Dashboard" };

const delta = (cur: number, prev: number) => (prev ? (cur - prev) / prev : null);

function responseLabel(sec: number) {
  if (!sec) return "—";
  return sec < 60 ? `${Math.round(sec)}s` : `${Math.round(sec / 60)}m`;
}

export default async function DashboardPage() {
  const auth = await requireAuth("dashboard:view");
  const ctx = toTenantContext(auth);
  const [{ metrics: m, chart, timezone }, lists, lookups] = await Promise.all([getDashboard(ctx), getDashboardLists(ctx), getLookups(ctx)]);
  const firstName = auth.user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow={`Last 30 days · ${auth.org.name}`}
        title={`Good to see you, ${firstName}`}
        description="Every call answered, every lead captured, and every estimate followed up — here's what CallFlow recovered for you."
        actions={
          <>
            <Button asChild variant="accent">
              <Link href="/calls/simulator">
                <PhoneCall /> Simulate call
              </Link>
            </Button>
            <AddLeadDialog
              services={lookups.services}
              employees={lookups.employees}
              trigger={
                <Button variant="outline">
                  <UserPlus /> Add lead
                </Button>
              }
            />
            <RunAutomationButton automationKey="ESTIMATE_RECOVERY" label="Send follow-ups" size="md" />
            <Button asChild variant="outline">
              <Link href="/estimates/new">
                <Plus /> Create estimate
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Revenue recovery" className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Attributed recovered revenue</CardTitle>
              <CardDescription>Estimated revenue from jobs that would likely have been lost without CallFlow — after-hours bookings, missed-call recoveries, and estimates won after automated follow-up.</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tracking-tight text-ink tabular">{formatCents(m.attributedRevenueCents)}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted">estimated / attributed</p>
            </div>
          </CardHeader>
          <CardContent>
            <StackedBars
              data={chart}
              series={[
                { key: "estimates", label: "Recovered estimates" },
                { key: "afterHours", label: "After-hours AI bookings" },
                { key: "missedCalls", label: "Missed-call recovery" },
              ]}
            />
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard emphasis label="Estimates recovered" value={formatNumber(m.estimatesRecovered.count)} icon={Target} hint={`${formatCents(m.estimatesRecovered.cents)} won after follow-up`} />
          <StatCard label="Outstanding estimates" value={formatCents(m.outstandingEstimates.cents, { compact: true })} icon={FileText} hint={`${m.outstandingEstimates.count} awaiting a decision`} />
          <StatCard label="Missed calls prevented" value={formatNumber(m.missedPrevented)} icon={PhoneMissed} hint="After-hours answers + text-backs" />
        </div>
      </section>

      <section aria-label="Key metrics" className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Calls answered" value={formatNumber(m.callsAnswered)} icon={PhoneIncoming} delta={delta(m.callsAnswered, m.callsAnsweredPrev)} hint={`${m.aiAnswered} by AI`} />
        <StatCard label="New leads" value={formatNumber(m.newLeads)} icon={UserPlus} delta={delta(m.newLeads, m.newLeadsPrev)} hint="vs prior 30d" />
        <StatCard label="Appointments booked" value={formatNumber(m.appointmentsBooked)} icon={CalendarCheck} delta={delta(m.appointmentsBooked, m.appointmentsPrev)} hint="vs prior 30d" />
        <StatCard label="Booking conversion" value={formatPercent(m.bookingConversion)} icon={Sparkles} hint="Leads that booked" />
        <StatCard label="Avg. response time" value={responseLabel(m.avgResponseSec)} icon={Clock} hint="Lead created → first reply" />
        <StatCard label="AI usage this period" value={`${formatNumber(m.usage.voice)} min`} icon={Headphones} hint={`${formatNumber(m.usage.sms)} SMS segments`} footnote={`${formatPercent(m.usage.voice / m.usage.voiceLimit)} of ${formatNumber(m.usage.voiceLimit)} min plan`} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>Urgent leads and customers waiting on a person</CardDescription>
            </div>
            <AlertTriangle className="size-4 text-amber-500" aria-hidden />
          </CardHeader>
          <ul className="divide-y divide-line">
            {lists.flaggedReviews.map((r) => (
              <li key={r.id}>
                <Link href="/reviews" className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50">
                  <Badge tone="red">Unhappy customer</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{customerName(r.customer)}</p>
                    <p className="truncate text-xs text-muted">{r.response}</p>
                  </div>
                </Link>
              </li>
            ))}
            {lists.urgent.map((l) => (
              <li key={l.id}>
                <Link href={`/leads/${l.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50">
                  <Badge tone={URGENCY[l.urgency].tone}>{URGENCY[l.urgency].label}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {customerName(l.customer)} <span className="font-normal text-muted">· {l.requestedService}</span>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {l.needsHumanFollowUp ? "Asked for a person · " : ""}
                      {LEAD_STATUS[l.status].label} · {formatPhone(l.customer.phone)} · {formatRelative(l.createdAt)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {!lists.urgent.length && !lists.flaggedReviews.length ? <EmptyState icon={Sparkles} title="All caught up" description="No urgent leads right now." /> : null}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Upcoming appointments</CardTitle>
              <CardDescription>Next jobs on the schedule</CardDescription>
            </div>
            <Link href="/calendar" className="text-xs font-medium text-brand hover:underline">
              Calendar
            </Link>
          </CardHeader>
          {lists.upcoming.length ? (
            <ul className="divide-y divide-line">
              {lists.upcoming.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={a.technician?.name ?? "?"} color={a.technician?.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {customerName(a.customer)} {a.isEmergency ? <Badge tone="red" className="ml-1">Emergency</Badge> : null}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {a.title} · {a.technician?.name ?? "Unassigned"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-ink-2 tabular">{formatDateTime(a.startAt, timezone)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CalendarCheck} title="Nothing scheduled" description="New bookings from calls and texts will appear here." />
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>What the AI and your team did</CardDescription>
            </div>
            <MessageSquare className="size-4 text-slate-400" aria-hidden />
          </CardHeader>
          <ol className="max-h-[420px] divide-y divide-line overflow-y-auto">
            {lists.activity.map((e) => (
              <li key={e.id} className="flex gap-3 px-5 py-3">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${e.actor === "AI" ? "bg-accent" : e.actor === "AUTOMATION" ? "bg-brand-600" : e.actor === "CUSTOMER" ? "bg-amber-500" : "bg-slate-400"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{e.title}</span>
                    {e.customer ? (
                      <>
                        {" "}
                        ·{" "}
                        <Link className="text-ink-2 hover:underline" href={`/customers/${e.customer.id}`}>
                          {customerName(e.customer)}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  {e.detail ? <p className="line-clamp-2 text-xs text-muted">{e.detail}</p> : null}
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {e.actor.toLowerCase()} · {formatRelative(e.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted">
        <DollarSign className="size-3.5" /> Revenue figures marked “attributed” are estimates derived from booked job values and accepted estimates; they are not accounting totals.
      </p>
    </>
  );
}
