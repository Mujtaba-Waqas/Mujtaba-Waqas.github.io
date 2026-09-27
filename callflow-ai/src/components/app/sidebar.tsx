"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

export function SidebarNav({ allowed, badges, onNavigate }: { allowed: string[]; badges: Record<string, number>; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
      {NAV.filter((n) => allowed.includes(n.href)).map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className={cn("size-4", active ? "text-teal-300" : "text-slate-400 group-hover:text-slate-200")} />
            <span className="flex-1">{label}</span>
            {badges[href] ? <span className="rounded-full bg-teal-500/20 px-1.5 text-[11px] font-semibold text-teal-200 tabular">{badges[href]}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-5 py-5 text-base font-semibold text-white">
      <span className="flex size-7 items-center justify-center rounded-lg bg-accent">
        <PhoneCall className="size-3.5" />
      </span>
      CallFlow AI
    </Link>
  );
}
