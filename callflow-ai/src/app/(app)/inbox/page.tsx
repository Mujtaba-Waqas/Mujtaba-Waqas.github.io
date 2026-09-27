import type { Prisma } from "@prisma/client";
import { Ban, Bot, CalendarCheck, FileText, Hand, Inbox as InboxIcon, Search, Star, User, Workflow } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Avatar, EmptyState, KeyValue, PageHeader } from "@/components/ui/misc";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { customerName, formatCents, formatDateTime, formatPhone, formatRelative } from "@/lib/format";
import { ESTIMATE_STATUS, MESSAGE_STATUS, REVIEW_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Composer, MarkRead, SimulateReply, TakeoverToggle } from "./inbox-client";

export const metadata = { title: "Inbox" };

const FILTERS = [
  { value: "", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "takeover", label: "Needs a human" },
  { value: "optout", label: "Opted out" },
];

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await requireAuth("inbox:view");
  const sp = await searchParams;
  const where: Prisma.ConversationWhereInput = { organizationId: auth.orgId };
  if (sp.filter === "unread") where.unreadCount = { gt: 0 };
  if (sp.filter === "takeover") where.humanTakeover = true;
  if (sp.filter === "optout") where.customer = { smsOptedOut: true };
  if (sp.q) {
    const digits = sp.q.replace(/\D/g, "");
    where.OR = [
      { customer: { firstName: { contains: sp.q, mode: "insensitive" } } },
      { customer: { lastName: { contains: sp.q, mode: "insensitive" } } },
      ...(digits.length >= 3 ? [{ customer: { phone: { contains: digits } } }] : []),
      { messages: { some: { body: { contains: sp.q, mode: "insensitive" } } } },
    ];
  }
  const conversations = await db.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: 60,
    include: { customer: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const org = await db.organization.findUniqueOrThrow({ where: { id: auth.orgId }, select: { timezone: true } });

  let selectedId = sp.c;
  if (!selectedId && sp.customer) selectedId = (await db.conversation.findFirst({ where: { organizationId: auth.orgId, customerId: sp.customer } }))?.id;
  if (!selectedId) selectedId = conversations[0]?.id;
  const convo = selectedId
    ? await db.conversation.findFirst({ where: { id: selectedId, organizationId: auth.orgId }, include: { customer: true, messages: { orderBy: { createdAt: "asc" } } } })
    : null;
  const side = convo
    ? await Promise.all([
        db.estimate.findFirst({ where: { organizationId: auth.orgId, customerId: convo.customerId }, orderBy: { createdAt: "desc" }, include: { followups: { orderBy: { stage: "asc" } } } }),
        db.appointment.findFirst({ where: { organizationId: auth.orgId, customerId: convo.customerId, startAt: { gte: new Date() }, status: { in: ["SCHEDULED", "CONFIRMED"] } }, orderBy: { startAt: "asc" } }),
        db.review.findFirst({ where: { organizationId: auth.orgId, customerId: convo.customerId }, orderBy: { createdAt: "desc" } }),
      ])
    : null;
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, filter: sp.filter, ...extra })) if (v) p.set(k, v);
    return `/inbox?${p.toString()}`;
  };

  return (
    <>
      <PageHeader title="Inbox" description="Every SMS conversation in one place. The AI drafts replies; your team stays in control." />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        {/* Conversation list */}
        <Card className="flex max-h-[calc(100vh-190px)] min-h-[560px] flex-col overflow-hidden">
          <form className="space-y-2 border-b border-line p-3" role="search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input name="q" defaultValue={sp.q} placeholder="Search name, number, message…" className="pl-9" aria-label="Search conversations" />
              {sp.filter ? <input type="hidden" name="filter" value={sp.filter} /> : null}
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <Link key={f.value} href={qs({ filter: f.value || undefined, c: undefined })} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", (sp.filter ?? "") === f.value ? "bg-ink text-white" : "bg-slate-100 text-ink-2 hover:bg-slate-200")}>
                  {f.label}
                </Link>
              ))}
            </div>
          </form>
          <ul className="flex-1 divide-y divide-line overflow-y-auto">
            {conversations.map((c) => {
              const last = c.messages[0];
              return (
                <li key={c.id}>
                  <Link href={qs({ c: c.id })} className={cn("flex gap-3 px-4 py-3 hover:bg-slate-50", c.id === convo?.id && "bg-brand-50 hover:bg-brand-50")} aria-current={c.id === convo?.id ? "true" : undefined}>
                    <Avatar name={customerName(c.customer)} color={c.customer.smsOptedOut ? "#94a3b8" : "#1d4ed8"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("truncate text-sm", c.unreadCount ? "font-semibold text-ink" : "font-medium text-ink")}>{customerName(c.customer)}</p>
                        <span className="shrink-0 text-[11px] text-muted">{formatRelative(c.lastMessageAt)}</span>
                      </div>
                      <p className="truncate text-xs text-muted">
                        {last?.direction === "OUTBOUND" ? "You: " : ""}
                        {last?.body}
                      </p>
                      <div className="mt-1 flex gap-1">
                        {c.unreadCount ? <Badge tone="blue">{c.unreadCount} new</Badge> : null}
                        {c.humanTakeover ? (
                          <Badge tone="amber">
                            <Hand /> Human
                          </Badge>
                        ) : null}
                        {c.customer.smsOptedOut ? (
                          <Badge tone="red">
                            <Ban /> Opted out
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {!conversations.length ? <EmptyState icon={InboxIcon} title="No conversations" description="Try a different search or filter." /> : null}
        </Card>

        {/* Conversation */}
        {convo ? (
          <Card className="flex max-h-[calc(100vh-190px)] min-h-[560px] flex-col overflow-hidden">
            <MarkRead conversationId={convo.id} unread={convo.unreadCount} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <div>
                <p className="font-semibold text-ink">{customerName(convo.customer)}</p>
                <p className="text-xs text-muted">{formatPhone(convo.customer.phone)}</p>
              </div>
              <TakeoverToggle conversationId={convo.id} enabled={convo.humanTakeover} reason={convo.takeoverReason} />
            </div>
            <ol className="flex-1 space-y-3 overflow-y-auto bg-slate-50/40 px-5 py-4">
              {convo.messages.map((m) => {
                const out = m.direction === "OUTBOUND";
                const SenderIcon = m.sender === "AI" ? Bot : m.sender === "AUTOMATION" ? Workflow : User;
                return (
                  <li key={m.id} className={cn("flex flex-col", out ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm",
                        out ? (m.status === "BLOCKED" ? "rounded-br-sm border border-dashed border-red-300 bg-red-50 text-red-900 line-through decoration-red-300" : "rounded-br-sm bg-brand text-white") : "rounded-bl-sm border border-line bg-surface text-ink",
                      )}
                    >
                      {m.body}
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                      {out ? <SenderIcon className="size-3" aria-hidden /> : null}
                      {out ? (m.sender === "AUTOMATION" ? `Automation${m.automationKey ? ` · ${m.automationKey.toLowerCase().replace(/_/g, " ")}` : ""}` : m.sender === "AI" ? "AI" : m.sender === "SYSTEM" ? "System" : "Staff") : "Customer"}
                      {" · "}
                      {formatDateTime(m.createdAt, org.timezone)}
                      {out && m.status !== "SENT" ? (
                        <>
                          {" · "}
                          <span className={m.status === "BLOCKED" ? "font-medium text-red-600" : m.status === "SIMULATED" ? "text-amber-700" : ""}>{MESSAGE_STATUS[m.status].label}</span>
                        </>
                      ) : null}
                    </p>
                  </li>
                );
              })}
            </ol>
            <Composer conversationId={convo.id} customerId={convo.customerId} optedOut={convo.customer.smsOptedOut} />
          </Card>
        ) : (
          <Card className="flex items-center justify-center">
            <EmptyState icon={InboxIcon} title="Select a conversation" />
          </Card>
        )}

        {/* Customer sidebar */}
        {convo && side ? (
          <div className="space-y-4 lg:col-span-2 xl:col-span-1">
            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Customer</p>
              <dl>
                <KeyValue label="Name">
                  <Link className="text-brand hover:underline" href={`/customers/${convo.customerId}`}>
                    {customerName(convo.customer)}
                  </Link>
                </KeyValue>
                <KeyValue label="Address">{convo.customer.address ? `${convo.customer.address}, ${convo.customer.city ?? ""}` : "—"}</KeyValue>
                <KeyValue label="SMS status">
                  {convo.customer.smsOptedOut ? (
                    <Badge tone="red">
                      <Ban /> Opted out {convo.customer.smsOptedOutAt ? formatRelative(convo.customer.smsOptedOutAt) : ""}
                    </Badge>
                  ) : (
                    <Badge tone="green">Subscribed</Badge>
                  )}
                </KeyValue>
                {convo.customer.hasMaintenancePlan ? <KeyValue label="Plan">Comfort Club</KeyValue> : null}
              </dl>
            </Card>
            {side[0] ? (
              <Card className="p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <FileText className="size-3.5" /> Latest estimate
                </p>
                <Link href={`/estimates/${side[0].id}`} className="block rounded-lg border border-line p-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">{side[0].number}</span>
                    <Badge tone={ESTIMATE_STATUS[side[0].status].tone}>{ESTIMATE_STATUS[side[0].status].label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {side[0].title} · {formatCents(side[0].totalCents)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Follow-ups: {side[0].followups.filter((f) => f.status === "SENT").length} sent · {side[0].followups.filter((f) => f.status === "SCHEDULED").length} scheduled
                    {side[0].automationStopReason ? ` · stopped: ${side[0].automationStopReason}` : ""}
                  </p>
                </Link>
              </Card>
            ) : null}
            {side[1] ? (
              <Card className="p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <CalendarCheck className="size-3.5" /> Next appointment
                </p>
                <p className="text-sm font-medium text-ink">{side[1].title}</p>
                <p className="text-xs text-muted">{formatDateTime(side[1].startAt, org.timezone)}</p>
              </Card>
            ) : null}
            {side[2] ? (
              <Card className="p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <Star className="size-3.5" /> Review status
                </p>
                <Badge tone={REVIEW_STATUS[side[2].status].tone}>{REVIEW_STATUS[side[2].status].label}</Badge>
                {side[2].rating ? <span className="ml-2 text-sm text-ink">{side[2].rating}/5</span> : null}
              </Card>
            ) : null}
            <SimulateReply customerId={convo.customerId} />
          </div>
        ) : null}
      </div>
    </>
  );
}
