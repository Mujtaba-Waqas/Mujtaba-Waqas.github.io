import Link from "next/link";
import { GroupedBars, SingleArea, StackedBars } from "@/components/charts/charts";
import { ShareBars } from "@/components/charts/share-bars";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/session";
import { formatCents, formatNumber, formatPercent } from "@/lib/format";
import { CALL_OUTCOME, LEAD_SOURCE } from "@/lib/labels";
import { getAnalytics } from "@/lib/services/analytics";
import { toTenantContext } from "@/lib/services/context";
import { cn } from "@/lib/utils";

export const metadata = { title: "Analytics" };
const RANGES = [7, 30, 90];

function secs(s: number) {
  if (!s) return "—";
  return s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAuth("analytics:view");
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.range)) ? Number(sp.range) : 30;
  const a = await getAnalytics(toTenantContext(auth), days);
  const t = a.totals;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How calls turn into booked jobs and revenue. Revenue labeled “attributed” is an estimate derived from job values and accepted estimates."
        actions={
          <div className="flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <Link key={r} href={`/analytics?range=${r}`} className={cn("rounded-md px-3 py-1 text-sm font-medium", r === days ? "bg-ink text-white" : "text-ink-2 hover:bg-slate-50")} aria-current={r === days ? "true" : undefined}>
                {r} days
              </Link>
            ))}
          </div>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {[
          ["Calls", formatNumber(t.calls)],
          ["AI answered", formatPercent(t.calls ? t.aiAnswered / t.calls : 0)],
          ["After-hours calls", formatNumber(t.afterHours)],
          ["Leads", formatNumber(t.leads)],
          ["Bookings", formatNumber(t.bookings)],
          ["Booked by AI", formatNumber(t.aiBookings)],
          ["Estimates won", formatCents(t.wonCents, { compact: true })],
          ["Recovered (attributed)", formatCents(t.recoveredCents, { compact: true })],
        ].map(([l, v]) => (
          <Card key={l} className="p-3">
            <p className="text-[11px] text-muted">{l}</p>
            <p className="mt-0.5 text-lg font-semibold text-ink tabular">{v}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Calls by outcome</CardTitle>
              <CardDescription>Daily inbound calls</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <StackedBars
              currency={false}
              data={a.callDays}
              series={[
                { key: "booked", label: "Booked" },
                { key: "captured", label: "Lead captured / recovered" },
                { key: "handled", label: "Answered / transferred / info" },
                { key: "missed", label: "Missed" },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Call outcomes</CardTitle>
          </CardHeader>
          <CardContent>
            <ShareBars data={a.outcomes.map(([k, v]) => ({ label: k === "MISSED" ? "Missed (not yet recovered)" : (CALL_OUTCOME[k as keyof typeof CALL_OUTCOME]?.label ?? k), value: v, sub: formatPercent(v / Math.max(1, t.calls)) }))} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Lead sources & conversion</CardTitle>
              <CardDescription>Converted = booked an appointment or won</CardDescription>
            </div>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <TH>Source</TH>
                <TH className="text-right">Leads</TH>
                <TH className="text-right">Converted</TH>
                <TH className="text-right">Won</TH>
                <TH className="text-right">Avg. response</TH>
                <TH className="text-right">Won value</TH>
              </tr>
            </THead>
            <tbody>
              {a.sources.map(([source, s]) => (
                <TR key={source}>
                  <TD className="font-medium text-ink">{LEAD_SOURCE[source]}</TD>
                  <TD className="text-right tabular">{s.leads}</TD>
                  <TD className="text-right tabular">{formatPercent(s.converted / s.leads)}</TD>
                  <TD className="text-right tabular">{s.won}</TD>
                  <TD className="text-right tabular">{secs(s.responseN ? s.responseSum / s.responseN : 0)}</TD>
                  <TD className="text-right tabular">{formatCents(s.valueCents)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Response time</CardTitle>
              <CardDescription>Lead created → first reply</CardDescription>
            </div>
            <span className="text-xl font-semibold text-ink tabular">{secs(t.avgResponseSec)}</span>
          </CardHeader>
          <CardContent>
            <ShareBars data={a.sources.filter(([, s]) => s.responseN).map(([source, s]) => ({ label: LEAD_SOURCE[source], value: Math.round(s.responseSum / s.responseN) }))} format={(v) => secs(v)} />
            <p className="mt-3 text-xs text-muted">Faster first responses generally mean more leads reached. The AI answers calls instantly and texts web leads within minutes.</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <StackedBars
              currency={false}
              data={a.bookingDays}
              series={[
                { key: "ai", label: "Booked by AI" },
                { key: "staff", label: "Booked by staff" },
              ]}
              height={220}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Estimates</CardTitle>
              <CardDescription>Sent, won and lost per week</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <GroupedBars
              xKey="label"
              data={a.estimateWeeks}
              series={[
                { key: "sent", label: "Sent" },
                { key: "won", label: "Won" },
                { key: "lost", label: "Lost" },
              ]}
              height={220}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>AI voice minutes</CardTitle>
              <CardDescription>{formatNumber(t.voiceMinutes)} minutes in range</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <SingleArea data={a.usageDays} dataKey="voice" label="Voice minutes" height={170} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>SMS segments</CardTitle>
              <CardDescription>{formatNumber(t.smsSegments)} segments in range</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <SingleArea data={a.usageDays} dataKey="sms" label="SMS segments" height={170} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>AI requests</CardTitle>
              <CardDescription>{formatNumber(t.aiRequests)} conversation turns & summaries</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <SingleArea data={a.usageDays} dataKey="ai" label="AI requests" height={170} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Technician performance</CardTitle>
              <CardDescription>Appointments created in range</CardDescription>
            </div>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <TH>Technician</TH>
                <TH className="text-right">Scheduled</TH>
                <TH className="text-right">Completed</TH>
                <TH className="text-right">Emergencies</TH>
                <TH className="text-right">No-shows</TH>
                <TH className="text-right">Avg. ticket</TH>
                <TH className="text-right">Rating</TH>
              </tr>
            </THead>
            <tbody>
              {a.techs.map((x) => (
                <TR key={x.id}>
                  <TD className="font-medium text-ink">{x.name}</TD>
                  <TD className="text-right tabular">{x.scheduled}</TD>
                  <TD className="text-right tabular">{x.completed}</TD>
                  <TD className="text-right tabular">{x.emergencies ? <Badge tone="red">{x.emergencies}</Badge> : 0}</TD>
                  <TD className="text-right tabular">{x.noShows}</TD>
                  <TD className="text-right tabular">{x.avgTicketCents ? formatCents(x.avgTicketCents) : "—"}</TD>
                  <TD className="text-right tabular">{x.avgRating ? x.avgRating.toFixed(1) : "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Office team</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH className="text-right">Leads</TH>
                <TH className="text-right">Open</TH>
                <TH className="text-right">Won</TH>
              </tr>
            </THead>
            <tbody>
              {a.office.map((x) => (
                <TR key={x.id}>
                  <TD>
                    <span className="font-medium text-ink">{x.name}</span>
                    <span className="block text-xs text-muted">{x.title}</span>
                  </TD>
                  <TD className="text-right tabular">{x.leads}</TD>
                  <TD className="text-right tabular">{x.open}</TD>
                  <TD className="text-right tabular">{x.won}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
