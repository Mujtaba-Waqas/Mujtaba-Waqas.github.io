"use client";

import { BookOpen, Loader2, Save, Send, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { testAIResponseAction } from "@/app/(app)/actions";
import { saveReceptionistAction } from "@/app/(app)/settings-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import type { ReceptionistSettings } from "@/lib/validation/settings";

const CATEGORIES = ["COMPANY", "SERVICES", "HOURS", "SERVICE_AREA", "FAQ", "PRICING", "FINANCING", "EMERGENCY", "ESCALATION"];

export function ReceptionistForm({ initial, businessName, kbCounts }: { initial: ReceptionistSettings; businessName: string; kbCounts: Record<string, number> }) {
  const [s, setS] = useState(initial);
  const [claims, setClaims] = useState(initial.prohibitedClaims.join("\n"));
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const router = useRouter();
  const set = <K extends keyof ReceptionistSettings>(k: K, v: ReceptionistSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const err = (k: string) => errors[k]?.[0];
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveReceptionistAction({ ...s, prohibitedClaims: claims.split("\n").map((c) => c.trim()).filter(Boolean) });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            return void toast.error(r.error);
          }
          setErrors({});
          toast.success("Receptionist settings saved");
          router.refresh();
        });
      }}
    >
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Greeting & voice</CardTitle>
            <CardDescription>{"{business}"} is replaced with “{businessName}”.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Business-hours greeting" htmlFor="greeting" className="sm:col-span-2" error={err("greeting")}>
            <Textarea id="greeting" rows={2} value={s.greeting} onChange={(e) => set("greeting", e.target.value)} />
          </Field>
          <Field label="After-hours greeting" htmlFor="ahg" className="sm:col-span-2" error={err("afterHoursGreeting")}>
            <Textarea id="ahg" rows={2} value={s.afterHoursGreeting} onChange={(e) => set("afterHoursGreeting", e.target.value)} />
          </Field>
          <Field label="Personality" htmlFor="personality">
            <Select id="personality" value={s.personality} onChange={(e) => set("personality", e.target.value as ReceptionistSettings["personality"])}>
              <option value="warm">Warm & reassuring</option>
              <option value="professional">Professional & efficient</option>
              <option value="concise">Concise</option>
            </Select>
          </Field>
          <Field label="Voice" htmlFor="voice" hint="Applied by the live voice provider (Twilio/TTS).">
            <Select id="voice" value={s.voice} onChange={(e) => set("voice", e.target.value as ReceptionistSettings["voice"])}>
              <option value="female_1">Female — warm</option>
              <option value="female_2">Female — bright</option>
              <option value="male_1">Male — calm</option>
              <option value="male_2">Male — friendly</option>
            </Select>
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Escalation & recording</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Transfer phone number" htmlFor="transfer" error={err("transferNumber")}>
            <Input id="transfer" value={s.transferNumber} onChange={(e) => set("transferNumber", e.target.value)} />
          </Field>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm">
            <span>
              Transfer only during business hours
              <span className="block text-xs text-muted">After hours, non-emergencies get a priority callback.</span>
            </span>
            <Switch checked={s.transferDuringHoursOnly} onCheckedChange={(v) => set("transferDuringHoursOnly", v)} aria-label="Transfer only during business hours" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm sm:col-span-2">
            <span>
              Record and transcribe calls
              <span className="block text-xs text-muted">Utah is a one-party consent state, but callers may be in all-party consent states (e.g. California). Keep the disclosure on whenever recording is enabled.</span>
            </span>
            <Switch checked={s.recordingEnabled} onCheckedChange={(v) => set("recordingEnabled", v)} aria-label="Record and transcribe calls" />
          </label>
          <Field label="Recording disclosure (spoken at the start of every call)" htmlFor="disclosure" className="sm:col-span-2">
            <Input id="disclosure" value={s.recordingDisclosure} onChange={(e) => set("recordingDisclosure", e.target.value)} disabled={!s.recordingEnabled} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-4" /> FAQ sources
            </CardTitle>
            <CardDescription>Knowledge-base categories the AI may answer from.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const on = s.knowledgeCategories.includes(c);
            return (
              <button
                type="button"
                key={c}
                aria-pressed={on}
                onClick={() => set("knowledgeCategories", on ? s.knowledgeCategories.filter((x) => x !== c) : [...s.knowledgeCategories, c])}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-accent bg-accent-50 text-accent" : "border-line text-muted hover:bg-slate-50"}`}
              >
                {c.replace("_", " ").toLowerCase()} · {kbCounts[c] ?? 0}
              </button>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-red-500" /> Prohibited claims
            </CardTitle>
            <CardDescription>One phrase per line. Any AI sentence containing one is removed before it reaches a customer.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea aria-label="Prohibited claims" rows={6} value={claims} onChange={(e) => setClaims(e.target.value)} className="font-mono text-xs" />
        </CardContent>
      </Card>
      <Button disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Save receptionist settings
      </Button>
    </form>
  );
}

const SAMPLES = ["How much is a service call?", "Do you work on Lennox furnaces?", "Can I finance a new AC?", "How much does a new furnace cost?", "Do you come out to Park City?", "Are you open Saturday?"];

export function TestPanel({ engine }: { engine: string }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ answer: string; sources: { title: string }[]; grounded: boolean; violations: string[]; provider: string } | null>(null);
  const [pending, start] = useTransition();
  const ask = (question: string) =>
    start(async () => {
      setQ(question);
      const r = await testAIResponseAction({ question });
      if (!r.ok) return void toast.error(r.error);
      setRes(r.data!);
    });
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Test AI response</CardTitle>
          <CardDescription>{engine}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {SAMPLES.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-ink-2 hover:bg-slate-200">
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim().length >= 3) ask(q);
          }}
        >
          <Input aria-label="Caller question" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask what a caller might ask…" />
          <Button size="icon" disabled={pending} aria-label="Ask">
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </form>
        {res ? (
          <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm">
            <p className="text-ink">{res.answer}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge tone={res.grounded ? "green" : "amber"}>{res.grounded ? "Grounded in knowledge base" : "Not in knowledge base — deferred"}</Badge>
              {res.sources.map((s) => (
                <Badge key={s.title}>{s.title}</Badge>
              ))}
              {res.violations.length ? <Badge tone="red">Removed: {res.violations.join(", ")}</Badge> : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
