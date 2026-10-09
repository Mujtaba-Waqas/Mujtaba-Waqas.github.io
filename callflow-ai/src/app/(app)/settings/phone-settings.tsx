"use client";

import { BellRing, Loader2, PhoneForwarded, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePhoneSettingsAction, sendTestAlertAction } from "@/app/(app)/settings-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Mode = "text_back" | "ring_then_text_back" | "ai_receptionist";
type Initial = { mode: Mode; callflowNumber: string; officeNumber: string; ringSeconds: number; alertPhone: string; voicemail: boolean; missedCallMessage: string; quietHoursStart: string; quietHoursEnd: string };

const MODES: { value: Mode; title: string; body: string }[] = [
  { value: "text_back", title: "Missed-call text-back", body: "Your phone forwards unanswered calls to your CallFlow number. Callers hear a short message, can leave a voicemail, and get a text right away. (Recommended for pilots.)" },
  { value: "ring_then_text_back", title: "Ring my office first", body: "Publish your CallFlow number. It rings your office; if nobody answers, the caller gets the message and an instant text." },
  { value: "ai_receptionist", title: "AI receptionist", body: "The AI answers every call to the CallFlow number, triages, and books. Try it in the call simulator first." },
];

export function PhoneSettingsForm({ initial, webhookBase, liveSms }: { initial: Initial; webhookBase: string; liveSms: boolean }) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const router = useRouter();
  const set = <K extends keyof Initial>(k: K, val: Initial[K]) => setV((x) => ({ ...x, [k]: val }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await savePhoneSettingsAction(v);
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            return void toast.error(r.error);
          }
          setErrors({});
          toast.success("Phone settings saved");
          router.refresh();
        });
      }}
    >
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-ink-2">When someone calls your CallFlow number</legend>
        <div className="grid gap-2">
          {MODES.map((m) => (
            <label key={m.value} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", v.mode === m.value ? "border-accent bg-accent-50" : "border-line")}>
              <input type="radio" name="mode" className="mt-1 accent-teal-600" checked={v.mode === m.value} onChange={() => set("mode", m.value)} />
              <span>
                <span className="block text-sm font-medium text-ink">{m.title}</span>
                <span className="block text-xs text-muted">{m.body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your CallFlow (Twilio) number" htmlFor="cfn" error={errors.callflowNumber?.[0]} hint="The number you bought in Twilio for this company.">
          <Input id="cfn" value={v.callflowNumber} onChange={(e) => set("callflowNumber", e.target.value)} placeholder="(801) 555-0100" />
        </Field>
        <Field label="Staff alert phone" htmlFor="alert" error={errors.alertPhone?.[0]} hint="Gets a text when customers reply, leave voicemail, or accept an estimate.">
          <Input id="alert" value={v.alertPhone} onChange={(e) => set("alertPhone", e.target.value)} placeholder="Owner or dispatcher cell" />
        </Field>
        {v.mode === "ring_then_text_back" ? (
          <>
            <Field label="Office phone to ring first" htmlFor="office" error={errors.officeNumber?.[0]}>
              <Input id="office" value={v.officeNumber} onChange={(e) => set("officeNumber", e.target.value)} />
            </Field>
            <Field label="Ring for (seconds)" htmlFor="ring">
              <Input id="ring" type="number" min={10} max={45} value={v.ringSeconds} onChange={(e) => set("ringSeconds", Number(e.target.value))} />
            </Field>
          </>
        ) : null}
      </div>
      {v.mode !== "ai_receptionist" ? (
        <>
          <Field label="Message callers hear" htmlFor="mcm" error={errors.missedCallMessage?.[0]} hint="{business} is replaced with your company name.">
            <Textarea id="mcm" rows={2} value={v.missedCallMessage} onChange={(e) => set("missedCallMessage", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={v.voicemail} onCheckedChange={(x) => set("voicemail", x)} aria-label="Let callers leave a voicemail" /> Let callers leave a voicemail (up to 2 minutes)
          </label>
        </>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Quiet hours start" htmlFor="qs" hint="No scheduled follow-ups/reminders during quiet hours.">
          <Input id="qs" type="time" value={v.quietHoursStart} onChange={(e) => set("quietHoursStart", e.target.value)} />
        </Field>
        <Field label="Quiet hours end" htmlFor="qe">
          <Input id="qe" type="time" value={v.quietHoursEnd} onChange={(e) => set("quietHoursEnd", e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save phone settings
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={testing}
          onClick={() =>
            startTest(async () => {
              const r = await sendTestAlertAction({});
              if (!r.ok) return void toast.error(r.error);
              toast.success(r.data?.simulated ? "Test alert simulated (demo mode, no real text sent)" : "Test alert sent. Check the phone");
            })
          }
        >
          {testing ? <Loader2 className="animate-spin" /> : <BellRing />} Send test alert
        </Button>
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-ink-2">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
          <PhoneForwarded className="size-3.5" /> Twilio setup for this number
        </p>
        <p>
          Voice “A call comes in” → <code className="font-mono">{webhookBase}/api/webhooks/twilio/voice</code>
        </p>
        <p>
          Messaging “A message comes in” → <code className="font-mono">{webhookBase}/api/webhooks/twilio/sms</code>
        </p>
        <p className="mt-1">{liveSms ? "Live SMS sending is ON for this deployment." : "SMS is simulated on this deployment. Real texts require Twilio credentials and SMS_LIVE_SENDING=true."}</p>
      </div>
    </form>
  );
}
