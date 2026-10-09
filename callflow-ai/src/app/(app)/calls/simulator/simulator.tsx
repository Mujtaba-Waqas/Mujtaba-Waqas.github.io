"use client";

import { AlertTriangle, ArrowRightLeft, Bot, CalendarCheck, CheckCircle2, CircleDashed, ExternalLink, Loader2, MapPin, MessageSquare, Moon, PhoneCall, PhoneOff, RotateCcw, Send, Sun, User, UserSquare2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { simulationTurnAction, startSimulationAction } from "@/app/(app)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { DemoTag } from "@/components/ui/misc";
import type { EngineState } from "@/lib/domain/receptionist";
import { SERVICE_LABELS } from "@/lib/domain/intents";
import type { Scenario, SimulatedClock } from "@/lib/simulator/scenarios";
import { cn } from "@/lib/utils";

type Turn = { speaker: "AI" | "CALLER"; text: string };
type Records = {
  callId: string;
  lead: { id: string; status: string; urgency: string; requestedService: string } | null;
  customer: { id: string; firstName: string; lastName: string } | null;
  appointment: { id: string; title: string; startAt: string; technician: string | null } | null;
  events: { id: string; title: string; detail: string | null; at: string }[];
  messages: { id: string; body: string; status: string }[];
  status: string;
};

/** Keeps the simulator on screen if the request itself fails (network drop, server timeout). */
async function callServer<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (err) {
    console.error("[simulator] request failed", err);
    return { ok: false, error: "The server didn't respond. Please try again." };
  }
}

