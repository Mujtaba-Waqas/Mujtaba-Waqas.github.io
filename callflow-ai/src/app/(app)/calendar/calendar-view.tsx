"use client";

import type { AppointmentStatus } from "@prisma/client";
import { AlertTriangle, Bot, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, MessageSquare, Siren, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { appointmentStatusAction, availabilityAction, bookAppointmentAction, rescheduleAction } from "@/app/(app)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { KeyValue, PageHeader } from "@/components/ui/misc";
import { formatDateTime, formatPhone } from "@/lib/format";
import { APPT_STATUS } from "@/lib/labels";
import { zonedTimeToUtc } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface CalAppt {
  id: string;
  title: string;
  customer: string;
  customerId: string;
  address: string | null;
  phone: string;
  technicianId: string | null;
  technician: string | null;
  color: string;
  dayKey: string;
  startMin: number;
  endMin: number;
  startAt: string;
  endAt: string;
  bufferMinutes: number;
  status: AppointmentStatus;
  isEmergency: boolean;
  bookedBy: string;
  notes: string | null;
  serviceId: string | null;
  confirmationSentAt: string | null;
  reminderSentAt: string | null;
  leadId: string | null;
}
type Tech = { id: string; name: string; color: string; isOnCall: boolean };
type Slot = { startAt: string; endAt: string; technicianId: string; technicianName: string; label: string };

const START_HOUR = 6;
const END_HOUR = 24;
const HOUR_PX = 52;

function shiftDate(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
function weekdayOf(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

export function CalendarView(props: {
  view: "day" | "week";
  dateKey: string;
  today: string;
  days: string[];
  tz: string;
  appts: CalAppt[];
  technicians: Tech[];
  services: { id: string; name: string; category: string; durationMinutes: number }[];
  customers: { id: string; label: string }[];
  businessHours: { day: number; open: string; close: string }[];
  bufferMinutes: number;
  openNew: { customerId: string; leadId: string } | null;
  openApptId: string | null;
}) {
  const { view, dateKey, today, days, tz, appts, technicians, businessHours } = props;
  const [techFilter, setTechFilter] = useState<string>("all");
  const [selected, setSelected] = useState<CalAppt | null>(() => appts.find((a) => a.id === props.openApptId) ?? null);
  const [newOpen, setNewOpen] = useState(Boolean(props.openNew));
  const step = view === "week" ? 7 : 1;
  const nav = (key: string, v = view) => `/calendar?view=${v}&date=${key}`;

  // Week: columns are days. Day: columns are technicians.
  const columns = view === "week" ? days.map((d) => ({ key: d, label: dayLabel(d), day: d, techId: null as string | null })) : technicians.map((t) => ({ key: t.id, label: t.name, day: days[0], techId: t.id as string | null }));
  const visible = appts.filter((a) => techFilter === "all" || a.technicianId === techFilter);
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const title = view === "week" ? `${dayLabel(days[0])} – ${dayLabel(days[days.length - 1])}` : dayLabel(days[0]);
  const active = visible.filter((a) => a.status !== "CANCELLED");

  return (
    <>
      <PageHeader
        title="Calendar"
        description={`${title} · ${active.length} appointment${active.length === 1 ? "" : "s"} · ${props.bufferMinutes}-minute travel buffer between jobs`}
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <CalendarPlus /> New appointment
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-line bg-surface">
          <Link href={nav(shiftDate(dateKey, -step))} className="rounded-l-lg p-2 hover:bg-slate-50" aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={nav(today)} className="border-x border-line px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
            Today
          </Link>
          <Link href={nav(shiftDate(dateKey, step))} className="rounded-r-lg p-2 hover:bg-slate-50" aria-label="Next">
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="flex rounded-lg border border-line bg-surface p-0.5">
          {(["day", "week"] as const).map((v) => (
            <Link key={v} href={nav(dateKey, v)} className={cn("rounded-md px-3 py-1 text-sm font-medium capitalize", view === v ? "bg-ink text-white" : "text-ink-2 hover:bg-slate-50")} aria-current={view === v ? "page" : undefined}>
              {v}
            </Link>
          ))}
        </div>
        {view === "week" ? (
          <Select aria-label="Technician" className="w-48" value={techFilter} onChange={(e) => setTechFilter(e.target.value)}>
            <option value="all">All technicians</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted">
          {technicians.map((t) => (
            <span key={t.id} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: t.color }} />
              {t.name.split(" ")[0]}
              {t.isOnCall ? <Badge tone="violet">on call</Badge> : null}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[repeating-linear-gradient(135deg,#cbd5e1_0_2px,transparent_2px_5px)]" /> buffer
          </span>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid border-b border-line bg-slate-50/70" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))` }}>
              <div />
              {columns.map((c) => (
                <div key={c.key} className={cn("border-l border-line px-2 py-2 text-center text-xs font-semibold text-ink-2", c.day === today && view === "week" && "bg-brand-50 text-brand")}>
                  {c.label}
                </div>
              ))}
            </div>
            <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))`, height: hours.length * HOUR_PX }}>
              <div className="relative">
                {hours.map((h) => (
                  <div key={h} className="absolute right-2 -translate-y-1.5 text-[10px] text-muted" style={{ top: (h - START_HOUR) * HOUR_PX }}>
                    {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
                  </div>
                ))}
              </div>
              {columns.map((c) => {
                const bh = businessHours.find((b) => b.day === weekdayOf(c.day));
                const open = bh ? toMin(bh.open) : null;
                const close = bh ? toMin(bh.close) : null;
                const colAppts = visible.filter((a) => a.dayKey === c.day && (c.techId ? a.technicianId === c.techId : true));
                return (
                  <div key={c.key} className="relative border-l border-line">
                    {/* after-hours shading */}
                    {open === null ? (
                      <div className="absolute inset-0 bg-slate-100/70" title="Closed — emergency slots only" />
                    ) : (
                      <>
                        <div className="absolute inset-x-0 top-0 bg-slate-100/70" style={{ height: ((open - START_HOUR * 60) / 60) * HOUR_PX }} />
                        <div className="absolute inset-x-0 bottom-0 bg-slate-100/70" style={{ top: ((close! - START_HOUR * 60) / 60) * HOUR_PX }} />
                      </>
                    )}
                    {hours.map((h) => (
                      <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: (h - START_HOUR) * HOUR_PX }} />
                    ))}
                    {c.day === today ? <NowLine tz={tz} /> : null}
                    {layout(colAppts).map(({ a, lane, lanes }) => {
                      const top = ((Math.max(a.startMin, START_HOUR * 60) - START_HOUR * 60) / 60) * HOUR_PX;
                      const height = Math.max(22, ((a.endMin - Math.max(a.startMin, START_HOUR * 60)) / 60) * HOUR_PX - 2);
                      const buffer = (a.bufferMinutes / 60) * HOUR_PX;
                      const width = 100 / lanes;
                      const cancelled = a.status === "CANCELLED";
                      return (
                        <div key={a.id} className="absolute px-0.5" style={{ top, left: `${lane * width}%`, width: `${width}%` }}>
                          <button
                            onClick={() => setSelected(a)}
                            className={cn(
                              "block w-full overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm ring-1 ring-black/5 transition hover:brightness-95",
                              cancelled ? "bg-slate-100 text-muted line-through" : a.isEmergency ? "bg-red-50 text-red-900" : "bg-white text-ink",
                            )}
                            style={{ height, borderLeftColor: a.isEmergency ? "#dc2626" : a.color }}
                            aria-label={`${a.title} for ${a.customer}`}
                          >
                            <span className="flex items-center gap-1 font-semibold">
                              {a.isEmergency ? <Siren className="size-3 shrink-0 text-red-600" /> : null}
                              <span className="truncate">{a.customer}</span>
                            </span>
                            <span className="block truncate text-[10px] opacity-80">{a.title}</span>
                            {view === "week" && height > 44 ? <span className="block truncate text-[10px] opacity-70">{a.technician?.split(" ")[0]}</span> : null}
                          </button>
                          {!cancelled && a.bufferMinutes ? <div className="mx-1 rounded-b bg-[repeating-linear-gradient(135deg,#e2e8f0_0_2px,transparent_2px_6px)]" style={{ height: buffer }} aria-hidden /> : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
      <p className="mt-2 text-xs text-muted">Shaded areas are outside business hours — only emergency jobs can be booked there. Internal demo calendar; a Google Calendar adapter can sync these events when configured.</p>

      <AppointmentDialog appt={selected} onClose={() => setSelected(null)} technicians={technicians} tz={tz} />
      <NewAppointmentDialog open={newOpen} onOpenChange={setNewOpen} {...props} />
    </>
  );
}

/** Assign overlapping appointments to side-by-side lanes. */
function layout(list: CalAppt[]) {
  const sorted = [...list].sort((a, b) => a.startMin - b.startMin);
  const out: { a: CalAppt; lane: number; lanes: number }[] = [];
  let group: { a: CalAppt; lane: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
    group.forEach((g) => out.push({ ...g, lanes }));
    group = [];
  };
  for (const a of sorted) {
    if (a.startMin >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.a.endMin > a.startMin).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ a, lane });
    groupEnd = Math.max(groupEnd, a.endMin + a.bufferMinutes);
  }
  flush();
  return out;
}

function NowLine({ tz }: { tz: string }) {
  const [min] = useState(() => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date());
    return Number(p.find((x) => x.type === "hour")?.value) * 60 + Number(p.find((x) => x.type === "minute")?.value);
  });
  if (min < START_HOUR * 60) return null;
  return <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: ((min - START_HOUR * 60) / 60) * HOUR_PX }} aria-hidden />;
}

function AppointmentDialog({ appt, onClose, technicians, tz }: { appt: CalAppt | null; onClose: () => void; technicians: Tech[]; tz: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [tech, setTech] = useState("");
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const open = Boolean(appt);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      setMode("view");
      onClose();
      router.refresh();
    });
  if (!appt) return <Dialog open={false} />;
  const activeStatus = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"].includes(appt.status);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setMode("view");
          onClose();
        }
      }}
    >
      <DialogContent title={appt.title} description={`${appt.customer} · ${formatDateTime(appt.startAt, tz)}`}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Badge tone={APPT_STATUS[appt.status].tone}>{APPT_STATUS[appt.status].label}</Badge>
          {appt.isEmergency ? (
            <Badge tone="red">
              <AlertTriangle /> Emergency
            </Badge>
          ) : null}
          {appt.bookedBy === "AI" ? (
            <Badge tone="teal">
              <Bot /> Booked by AI
            </Badge>
          ) : null}
        </div>
        <dl>
          <KeyValue label="Customer">
            <Link className="text-brand hover:underline" href={`/customers/${appt.customerId}`}>
              {appt.customer}
            </Link>
          </KeyValue>
          <KeyValue label="Phone">{formatPhone(appt.phone)}</KeyValue>
          <KeyValue label="Address">{appt.address ?? "—"}</KeyValue>
          <KeyValue label="Technician">{appt.technician ?? "Unassigned"}</KeyValue>
          <KeyValue label="Window">
            {formatDateTime(appt.startAt, tz)} – {new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(appt.endAt))}
          </KeyValue>
          <KeyValue label="Travel buffer">{appt.bufferMinutes} min</KeyValue>
          <KeyValue label="Confirmation">{appt.confirmationSentAt ? `Sent ${formatDateTime(appt.confirmationSentAt, tz)}` : "Not sent"}</KeyValue>
          <KeyValue label="Reminder">{appt.reminderSentAt ? `Sent ${formatDateTime(appt.reminderSentAt, tz)}` : "Scheduled 24h before"}</KeyValue>
        </dl>
        {appt.notes ? <p className="mt-3 rounded-md bg-slate-50 p-2.5 text-xs text-ink-2">{appt.notes}</p> : null}
        {mode === "reschedule" ? (
          <form
            className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const [y, m, d] = date.split("-").map(Number);
              const [h, mi] = time.split(":").map(Number);
              const startAt = zonedTimeToUtc(y, m, d, h, mi, tz).toISOString();
              act(() => rescheduleAction({ id: appt.id, startAt, technicianId: tech || appt.technicianId || technicians[0].id }), "Appointment rescheduled");
            }}
          >
            <Field label="Date" htmlFor="rdate">
              <Input id="rdate" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Start time" htmlFor="rtime">
              <Input id="rtime" type="time" required step={900} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="Technician" htmlFor="rtech" className="col-span-2">
              <Select id="rtech" value={tech || appt.technicianId || ""} onChange={(e) => setTech(e.target.value)}>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="col-span-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode("view")}>
                Back
              </Button>
              <Button size="sm" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null} Save new time
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {activeStatus ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDate(appt.dayKey);
                    setTime(hhmm(appt.startMin));
                    setTech(appt.technicianId ?? "");
                    setMode("reschedule");
                  }}
                >
                  <Clock /> Reschedule
                </Button>
                <Button size="sm" variant="accent" disabled={pending} onClick={() => act(() => appointmentStatusAction({ id: appt.id, status: "COMPLETED" }), "Marked completed — review request will follow")}>
                  <CheckCircle2 /> Complete
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    const reason = window.prompt("Reason for cancelling?", "Customer request");
                    if (reason !== null) act(() => appointmentStatusAction({ id: appt.id, status: "CANCELLED", reason }), "Appointment cancelled");
                  }}
                >
                  <XCircle /> Cancel
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => appointmentStatusAction({ id: appt.id, status: "NO_SHOW" }), "Marked no-show")}>
                  No-show
                </Button>
              </>
            ) : null}
            <Button asChild size="sm" variant="ghost">
              <Link href={`/inbox?customer=${appt.customerId}`}>
                <MessageSquare /> Message
              </Link>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewAppointmentDialog({
  open,
  onOpenChange,
  technicians,
  services,
  customers,
  tz,
  openNew,
  today,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  technicians: Tech[];
  services: { id: string; name: string; category: string }[];
  customers: { id: string; label: string }[];
  tz: string;
  openNew: { customerId: string; leadId: string } | null;
  today: string;
}) {
  const [customerId, setCustomerId] = useState(openNew?.customerId ?? "");
  const [serviceId, setServiceId] = useState(services.find((s) => s.category === "general")?.id ?? services[0]?.id ?? "");
  const [technicianId, setTechnicianId] = useState(technicians[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("10:00");
  const [emergency, setEmergency] = useState(false);
  const [notes, setNotes] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [pending, start] = useTransition();
  const [loadingSlots, startSlots] = useTransition();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => customers.filter((c) => c.label.toLowerCase().includes(search.toLowerCase())).slice(0, 200), [customers, search]);

  const findSlots = () =>
    startSlots(async () => {
      const r = await availabilityAction({ serviceId, emergency, offset: 0 });
      if (!r.ok) return void toast.error(r.error);
      setSlots(r.data ?? []);
    });
  const pickSlot = (s: Slot) => {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s.startAt));
    const t = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(s.startAt));
    setDate(f);
    setTime(t);
    setTechnicianId(s.technicianId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New appointment" description="Availability respects business hours, existing jobs, and travel buffers.">
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const [y, m, d] = date.split("-").map(Number);
            const [h, mi] = time.split(":").map(Number);
            start(async () => {
              const r = await bookAppointmentAction({ customerId, leadId: openNew?.leadId ?? "", serviceId, technicianId, startAt: zonedTimeToUtc(y, m, d, h, mi, tz).toISOString(), isEmergency: emergency, notes });
              if (!r.ok) return void toast.error(r.error);
              toast.success("Appointment booked", { description: "Confirmation text sent (simulated in demo mode)." });
              onOpenChange(false);
              router.push(`/calendar?view=day&date=${date}&appt=${r.data!.id}`);
              router.refresh();
            });
          }}
        >
          <Field label="Customer" htmlFor="cust" className="col-span-2">
            <Input aria-label="Filter customers" placeholder="Type to filter…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-1.5" />
            <Select id="cust" required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select a customer…</option>
              {filtered.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Service" htmlFor="svc">
            <Select id="svc" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Technician" htmlFor="tech">
            <Select id="tech" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="date">
            <Input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Start time" htmlFor="time">
            <Input id="time" type="time" required step={900} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} className="size-4 accent-red-600" />
            Emergency (allows after-hours booking, 2-hour window)
          </label>
          <div className="col-span-2 rounded-lg border border-line p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-ink-2">Suggested openings</p>
              <Button type="button" size="sm" variant="ghost" onClick={findSlots} disabled={loadingSlots}>
                {loadingSlots ? <Loader2 className="animate-spin" /> : null} Find available slots
              </Button>
            </div>
            {slots ? (
              slots.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {slots.map((s) => (
                    <button type="button" key={s.startAt + s.technicianId} onClick={() => pickSlot(s)} className="rounded-md border border-line px-2 py-1 text-xs hover:border-accent hover:bg-accent-50">
                      {s.label} · {s.technicianName.split(" ")[0]}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">No openings in the booking horizon.</p>
              )
            ) : null}
          </div>
          <Field label="Notes" htmlFor="notes" className="col-span-2">
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={pending || !customerId}>{pending ? <Loader2 className="animate-spin" /> : null} Book appointment</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
