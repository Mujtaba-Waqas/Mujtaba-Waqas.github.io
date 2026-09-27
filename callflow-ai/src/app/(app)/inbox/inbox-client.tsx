"use client";

import { Ban, FlaskConical, Hand, Loader2, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { markReadAction, sendSmsAction, setTakeoverAction, simulateInboundSmsAction, suggestReplyAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";

export function MarkRead({ conversationId, unread }: { conversationId: string; unread: number }) {
  useEffect(() => {
    if (unread) void markReadAction({ conversationId });
  }, [conversationId, unread]);
  return null;
}

export function TakeoverToggle({ conversationId, enabled, reason }: { conversationId: string; enabled: boolean; reason: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <Hand className="size-4 text-muted" aria-hidden />
      <span className="text-ink-2">
        Human takeover
        {enabled && reason ? <span className="block text-[11px] text-amber-700">{reason}</span> : <span className="block text-[11px] text-muted">{enabled ? "AI auto-replies paused" : "AI may auto-reply"}</span>}
      </span>
      <Switch
        checked={enabled}
        disabled={pending}
        aria-label="Human takeover"
        onCheckedChange={(v) =>
          start(async () => {
            const r = await setTakeoverAction({ conversationId, enabled: v });
            if (!r.ok) toast.error(r.error);
            router.refresh();
          })
        }
      />
    </label>
  );
}

export function Composer({ conversationId, customerId, optedOut }: { conversationId: string; customerId: string; optedOut: boolean }) {
  const [body, setBody] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [suggesting, startSuggest] = useTransition();
  const router = useRouter();
  if (optedOut)
    return (
      <div className="flex items-center gap-2 border-t border-line bg-red-50 px-5 py-3 text-sm text-red-800">
        <Ban className="size-4" /> This customer replied STOP. Messaging is blocked until they text START.
      </div>
    );
  return (
    <form
      className="border-t border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await sendSmsAction({ customerId, body });
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.data?.simulated ? "Sent (simulated SMS)" : "Sent");
          setBody("");
          setSources([]);
          router.refresh();
        });
      }}
    >
      <Textarea aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" rows={2} className="resize-none" maxLength={1600} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={suggesting}
          onClick={() =>
            startSuggest(async () => {
              const r = await suggestReplyAction({ conversationId });
              if (!r.ok) return void toast.error(r.error);
              setBody(r.data!.reply);
              setSources(r.data!.sources);
            })
          }
        >
          {suggesting ? <Loader2 className="animate-spin" /> : <Sparkles />} AI suggested reply
        </Button>
        {sources.length ? <span className="text-[11px] text-muted">Grounded in: {sources.join(", ")}</span> : null}
        <span className="flex-1" />
        <span className="text-[11px] text-muted tabular">{body.length}/1600</span>
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />} Send
        </Button>
      </div>
    </form>
  );
}

const QUICK = ["YES", "No thanks", "STOP", "Can I talk to someone?", "5", "2 — still broken", "START"];

export function SimulateReply({ customerId }: { customerId: string }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const send = (text: string) =>
    start(async () => {
      const r = await simulateInboundSmsAction({ customerId, body: text });
      if (!r.ok) return void toast.error(r.error);
      const labels: Record<string, string> = {
        OPTED_OUT: "Customer opted out — all automation stopped",
        OPTED_IN: "Customer re-subscribed",
        HANDOFF: "Handed off to staff",
        REVIEW_POSITIVE: "Positive feedback — review link sent",
        REVIEW_NEGATIVE: "Negative feedback — routed to owner",
        ESTIMATE_ACCEPTED: "Estimate accepted via SMS",
        ESTIMATE_DECLINED: "Estimate declined via SMS",
        IGNORED_OPTED_OUT: "Stored — customer is opted out, no auto-reply",
        HELP: "Help info sent",
        STORED: "Message received",
      };
      toast.success(labels[r.data!.action] ?? "Received");
      setBody("");
      router.refresh();
    });
  return (
    <Card className="border-dashed border-amber-300 bg-amber-50/40 p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
        <FlaskConical className="size-3.5" /> Demo: simulate customer reply
      </p>
      <p className="mt-1 text-xs text-ink-2">Runs the same inbound pipeline a Twilio webhook would.</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {QUICK.map((q) => (
          <button key={q} type="button" disabled={pending} onClick={() => send(q)} className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-xs text-ink hover:bg-amber-100">
            {q}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) send(body);
        }}
      >
        <input aria-label="Simulated customer message" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Customer says…" className="h-8 flex-1 rounded-md border border-amber-300 bg-white px-2 text-sm" />
        <Button size="sm" variant="outline" disabled={pending || !body.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : null} Receive
        </Button>
      </form>
    </Card>
  );
}
