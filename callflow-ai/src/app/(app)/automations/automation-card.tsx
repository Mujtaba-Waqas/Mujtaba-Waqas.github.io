"use client";

import type { AutomationKey } from "@prisma/client";
import { ChevronDown, Clock, Loader2, OctagonX, Save, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleAutomationAction, updateAutomationAction } from "@/app/(app)/actions";
import { RunAutomationButton } from "@/components/app/run-automation-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TEMPLATE_LABELS: Partial<Record<AutomationKey, string[]>> = {
  ESTIMATE_RECOVERY: ["Follow-up #1", "Follow-up #2", "Follow-up #3 (final)"],
  REVIEW_REQUESTS: ["Satisfaction check", "Review request (sent after positive reply)"],
};
const VARS: Record<AutomationKey, string> = {
  ESTIMATE_RECOVERY: "{{firstName}} {{business}} {{estimateNumber}} {{service}} {{amount}} {{phone}}",
  APPOINTMENT_REMINDERS: "{{firstName}} {{business}} {{service}} {{time}} {{technician}} {{phone}}",
  REVIEW_REQUESTS: "{{firstName}} {{business}} {{technician}} {{reviewLink}}",
  MISSED_CALL_RECOVERY: "{{firstName}} {{business}} {{phone}}",
  NEW_LEAD_FOLLOWUP: "{{firstName}} {{business}} {{service}}",
};

function delayLabel(h: number) {
  if (h === 0) return "Immediately";
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h / 24} day${h === 24 ? "" : "s"}`;
}

export function AutomationCard({
  automation: a,
  runs,
  tz,
}: {
  automation: { key: AutomationKey; name: string; description: string; enabled: boolean; triggerDescription: string; templates: string[]; delaysHours: number[]; stopConditions: string[]; lastRunAt: string | null };
  runs: { id: string; trigger: string; status: string; processed: number; actionsTaken: number; skipped: number; startedAt: string; log: { level: string; message: string }[] }[];
  tz: string;
}) {
  const [open, setOpen] = useState(a.key === "ESTIMATE_RECOVERY");
  const [enabled, setEnabled] = useState(a.enabled);
  const [templates, setTemplates] = useState(a.templates);
  const [delays, setDelays] = useState(a.delaysHours.map(String));
  const [pending, start] = useTransition();
  const [saving, startSave] = useTransition();
  const router = useRouter();
  const labels = TEMPLATE_LABELS[a.key] ?? ["Message template"];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <span className={cn("flex size-9 items-center justify-center rounded-lg", enabled ? "bg-accent-50 text-accent" : "bg-slate-100 text-muted")}>
          <Zap className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-ink">{a.name}</h2>
            <Badge tone={enabled ? "green" : "neutral"}>{enabled ? "Enabled" : "Disabled"}</Badge>
          </div>
          <p className="text-sm text-muted">{a.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={enabled}
            disabled={pending}
            aria-label={`${enabled ? "Disable" : "Enable"} ${a.name}`}
            onCheckedChange={(v) =>
              start(async () => {
                const r = await toggleAutomationAction({ key: a.key, enabled: v });
                if (!r.ok) return void toast.error(r.error);
                setEnabled(v);
                toast.success(`${a.name} ${v ? "enabled" : "disabled"}`);
                router.refresh();
              })
            }
          />
          <RunAutomationButton automationKey={a.key} onDone={() => router.refresh()} />
          <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Toggle details">
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      </div>
      {open ? (
        <div className="grid gap-5 border-t border-line px-5 py-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Trigger</p>
                <p className="mt-1 text-sm text-ink">{a.triggerDescription}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Last run</p>
                <p className="mt-1 text-sm text-ink">{a.lastRunAt ? formatDateTime(a.lastRunAt, tz) : "Never"}</p>
              </div>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
                <OctagonX className="size-3.5" /> Stop conditions
              </p>
              <div className="flex flex-wrap gap-1">
                {a.stopConditions.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                startSave(async () => {
                  const r = await updateAutomationAction({ key: a.key, enabled, templates, delaysHours: delays.map(Number) });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success("Automation saved");
                  router.refresh();
                });
              }}
            >
              {templates.map((t, i) => (
                <div key={i}>
                  <div className="flex items-end justify-between gap-2">
                    <Label htmlFor={`${a.key}-t${i}`}>{labels[i] ?? `Message ${i + 1}`}</Label>
                    {a.key === "ESTIMATE_RECOVERY" || i === 0 ? (
                      <label className="mb-1 flex items-center gap-1 text-[11px] text-muted">
                        <Clock className="size-3" /> Delay (hours)
                        <Input
                          aria-label={`Delay for ${labels[i] ?? "message"}`}
                          type="number"
                          min={0}
                          className="h-6 w-16 px-1.5 text-xs"
                          value={delays[i] ?? delays[0]}
                          onChange={(e) => setDelays((d) => Object.assign([...d], { [i]: e.target.value }))}
                        />
                        <span>({delayLabel(Number(delays[i] ?? delays[0]) || 0)})</span>
                      </label>
                    ) : null}
                  </div>
                  <Textarea id={`${a.key}-t${i}`} rows={3} value={t} onChange={(e) => setTemplates((ts) => ts.map((x, j) => (j === i ? e.target.value : x)))} />
                </div>
              ))}
              <p className="text-[11px] text-muted">Variables: {VARS[a.key]}</p>
              <Button size="sm" variant="outline" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />} Save changes
              </Button>
            </form>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Activity log</p>
            {runs.length ? (
              <ol className="space-y-2">
                {runs.map((r) => (
                  <li key={r.id} className="rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge tone={r.status === "SUCCESS" ? "green" : r.status === "NOOP" ? "neutral" : r.status === "PARTIAL" ? "amber" : "red"}>{r.status.toLowerCase()}</Badge>
                      <span className="text-muted">{r.trigger === "MANUAL" ? "Run now (demo)" : r.trigger.toLowerCase()}</span>
                      <span className="text-muted">·</span>
                      <span className="text-muted">{formatDateTime(r.startedAt, tz)}</span>
                      <span className="ml-auto text-muted tabular">
                        {r.actionsTaken} sent · {r.skipped} stopped
                      </span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {r.log.slice(0, 5).map((l, i) => (
                        <li key={i} className={cn("text-xs", l.level === "action" ? "text-ink" : l.level === "stop" ? "text-red-700" : l.level === "error" ? "text-red-700" : "text-muted")}>
                          {l.level === "action" ? "✓ " : l.level === "stop" ? "■ " : "· "}
                          {l.message}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">No runs yet. Click “Run now” to process pending actions.</p>
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
