"use client";

import { CheckCircle2, Loader2, Pause, Pencil, Play, Send, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { assignEstimateAction, estimateCommandAction, manualFollowupAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";

type Cmd = "send" | "accept" | "decline" | "pause" | "resume";

export function EstimateActions({ id, status, paused }: { id: string; status: string; paused: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (command: Cmd, msg: string) =>
    start(async () => {
      if ((command === "accept" || command === "decline") && !window.confirm(`Mark this estimate as ${command === "accept" ? "accepted" : "declined"}? Pending follow-ups will be cancelled.`)) return;
      const r = await estimateCommandAction({ id, command });
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      router.refresh();
    });
  const open = status === "SENT" || status === "VIEWED";
  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" ? (
        <>
          <Button asChild variant="outline" size="sm">
            <Link href={`/estimates/${id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <Button size="sm" disabled={pending} onClick={() => run("send", "Marked as sent — follow-ups scheduled for day 1, 3, 7")}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Mark as sent
          </Button>
        </>
      ) : null}
      {open ? (
        <>
          <Button asChild variant="outline" size="sm">
            <Link href={`/estimates/${id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
          {paused ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run("resume", "Automation resumed")}>
              <Play /> Resume automation
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run("pause", "Automation paused")}>
              <Pause /> Pause automation
            </Button>
          )}
          <Button size="sm" variant="accent" disabled={pending} onClick={() => run("accept", "Estimate accepted")}>
            <CheckCircle2 /> Mark accepted
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run("decline", "Estimate declined")}>
            <XCircle /> Mark declined
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function AssignSelect({ id, value, employees }: { id: string; value: string | null; employees: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Select
      aria-label="Assigned staff member"
      className="h-8"
      disabled={pending}
      defaultValue={value ?? ""}
      onChange={(e) =>
        start(async () => {
          const r = await assignEstimateAction({ id, employeeId: e.target.value || null });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Assignment updated");
          router.refresh();
        })
      }
    >
      <option value="">Unassigned</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </Select>
  );
}

export function ManualFollowup({ id, defaultBody, disabled }: { id: string; defaultBody: string; disabled?: string | null }) {
  const [body, setBody] = useState(defaultBody);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (disabled) return <p className="rounded-md bg-slate-50 p-3 text-sm text-muted">{disabled}</p>;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await manualFollowupAction({ id, body });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Follow-up sent (simulated SMS in demo mode)");
          router.refresh();
        });
      }}
    >
      <Textarea aria-label="Follow-up message" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1600} />
      <Button size="sm" variant="outline" disabled={pending || body.trim().length < 5}>
        {pending ? <Loader2 className="animate-spin" /> : <Send />} Send manual follow-up
      </Button>
    </form>
  );
}
