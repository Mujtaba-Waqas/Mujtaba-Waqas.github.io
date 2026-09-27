"use client";

import type { LeadStatus } from "@prisma/client";
import { ChevronLeft, ChevronRight, Loader2, Trophy, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { updateLeadStatusAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { LEAD_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ORDER: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "BOOKED", "ESTIMATE_SENT", "WON", "LOST"];
const OPEN: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "BOOKED", "ESTIMATE_SENT"];

function useMove(id: string) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const move = (status: LeadStatus) =>
    start(async () => {
      let lostReason: string | undefined;
      if (status === "LOST") {
        lostReason = window.prompt("Why was this lead lost?", "Went with another company") ?? undefined;
        if (lostReason === undefined) return;
      }
      const r = await updateLeadStatusAction({ id, status, lostReason });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Moved to ${LEAD_STATUS[status].label}`);
      router.refresh();
    });
  return { pending, move };
}

/** Compact prev/next controls for pipeline cards. */
export function CardStageButtons({ id, status }: { id: string; status: LeadStatus }) {
  const { pending, move } = useMove(id);
  const idx = OPEN.indexOf(status);
  if (idx < 0) return null;
  return (
    <div className="flex items-center gap-1">
      <button disabled={pending || idx === 0} onClick={() => move(OPEN[idx - 1])} className="rounded p-1 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-30" aria-label={`Move back to ${idx > 0 ? LEAD_STATUS[OPEN[idx - 1]].label : ""}`}>
        <ChevronLeft className="size-3.5" />
      </button>
      {pending ? <Loader2 className="size-3.5 animate-spin text-muted" /> : null}
      <button disabled={pending} onClick={() => move(idx === OPEN.length - 1 ? "WON" : OPEN[idx + 1])} className="rounded p-1 text-muted hover:bg-slate-100 hover:text-ink" aria-label={`Advance to ${idx === OPEN.length - 1 ? "Won" : LEAD_STATUS[OPEN[idx + 1]].label}`}>
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}

/** Full stage stepper for the lead detail page. */
export function StageStepper({ id, status }: { id: string; status: LeadStatus }) {
  const { pending, move } = useMove(id);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap overflow-hidden rounded-lg border border-line">
        {ORDER.slice(0, 5).map((s) => (
          <button
            key={s}
            disabled={pending || s === status}
            onClick={() => move(s)}
            className={cn("border-r border-line px-3 py-1.5 text-xs font-medium last:border-r-0", s === status ? "bg-ink text-white" : "bg-surface text-ink-2 hover:bg-slate-50")}
            aria-pressed={s === status}
          >
            {LEAD_STATUS[s].label}
          </button>
        ))}
      </div>
      <Button size="sm" variant="accent" disabled={pending || status === "WON"} onClick={() => move("WON")}>
        <Trophy /> Mark won
      </Button>
      <Button size="sm" variant="outline" disabled={pending || status === "LOST"} onClick={() => move("LOST")}>
        <XCircle /> Mark lost
      </Button>
    </div>
  );
}
