import { Bot, Cog, MessageSquare, User, Workflow } from "lucide-react";
import type { Actor } from "@prisma/client";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICON: Record<Actor, typeof Bot> = { AI: Bot, AUTOMATION: Workflow, STAFF: User, CUSTOMER: MessageSquare, SYSTEM: Cog };
const TONE: Record<Actor, string> = {
  AI: "bg-teal-50 text-accent ring-teal-200",
  AUTOMATION: "bg-blue-50 text-brand ring-blue-200",
  STAFF: "bg-slate-100 text-ink-2 ring-slate-200",
  CUSTOMER: "bg-amber-50 text-amber-700 ring-amber-200",
  SYSTEM: "bg-slate-50 text-muted ring-slate-200",
};

export function Timeline({ events, tz, empty = "No activity yet." }: { events: { id: string; title: string; detail: string | null; actor: Actor; createdAt: Date }[]; tz: string; empty?: string }) {
  if (!events.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-line">
      {events.map((e) => {
        const Icon = ICON[e.actor];
        return (
          <li key={e.id} className="relative flex gap-3">
            <span className={cn("relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-1", TONE[e.actor])}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium text-ink">{e.title}</p>
              {e.detail ? <p className="mt-0.5 whitespace-pre-line break-words text-xs text-muted">{e.detail}</p> : null}
              <p className="mt-0.5 text-[11px] text-slate-400">
                {e.actor.toLowerCase()} · {formatDateTime(e.createdAt, tz)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