export function Simulator({ scenarios }: { scenarios: Scenario[] }) {
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? null;
  const [callerNumber, setCallerNumber] = useState(scenarios[0].callerNumber);
  const [clock, setClock] = useState<SimulatedClock>(scenarios[0].clock);
  const [callId, setCallId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [lineIdx, setLineIdx] = useState(0);
  const [text, setText] = useState("");
  const [state, setState] = useState<EngineState | null>(null);
  const [records, setRecords] = useState<Records | null>(null);
  const [ended, setEnded] = useState(false);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [turns]);

  const selectScenario = (s: Scenario | null) => {
    reset();
    setScenarioId(s?.id ?? "custom");
    if (s) {
      setCallerNumber(s.callerNumber);
      setClock(s.clock);
    } else {
      setCallerNumber("(801) 555-0190");
      setClock("auto");
    }
  };

  function reset() {
    setCallId(null);
    setTurns([]);
    setLineIdx(0);
    setText("");
    setState(null);
    setRecords(null);
    setEnded(false);
  }

  const startCall = () =>
    start(async () => {
      const r = await callServer(() => startSimulationAction({ callerNumber, clock }));
      if (!r.ok) return void toast.error(r.error);
      setCallId(r.data!.callId);
      setState(r.data!.state);
      setTurns([{ speaker: "AI", text: r.data!.reply }]);
      setText(scenario?.script[0] ?? "");
    });

  const send = (utterance: string) =>
    start(async () => {
      if (!callId || !utterance.trim()) return;
      setTurns((t) => [...t, { speaker: "CALLER", text: utterance }]);
      setText("");
      const r = await callServer(() => simulationTurnAction({ callId, text: utterance }));
      if (!r.ok) {
        // Let the caller retry the same line.
        setTurns((t) => t.slice(0, -1));
        setText(utterance);
        toast.error(r.error);
        return;
      }
      const d = r.data!;
      setTurns((t) => [...t, { speaker: "AI", text: d.reply }]);
      setState(d.state);
      setRecords(d.records);
      const next = lineIdx + 1;
      setLineIdx(next);
      if (d.ended) {
        setEnded(true);
        toast.success(d.transferTo ? "Call transferred" : "Call completed", { description: "Summary, lead and timeline saved." });
      } else setText(scenario?.script[next] ?? "");
    });

  const data = state?.data;
  const fields: { label: string; value: string | null | undefined; icon?: React.ReactNode }[] = [
    { label: "Name", value: data?.firstName ? `${data.firstName} ${data.lastName ?? ""}` : null },
    { label: "Phone", value: data?.phone },
    { label: "Address", value: data?.address ? `${data.address}${data.city ? `, ${data.city}` : ""}${data.zip ? ` ${data.zip}` : ""}` : null },
    { label: "Service", value: data?.serviceKey ? SERVICE_LABELS[data.serviceKey] : null },
    { label: "Issue", value: data?.issue },
    { label: "Preference", value: data?.preference?.label || (data?.isEmergency ? "Emergency — first available" : null) },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
      {/* Scenario picker */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Scenario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => selectScenario(s)}
              disabled={pending}
              className={cn("w-full rounded-lg border p-3 text-left transition-colors", scenarioId === s.id ? "border-accent bg-accent-50 ring-1 ring-accent" : "border-line hover:bg-slate-50")}
            >
              <p className="text-sm font-medium text-ink">{s.title}</p>
              <p className="mt-0.5 text-xs text-muted">{s.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {s.tags.map((t) => (
                  <Badge key={t} tone={t === "Emergency" ? "red" : "neutral"}>
                    {t}
                  </Badge>
                ))}
              </div>
            </button>
          ))}
          <button onClick={() => selectScenario(null)} disabled={pending} className={cn("w-full rounded-lg border border-dashed p-3 text-left", scenarioId === "custom" ? "border-accent bg-accent-50" : "border-line-strong hover:bg-slate-50")}>
            <p className="text-sm font-medium text-ink">Custom — type your own</p>
            <p className="mt-0.5 text-xs text-muted">Play any caller. Try “I smell gas”, a price question, or an address in Park City.</p>
          </button>
        </CardContent>
      </Card>

      {/* Conversation */}
      <Card className="flex min-h-[640px] flex-col">
        <CardHeader className="flex-wrap">
          <div className="flex items-center gap-2">
            <span className={cn("flex size-8 items-center justify-center rounded-full", callId && !ended ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-muted")}>
              {callId && !ended ? <PhoneCall className="size-4 animate-pulse-dot" /> : <PhoneOff className="size-4" />}
            </span>
            <div>
              <CardTitle>{callId ? (ended ? "Call ended" : "Live call") : "Ready"}</CardTitle>
              <p className="text-xs text-muted">Inbound to Summit Peak HVAC · (801) 555-0198</p>
            </div>
          </div>
          <DemoTag>Simulated call</DemoTag>
        </CardHeader>
        {!callId ? (
          <CardContent className="grid gap-3 border-b border-line sm:grid-cols-2">
            <div>
              <Label htmlFor="caller">Caller ID</Label>
              <Input id="caller" value={callerNumber} onChange={(e) => setCallerNumber(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="clock">Time of call</Label>
              <Select id="clock" value={clock} onChange={(e) => setClock(e.target.value as SimulatedClock)}>
                <option value="after_hours">After hours (office closed)</option>
                <option value="business_hours">Business hours</option>
                <option value="auto">Use the real current time</option>
              </Select>
            </div>
            <Button variant="accent" className="sm:col-span-2" onClick={startCall} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <PhoneCall />} Place simulated call
            </Button>
          </CardContent>
        ) : null}
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
          {!turns.length ? (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center text-sm text-muted">
              <Bot className="mb-2 size-8 text-slate-300" />
              Pick a scenario and place the call. You&apos;ll play the caller; each line is pre-filled from the script and fully editable.
            </div>
          ) : null}
          {turns.map((t, i) => (
            <div key={i} className={cn("flex gap-2", t.speaker === "CALLER" ? "flex-row-reverse" : "")}>
              <span className={cn("mt-1 flex size-7 shrink-0 items-center justify-center rounded-full", t.speaker === "CALLER" ? "bg-slate-200 text-ink-2" : "bg-teal-100 text-accent")} aria-hidden>
                {t.speaker === "CALLER" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
              </span>
              <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm", t.speaker === "CALLER" ? "rounded-tr-sm bg-brand text-white" : "rounded-tl-sm bg-slate-100 text-ink")}>
                <span className="sr-only">{t.speaker === "CALLER" ? "Caller" : "AI receptionist"}: </span>
                {t.text}
              </div>
            </div>
          ))}
          {pending && callId ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" /> AI is responding…
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
        {callId ? (
          <div className="border-t border-line p-3">
            {ended ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex-1 text-sm text-muted">The call is saved with transcript, summary and timeline.</p>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/calls/${callId}`}>
                    <ExternalLink /> View call record
                  </Link>
                </Button>
                <Button size="sm" onClick={reset}>
                  <RotateCcw /> New call
                </Button>
              </div>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(text);
                }}
              >
                <Input aria-label="What the caller says" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type what the caller says…" disabled={pending} autoFocus />
                <Button type="submit" disabled={pending || !text.trim()}>
                  <Send /> Say
                </Button>
              </form>
            )}
            {!ended && scenario && lineIdx < scenario.script.length ? <p className="mt-1.5 text-[11px] text-muted">Script line {lineIdx + 1} of {scenario.script.length} — edit freely or type something else.</p> : null}
          </div>
        ) : null}
      </Card>

      {/* Live system activity */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>What the AI understood</CardTitle>
            {clock === "after_hours" ? (
              <Badge tone="violet">
                <Moon /> After hours
              </Badge>
            ) : (
              <Badge tone="blue">
                <Sun /> {clock === "business_hours" ? "Business hours" : "Real time"}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={data?.isEmergency ? "red" : data?.urgency === "HIGH" ? "amber" : "neutral"}>
                {data?.isEmergency ? <AlertTriangle /> : null} Urgency: {data?.urgency?.toLowerCase() ?? "—"}
              </Badge>
              <Badge tone={data?.inServiceArea === undefined ? "neutral" : data.inServiceArea ? "green" : "red"}>
                <MapPin /> {data?.inServiceArea === undefined ? "Area not checked" : data.inServiceArea ? `In area · ${data.county} County` : "Outside service area"}
              </Badge>
            </div>
            {data?.urgencyReasons?.length ? <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-800">{data.urgencyReasons.join(" · ")}</p> : null}
            <dl className="space-y-1.5">
              {fields.map((f) => (
                <div key={f.label} className="flex items-start gap-2 text-sm">
                  {f.value ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-slate-300" />}
                  <dt className="w-20 shrink-0 text-muted">{f.label}</dt>
                  <dd className={cn("min-w-0 break-words", f.value ? "text-ink" : "text-slate-400")}>{f.value || "Not collected yet"}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Records created</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <RecordRow icon={<UserSquare2 className="size-4" />} label="Lead" done={!!records?.lead} href={records?.lead ? `/leads/${records.lead.id}` : undefined}>
              {records?.lead ? `${records.lead.requestedService} · ${records.lead.status.toLowerCase().replace("_", " ")}` : "Created once name + phone are known"}
            </RecordRow>
            <RecordRow icon={<CalendarCheck className="size-4" />} label="Appointment" done={!!records?.appointment} href={records?.appointment ? `/calendar?date=${records.appointment.startAt.slice(0, 10)}&appt=${records.appointment.id}` : undefined}>
              {records?.appointment ? `${new Date(records.appointment.startAt).toLocaleString("en-US", { timeZone: "America/Denver", weekday: "short", hour: "numeric", minute: "2-digit" })} · ${records.appointment.technician ?? ""}` : "Booked when the caller picks a slot"}
            </RecordRow>
            <RecordRow icon={<ArrowRightLeft className="size-4" />} label="Transfer" done={state?.stage === "transferred"}>
              {state?.stage === "transferred" ? "Warm transfer (simulated)" : "Only if requested or safety issue"}
            </RecordRow>
            <RecordRow icon={<PhoneCall className="size-4" />} label="Call record" done={!!callId} href={callId ? `/calls/${callId}` : undefined}>
              {callId ? (ended ? "Completed with AI summary" : "In progress") : "Starts with the call"}
            </RecordRow>
          </CardContent>
        </Card>
        {records?.messages.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="size-4" /> SMS sent
              </CardTitle>
              <DemoTag />
            </CardHeader>
            <CardContent className="space-y-2">
              {records.messages.map((m) => (
                <div key={m.id} className="rounded-2xl rounded-tr-sm bg-brand px-3 py-2 text-xs leading-relaxed text-white">
                  {m.body}
                </div>
              ))}
              {records.customer ? (
                <Link href={`/inbox?customer=${records.customer.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                  Open in Inbox <ExternalLink className="size-3" />
                </Link>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {records?.events.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {records.events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p className="font-medium text-ink">{e.title}</p>
                    {e.detail ? <p className="line-clamp-2 text-xs text-muted">{e.detail}</p> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function RecordRow({ icon, label, done, href, children }: { icon: React.ReactNode; label: string; done: boolean; href?: string; children: React.ReactNode }) {
  const body = (
    <div className={cn("flex items-start gap-3 rounded-lg border p-2.5", done ? "border-emerald-200 bg-emerald-50/50" : "border-line")}>
      <span className={cn("mt-0.5", done ? "text-emerald-700" : "text-slate-400")}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{label}</p>
        <p className="truncate text-xs text-muted">{children}</p>
      </div>
      {done ? <CheckCircle2 className="size-4 text-emerald-600" /> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
