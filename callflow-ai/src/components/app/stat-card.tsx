import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, icon: Icon, hint, delta, emphasis, footnote }: { label: string; value: string; icon: LucideIcon; hint?: string; delta?: number | null; emphasis?: boolean; footnote?: string }) {
  return (
    <div className={cn("rounded-xl border p-4", emphasis ? "border-teal-200 bg-gradient-to-br from-accent-50 to-white" : "border-line bg-surface")}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        <Icon className={cn("size-4", emphasis ? "text-accent" : "text-slate-400")} aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular">{value}</p>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        {delta !== undefined && delta !== null && Number.isFinite(delta) ? (
          <span className={cn("inline-flex items-center font-medium", delta >= 0 ? "text-emerald-700" : "text-red-600")}>
            {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(Math.round(delta * 100))}%
          </span>
        ) : null}
        {hint ? <span className="truncate">{hint}</span> : null}
      </div>
      {footnote ? <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">{footnote}</p> : null}
    </div>
  );
}
