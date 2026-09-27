import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "bg-slate-50 text-slate-700 ring-slate-200",
      blue: "bg-blue-50 text-blue-700 ring-blue-200",
      teal: "bg-teal-50 text-teal-700 ring-teal-200",
      green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      amber: "bg-amber-50 text-amber-800 ring-amber-200",
      red: "bg-red-50 text-red-700 ring-red-200",
      violet: "bg-violet-50 text-violet-700 ring-violet-200",
      navy: "bg-ink text-white ring-ink",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
