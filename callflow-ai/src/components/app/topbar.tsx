"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Building2, Check, ChevronsUpDown, LogOut, Menu, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { logoutAction, switchOrganizationAction } from "@/app/login/actions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/misc";
import { Brand, SidebarNav } from "./sidebar";

const itemCls = "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-slate-100";

export function OrgSwitcher({ current, memberships }: { current: { id: string; name: string }; memberships: { organizationId: string; name: string; role: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex max-w-[240px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm font-medium text-ink hover:bg-slate-50" aria-label="Switch organization">
        <Building2 className="size-4 text-muted" />
        <span className="truncate">{current.name}</span>
        <ChevronsUpDown className="size-3.5 text-muted" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="z-50 min-w-[240px] rounded-lg border border-line bg-surface p-1 shadow-lg">
          <DropdownMenu.Label className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Organizations</DropdownMenu.Label>
          {memberships.map((m) => (
            <DropdownMenu.Item key={m.organizationId} disabled={pending} className={itemCls} onSelect={() => start(() => switchOrganizationAction(m.organizationId))}>
              <span className="flex-1 truncate">{m.name}</span>
              <span className="text-[11px] text-muted">{m.role.toLowerCase()}</span>
              {m.organizationId === current.id ? <Check className="size-3.5 text-accent" /> : null}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild className={itemCls}>
            <Link href="/onboarding?new=1">
              <Plus className="size-4 text-muted" /> Add a company
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-full p-0.5 hover:bg-slate-100" aria-label="Account menu">
        <Avatar name={name} color="#0d9488" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[220px] rounded-lg border border-line bg-surface p-1 shadow-lg">
          <div className="px-2 py-2">
            <p className="text-sm font-medium text-ink">{name}</p>
            <p className="text-xs text-muted">{email}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-accent">{role.toLowerCase()}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild className={itemCls}>
            <Link href="/settings">
              <Settings className="size-4 text-muted" /> Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemCls} onSelect={() => logoutAction()}>
            <LogOut className="size-4 text-muted" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MobileNav({ allowed, badges }: { allowed: string[]; badges: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="rounded-md p-2 text-ink-2 hover:bg-slate-100 lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}>
        <Menu className="size-5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Navigation" side="left" className="bg-ink text-white [&>div:first-child]:border-white/10 [&_h2]:text-white">
          <div className="-mx-5 -my-4 flex h-full flex-col">
            <Brand />
            <SidebarNav allowed={allowed} badges={badges} onNavigate={() => setOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
